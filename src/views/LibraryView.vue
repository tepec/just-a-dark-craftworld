<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLibrary } from '../composables/useLibrary.js'
import { getAllProgress } from '../composables/useProgress.js'
import { Search, BookOpen, RefreshCw } from 'lucide-vue-next'
import BookCard from '../components/BookCard.vue'
import BookSkeleton from '../components/BookSkeleton.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import FancyBackground from '../components/FancyBackground.vue'
import Dropdown from '../components/Dropdown.vue'
import { ChevronDown } from 'lucide-vue-next'

const locales = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

const { t, locale } = useI18n()

const { books, loading, error, reload } = useLibrary()
const filter = ref('all')
const prevFilterIndex = ref(0)
const search = ref('')
const swipeDirection = ref('swipe-next')

// Track tab indicator position
const tabRefs = ref([])
const indicatorStyle = ref({})

function setTabRef(el, i) {
  if (el) tabRefs.value[i] = el
}

function updateIndicator() {
  const idx = filterKeys.indexOf(filter.value)
  const el = tabRefs.value[idx]
  if (el) {
    indicatorStyle.value = {
      left: el.offsetLeft + 'px',
      width: el.offsetWidth + 'px',
    }
  }
}

function setFilter(key) {
  const newIndex = filterKeys.indexOf(key)
  const oldIndex = filterKeys.indexOf(filter.value)
  swipeDirection.value = newIndex >= oldIndex ? 'swipe-next' : 'swipe-prev'
  prevFilterIndex.value = oldIndex
  filter.value = key
  nextTick(updateIndicator)
}

watch(locale, () => nextTick(updateIndicator))
onMounted(() => nextTick(updateIndicator))

const allProgress = computed(() => getAllProgress())

const filteredBooks = computed(() => {
  let list = books.value

  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(b => {
      const title = (b.title || '').toLowerCase()
      const author = (b.authors?.map(a => a.name).join(' ') || '').toLowerCase()
      return title.includes(q) || author.includes(q)
    })
  }

  if (filter.value !== 'all') {
    list = list.filter(b => {
      const id = b.productId
      const p = allProgress.value[id]
      switch (filter.value) {
        case 'finished': return p?.finished
        case 'reading': return p && !p.finished && p.percentage > 0
        case 'unread': return !p || (!p.finished && (!p.percentage || p.percentage === 0))
        default: return true
      }
    })
  }

  return list
})

function getProgress(book) {
  return allProgress.value[book.productId] || null
}

const filterKeys = ['all', 'reading', 'finished', 'unread']

const currentLocale = computed(() => locales.find(l => l.code === locale.value) || locales[0])
const otherLocales = computed(() => locales.filter(l => l.code !== locale.value))

function setLocale(code) {
  locale.value = code
  localStorage.setItem('bl-locale', code)
}
</script>

<template>
  <div class="min-h-screen relative">
    <FancyBackground />
    <!-- Header -->
    <header class="border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 shrink-0">
          <img src="/logo.webp" alt="Logo" class="w-8 h-8" />
          <h1 class="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            <span class="hidden sm:inline">{{ t('app.title') }}</span>
            <span class="sm:hidden">{{ t('app.titleShort') }}</span>
          </h1>
        </div>

        <!-- Search -->
        <div class="flex-1 max-w-md relative">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            v-model="search"
            type="text"
            :placeholder="t('library.search')"
            class="w-full bg-neutral-100 dark:bg-neutral-800 border border-transparent rounded-full pl-10 pr-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
          />
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Language selector -->
          <Dropdown align="right" width="w-40">
            <template #trigger>
              <button
                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
              >
                <span>{{ currentLocale.flag }}</span>
                <span class="font-medium">{{ currentLocale.label }}</span>
                <ChevronDown class="w-3.5 h-3.5 opacity-50" />
              </button>
            </template>

            <template #default="{ close }">
              <button
                v-for="(loc, i) in otherLocales"
                :key="loc.code"
                @click="setLocale(loc.code); close()"
                class="dropdown-item w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/80 dark:hover:bg-neutral-700/50 transition-colors"
                :style="{ '--item-index': i }"
              >
                <span>{{ loc.flag }}</span>
                <span>{{ loc.label }}</span>
              </button>
            </template>
          </Dropdown>

          <ThemeToggle />
        </div>
      </div>

      <!-- Filter tabs -->
      <div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div class="flex">
            <button
              v-for="(key, i) in filterKeys"
              :key="key"
              :ref="(el) => setTabRef(el, i)"
              @click="setFilter(key)"
              :class="[
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 relative',
                filter === key
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              ]"
            >
              {{ t(`library.filters.${key}`) }}
            </button>
          </div>
          <!-- Animated indicator -->
          <div
            class="absolute bottom-0 h-0.5 bg-primary-600 dark:bg-primary-400 transition-all duration-300"
            :style="indicatorStyle"
          />
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-1">
      <!-- Loading skeletons -->
      <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        <BookSkeleton v-for="i in 12" :key="i" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
          <BookOpen class="w-8 h-8 text-red-500" />
        </div>
        <p class="text-neutral-600 dark:text-neutral-400 mb-6">{{ error }}</p>
        <button
          @click="reload"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full font-medium shadow-sm transition-colors"
        >
          <RefreshCw class="w-4 h-4" />
          {{ t('library.retry') }}
        </button>
      </div>

      <!-- Empty -->
      <Transition :name="swipeDirection" mode="out-in">
        <div v-if="filteredBooks.length === 0 && !loading && !error" key="empty" class="text-center py-20">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 mb-4">
            <BookOpen class="w-8 h-8 text-neutral-400" />
          </div>
          <p v-if="books.length === 0" class="text-neutral-500">{{ t('library.empty') }}</p>
          <p v-else class="text-neutral-500">{{ t('library.noResults') }}</p>
        </div>

        <!-- Book grid -->
        <div v-else-if="!loading && !error" :key="filter" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          <BookCard
            v-for="book in filteredBooks"
            :key="book.productId"
            :book="book"
            :progress="getProgress(book)"
          />
        </div>
      </Transition>
    </main>
  </div>
</template>
