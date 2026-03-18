<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDark, useToggle } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import ePub from 'epubjs'
import {
  ArrowLeft, MoreVertical, CheckCircle, Trash2, Loader2,
  Settings, Minus, Plus, Columns2, BookOpen, ScrollText,
  ChevronLeft, ChevronRight, List, Download,
} from 'lucide-vue-next'
import Dropdown from '../components/Dropdown.vue'
import DialogDrawer from '../components/DialogDrawer.vue'
import { fetchEpubBlob } from '../services/api.js'
import { useProgress } from '../composables/useProgress.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const bookId = route.params.id
const isDark = useDark()
const toggleDark = useToggle(isDark)

const { progress, saveLocation, markFinished, deleteProgress } = useProgress(bookId)

const loading = ref(true)
const error = ref(null)
const showSettings = ref(false)
const showToc = ref(false)
const currentPercentage = ref(0)
const currentPage = ref(0)
const totalPages = ref(0)
const showPageInfo = ref(false)
const toc = ref([])
const viewerEl = ref(null)

let book = null
let rendition = null
let locationsGenerated = false
let epubBlob = null

// Reader settings
const SETTINGS_KEY = 'bl-reader-settings'
const defaultSettings = {
  fontSize: 100,
  fontFamily: 'default',
  margin: 48,
  flow: 'paginated',
  spread: 'auto',
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings }
  } catch { return { ...defaultSettings } }
}

const settings = ref(loadSettings())

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
}

const fonts = computed(() => [
  { key: 'default', label: t('reader.fontDefault'), css: '' },
  { key: 'serif', label: t('reader.fontSerif'), css: 'Georgia, "Times New Roman", serif' },
  { key: 'sans', label: t('reader.fontSans'), css: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { key: 'mono', label: t('reader.fontMono'), css: '"Courier New", Courier, monospace' },
])

function buildThemeCSS() {
  const dark = isDark.value
  const bg = dark ? '#171717' : '#ffffff'
  const fg = dark ? '#d4d4d4' : '#1a1a1a'
  const s = settings.value
  const fontDef = fonts.value.find(f => f.key === s.fontFamily)

  let css = `
    body, body *, p, div, span, a, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, figcaption, cite, em, strong, b, i, small, label, dt, dd { color: ${fg} !important; }
    body {
      background: ${bg} !important;
      font-size: ${s.fontSize}% !important;
      padding-top: ${s.margin}px !important;
      padding-bottom: ${s.margin}px !important;
      padding-left: ${s.margin}px !important;
      padding-right: ${s.margin}px !important;
      box-sizing: border-box !important;
    }
  `
  if (fontDef?.css) {
    css += `body, body *, p, span, div, li, td, th, h1, h2, h3, h4, h5, h6, blockquote { font-family: ${fontDef.css} !important; }`
  }
  return css
}

// Inject our CSS into each new content section as it loads
function injectThemeIntoContent(contents) {
  const css = buildThemeCSS()
  contents.addStylesheetCss(css, 'bl-reader-theme')
}

function applyTheme() {
  if (!rendition) return
  const contents = rendition.getContents()
  const css = buildThemeCSS()
  contents.forEach((content) => {
    content.addStylesheetCss(css, 'bl-reader-theme')
  })
}

function applyAllSettings() {
  if (!rendition) return
  applyTheme()
  rendition.spread(settings.value.spread)
}

function getCurrentCfi() {
  try {
    const loc = rendition?.currentLocation()
    return loc?.start?.cfi || null
  } catch { return null }
}

async function createRendition() {
  if (!book || !viewerEl.value) return

  const s = settings.value
  const isScrolled = s.flow === 'scrolled'

  rendition = book.renderTo(viewerEl.value, {
    width: '100%',
    height: '100%',
    flow: isScrolled ? 'scrolled' : 'paginated',
    manager: isScrolled ? 'continuous' : 'default',
    spread: s.spread,
    allowScriptedContent: false,
  })

  // Hook into content loading to inject our theme CSS into every new section
  rendition.hooks.content.register(injectThemeIntoContent)

  applyAllSettings()

  rendition.on('keydown', (e) => {
    if (e.key === 'ArrowLeft') rendition.prev()
    if (e.key === 'ArrowRight') rendition.next()
  })

  rendition.on('relocated', (location) => {
    if (!book?.locations || !locationsGenerated) return
    const percentage = book.locations.percentageFromCfi(location.start.cfi)
    currentPercentage.value = Math.round(percentage * 100)

    // Page info from locations
    const loc = book.locations.locationFromCfi(location.start.cfi)
    currentPage.value = loc + 1
    totalPages.value = book.locations.length()

    saveLocation(location.start.cfi, percentage)
  })
}

// Watch dark mode
watch(isDark, () => applyTheme())

// Watch settings
let lastFlow = settings.value.flow
watch(settings, async (newVal) => {
  persistSettings()
  if (!rendition || !book) return

  if (newVal.flow !== lastFlow) {
    const cfi = getCurrentCfi()
    lastFlow = newVal.flow
    rendition.destroy()
    viewerEl.value.innerHTML = ''
    await createRendition()
    await rendition.display(cfi || undefined)
  } else {
    applyAllSettings()
  }
}, { deep: true })

// Wheel navigation in paginated mode
let wheelDebounce = null
function onWheel(e) {
  if (!rendition || settings.value.flow === 'scrolled') return
  e.preventDefault()
  if (wheelDebounce) return
  wheelDebounce = setTimeout(() => { wheelDebounce = null }, 300)
  if (e.deltaY > 0 || e.deltaX > 0) rendition.next()
  else if (e.deltaY < 0 || e.deltaX < 0) rendition.prev()
}

function onDocKeydown(e) {
  if (e.key === 'ArrowLeft') rendition?.prev()
  if (e.key === 'ArrowRight') rendition?.next()
}

onMounted(async () => {
  try {
    const blob = await fetchEpubBlob(bookId)
    epubBlob = blob

    book = ePub()
    await book.open(blob)

    const nav = await book.loaded.navigation
    toc.value = nav.toc || []

    await nextTick()

    await createRendition()

    await book.locations.generate(1024)
    locationsGenerated = true

    const savedCfi = progress.value?.location || null
    await rendition.display(savedCfi || undefined)

    document.addEventListener('keydown', onDocKeydown)
    viewerEl.value?.addEventListener('wheel', onWheel, { passive: false })

    loading.value = false
  } catch (e) {
    error.value = t('reader.loadError', { error: e.message })
    loading.value = false
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocKeydown)
  viewerEl.value?.removeEventListener('wheel', onWheel)
  rendition?.destroy()
  book?.destroy()
})

function goBack() {
  router.push({ name: 'library' })
}

function handleMarkFinished() {
  markFinished()
  router.push({ name: 'library' })
}

function handleDeleteProgress() {
  if (confirm(t('reader.confirmDelete'))) {
    deleteProgress()
  }
}

function handleDownload() {
  if (!epubBlob) return
  const title = book?.packaging?.metadata?.title || bookId
  const filename = title.replace(/[<>:"/\\|?*]+/g, '').trim() || bookId
  const url = URL.createObjectURL(epubBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.epub`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function goToChapter(href) {
  rendition?.display(href)
  showToc.value = false
}

function adjustFontSize(delta) {
  settings.value.fontSize = Math.max(50, Math.min(250, settings.value.fontSize + delta))
}

function adjustMargin(delta) {
  settings.value.margin = Math.max(0, Math.min(120, settings.value.margin + delta))
}

const isSpreadDisabled = computed(() => settings.value.flow === 'scrolled')

const progressText = computed(() => {
  if (showPageInfo.value && totalPages.value > 0) {
    return t('reader.page', { current: currentPage.value, total: totalPages.value })
  }
  return `${currentPercentage.value}%`
})

const progressAnimating = ref(false)
function toggleProgressDisplay() {
  progressAnimating.value = true
  setTimeout(() => {
    showPageInfo.value = !showPageInfo.value
    setTimeout(() => { progressAnimating.value = false }, 200)
  }, 150)
}
</script>

<template>
  <div class="h-screen flex flex-col bg-neutral-200 dark:bg-neutral-950">
    <!-- Top bar -->
    <header class="flex items-center justify-between px-4 py-2 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shrink-0 z-20">
      <button
        @click="goBack"
        class="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
      >
        <ArrowLeft class="w-5 h-5" />
        <span class="font-display text-sm font-medium">{{ t('reader.library') }}</span>
      </button>

      <div class="flex items-center gap-1.5">
        <!-- Progress: click to toggle % / Page X of Y -->
        <button
          v-if="currentPercentage > 0 || totalPages > 0"
          @click="toggleProgressDisplay"
          class="text-xs font-medium text-neutral-400 dark:text-neutral-500 tabular-nums hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer select-none overflow-hidden"
        >
          <span
            class="inline-block transition-all duration-200 ease-out"
            :class="progressAnimating ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'"
          >
            {{ progressText }}
          </span>
        </button>

        <!-- TOC button -->
        <button
          @click="showToc = !showToc; showSettings = false"
          :class="[
            'p-2.5 rounded-full transition-colors',
            showToc
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
              : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          ]"
        >
          <List class="w-5 h-5" />
        </button>

        <!-- Settings button -->
        <button
          @click="showSettings = !showSettings; showToc = false"
          :class="[
            'p-2.5 rounded-full transition-colors',
            showSettings
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
              : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          ]"
        >
          <Settings class="w-5 h-5" />
        </button>

        <!-- Menu dropdown -->
        <Dropdown align="right" width="w-56">
          <template #trigger>
            <button
              class="p-2.5 rounded-full text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <MoreVertical class="w-5 h-5" />
            </button>
          </template>

          <template #default="{ close }">
            <button
              @click="handleDownload(); close()"
              class="dropdown-item w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/80 dark:hover:bg-neutral-700/50 transition-colors"
              :style="{ '--item-index': 0 }"
            >
              <Download class="w-4 h-4 text-primary-500" />
              {{ t('reader.download') }}
            </button>
            <button
              @click="handleMarkFinished(); close()"
              class="dropdown-item w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/80 dark:hover:bg-neutral-700/50 transition-colors"
              :style="{ '--item-index': 1 }"
            >
              <CheckCircle class="w-4 h-4 text-emerald-500" />
              {{ t('reader.markFinished') }}
            </button>
            <button
              @click="handleDeleteProgress(); close()"
              class="dropdown-item w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 text-red-500 hover:bg-neutral-100/80 dark:hover:bg-neutral-700/50 transition-colors"
              :style="{ '--item-index': 2 }"
            >
              <Trash2 class="w-4 h-4" />
              {{ t('reader.deleteProgress') }}
            </button>
          </template>
        </Dropdown>
      </div>
    </header>

    <!-- Settings (DialogDrawer) -->
    <DialogDrawer v-model:visible="showSettings" dismissable-mask closable>
      <template #header>{{ t('reader.settings') }}</template>
      <div class="flex flex-col gap-5 text-sm">
        <!-- Dark mode -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-neutral-700 dark:text-neutral-200">{{ t('reader.darkMode') }}</span>
          <button
            @click="toggleDark()"
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              isDark ? 'bg-primary-600' : 'bg-neutral-300 dark:bg-neutral-600'
            ]"
          >
            <span
              :class="[
                'inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform',
                isDark ? 'translate-x-6' : 'translate-x-1'
              ]"
            />
          </button>
        </div>

        <div class="h-px bg-neutral-200 dark:bg-neutral-700"></div>

        <!-- Font size -->
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-neutral-700 dark:text-neutral-200">{{ t('reader.fontSize') }}</label>
          <div class="flex items-center gap-1">
            <button @click="adjustFontSize(-10)" class="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
              <Minus class="w-4 h-4" />
            </button>
            <span class="text-neutral-700 dark:text-neutral-200 tabular-nums min-w-12 text-center font-medium">{{ settings.fontSize }}%</span>
            <button @click="adjustFontSize(10)" class="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Font family -->
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-neutral-700 dark:text-neutral-200">{{ t('reader.fontFamily') }}</label>
          <select
            v-model="settings.fontFamily"
            class="bg-neutral-100 dark:bg-neutral-800 border-none rounded-lg px-2.5 py-1.5 text-neutral-700 dark:text-neutral-200 text-sm focus:ring-2 focus:ring-primary-500/50"
          >
            <option v-for="f in fonts" :key="f.key" :value="f.key">{{ f.label }}</option>
          </select>
        </div>

        <!-- Margins -->
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-neutral-700 dark:text-neutral-200">{{ t('reader.margins') }}</label>
          <div class="flex items-center gap-1">
            <button @click="adjustMargin(-12)" class="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
              <Minus class="w-4 h-4" />
            </button>
            <span class="text-neutral-700 dark:text-neutral-200 tabular-nums min-w-12 text-center font-medium">{{ settings.margin }}px</span>
            <button @click="adjustMargin(12)" class="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="h-px bg-neutral-200 dark:bg-neutral-700"></div>

        <!-- Flow mode -->
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-neutral-700 dark:text-neutral-200">{{ t('reader.mode') }}</label>
          <div class="flex rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
            <button
              @click="settings.flow = 'paginated'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                settings.flow === 'paginated'
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              ]"
            >
              <BookOpen class="w-3.5 h-3.5" />
              {{ t('reader.pages') }}
            </button>
            <button
              @click="settings.flow = 'scrolled'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                settings.flow === 'scrolled'
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              ]"
            >
              <ScrollText class="w-3.5 h-3.5" />
              {{ t('reader.scroll') }}
            </button>
          </div>
        </div>

        <!-- Spread (disabled in scrolled mode) -->
        <div
          class="flex items-center justify-between transition-opacity"
          :class="{ 'opacity-40 pointer-events-none': isSpreadDisabled }"
        >
          <label class="text-sm font-medium text-neutral-700 dark:text-neutral-200">{{ t('reader.columns') }}</label>
          <div class="flex rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
            <button
              @click="settings.spread = 'none'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                settings.spread === 'none'
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              ]"
            >
              {{ t('reader.onePage') }}
            </button>
            <button
              @click="settings.spread = 'auto'"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                settings.spread === 'auto'
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              ]"
            >
              <Columns2 class="w-3.5 h-3.5" />
              {{ t('reader.twoPages') }}
            </button>
          </div>
        </div>
      </div>
    </DialogDrawer>

    <!-- TOC (DialogDrawer) -->
    <DialogDrawer v-model:visible="showToc" dismissable-mask closable>
      <template #header>{{ t('reader.toc') }}</template>
      <nav class="flex flex-col -mx-4">
        <button
          v-for="(item, i) in toc"
          :key="i"
          @click="goToChapter(item.href)"
          class="w-full text-left px-4 py-2.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
        >
          {{ item.label.trim() }}
        </button>
      </nav>
    </DialogDrawer>

    <!-- Main content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Reader area -->
      <main class="flex-1 overflow-hidden relative">
        <div v-if="loading" class="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 class="w-8 h-8 text-primary-500 animate-spin" />
          <span class="text-sm text-neutral-500 dark:text-neutral-400">{{ t('reader.loading') }}</span>
        </div>

        <div v-else-if="error" class="h-full flex flex-col items-center justify-center gap-4 px-4">
          <p class="text-red-500 text-center text-sm">{{ error }}</p>
          <button
            @click="goBack"
            class="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full font-medium shadow-sm transition-colors"
          >
            {{ t('reader.backToLibrary') }}
          </button>
        </div>

        <div
          ref="viewerEl"
          class="h-full w-full"
        ></div>

        <!-- Nav arrows (paginated only) -->
        <template v-if="!loading && !error && settings.flow === 'paginated'">
          <button
            @click="rendition?.prev()"
            class="absolute left-0 top-0 bottom-0 w-16 flex items-center justify-center text-neutral-300 dark:text-neutral-700 hover:text-neutral-500 dark:hover:text-neutral-400 hover:bg-black/3 dark:hover:bg-white/3 transition-all"
          >
            <ChevronLeft class="w-8 h-8" />
          </button>
          <button
            @click="rendition?.next()"
            class="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-center text-neutral-300 dark:text-neutral-700 hover:text-neutral-500 dark:hover:text-neutral-400 hover:bg-black/3 dark:hover:bg-white/3 transition-all"
          >
            <ChevronRight class="w-8 h-8" />
          </button>
        </template>
      </main>
    </div>
  </div>
</template>
