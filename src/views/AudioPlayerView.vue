<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDark } from '@vueuse/core'
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward,
  Rewind, FastForward, Download, List, Loader2,
} from 'lucide-vue-next'
import { fetchBookDetails } from '../services/api.js'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const isDark = useDark()

const bookId = route.params.id
const bookInfo = ref(null)
const chapters = ref([])
const loading = ref(true)
const error = ref(null)
const showChapters = ref(false)

// Audio state
const audioEl = ref(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const buffered = ref(0)
const playbackRate = ref(1)
const seeking = ref(false)

const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2]

const currentChapter = computed(() => {
  const t = currentTime.value * 1000
  for (let i = chapters.value.length - 1; i >= 0; i--) {
    if (t >= chapters.value[i].startMs) return i
  }
  return 0
})

const progressPercent = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const bufferedPercent = computed(() => {
  if (!duration.value) return 0
  return (buffered.value / duration.value) * 100
})

function formatTime(seconds) {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Parse ID3v2 CHAP frames from the beginning of an MP3
async function parseChapters(url) {
  // First pass: fetch just the 10-byte ID3 header to get the real tag size
  const headerRes = await fetch(url, { headers: { Range: 'bytes=0-9' } })
  const headerBuf = await headerRes.arrayBuffer()
  const headerBytes = new Uint8Array(headerBuf)

  if (String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2]) !== 'ID3') return []

  // Syncsafe integer for tag size (bytes 6-9)
  const tagSize = (headerBytes[6] << 21) | (headerBytes[7] << 14) | (headerBytes[8] << 7) | headerBytes[9]
  const totalSize = 10 + tagSize // header + body

  // Second pass: fetch the entire ID3 tag
  const res = await fetch(url, { headers: { Range: `bytes=0-${totalSize - 1}` } })
  const buf = await res.arrayBuffer()
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  const endOfTag = Math.min(totalSize, buf.byteLength)

  const parsed = []
  let pos = 10

  while (pos + 10 < endOfTag) {
    const frameId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])
    const frameSize = view.getUint32(pos + 4)
    const frameStart = pos + 10 // 4 id + 4 size + 2 flags

    if (frameSize === 0 || frameSize > endOfTag - frameStart) break

    if (frameId === 'CHAP') {
      // Element ID (null-terminated string)
      let i = frameStart
      while (i < frameStart + frameSize && bytes[i] !== 0) i++
      i++ // skip null

      const startMs = view.getUint32(i)
      const endMs = view.getUint32(i + 4)
      i += 16 // skip startMs, endMs, startOffset, endOffset

      // Look for TIT2 sub-frame
      let title = ''
      if (i + 10 < frameStart + frameSize) {
        const subId = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3])
        const subSize = view.getUint32(i + 4)
        if (subId === 'TIT2' && subSize > 0) {
          const encoding = bytes[i + 10]
          const textStart = i + 11
          const textEnd = i + 10 + subSize
          if (encoding === 1) {
            // UTF-16 with BOM
            const start = textStart + 2 // skip BOM
            const arr = []
            for (let j = start; j + 1 < textEnd; j += 2) {
              const code = bytes[j] | (bytes[j + 1] << 8) // LE
              if (code === 0) break
              arr.push(code)
            }
            title = String.fromCharCode(...arr)
          } else {
            // ISO-8859-1 or UTF-8
            const arr = []
            for (let j = textStart; j < textEnd; j++) {
              if (bytes[j] === 0) break
              arr.push(bytes[j])
            }
            title = new TextDecoder().decode(new Uint8Array(arr))
          }
        }
      }

      parsed.push({ title: title || `Chapter ${parsed.length + 1}`, startMs, endMs })
    }

    pos = frameStart + frameSize
  }

  return parsed
}

function togglePlay() {
  if (!audioEl.value) return
  if (playing.value) audioEl.value.pause()
  else audioEl.value.play()
}

function seekTo(seconds) {
  if (!audioEl.value) return
  audioEl.value.currentTime = seconds
}

function seekRelative(delta) {
  if (!audioEl.value) return
  audioEl.value.currentTime = Math.max(0, Math.min(duration.value, audioEl.value.currentTime + delta))
}

function goToChapter(index) {
  if (!chapters.value[index]) return
  seekTo(chapters.value[index].startMs / 1000)
  showChapters.value = false
  if (!playing.value) audioEl.value?.play()
}

function prevChapter() {
  const idx = currentChapter.value
  // If more than 3s into current chapter, restart it; otherwise go to previous
  const chapterStartSec = chapters.value[idx]?.startMs / 1000 || 0
  if (currentTime.value - chapterStartSec > 3 || idx === 0) {
    seekTo(chapterStartSec)
  } else {
    goToChapter(idx - 1)
  }
}

function nextChapter() {
  const idx = currentChapter.value
  if (idx < chapters.value.length - 1) goToChapter(idx + 1)
}

function cycleSpeed() {
  const idx = speeds.indexOf(playbackRate.value)
  playbackRate.value = speeds[(idx + 1) % speeds.length]
  if (audioEl.value) audioEl.value.playbackRate = playbackRate.value
}

function onProgressClick(e) {
  if (!duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  seekTo(pct * duration.value)
}

const downloading = ref(false)

async function handleDownload() {
  if (downloading.value) return
  downloading.value = true
  try {
    const title = bookInfo.value?.title || bookId
    const filename = title.replace(/[<>:"/\\|?*]+/g, '').trim() || bookId
    const res = await fetch(`/api-audio/${bookId}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.mp3`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Download failed:', e)
  } finally {
    downloading.value = false
  }
}

// Keyboard shortcuts
function onKeydown(e) {
  if (e.target.tagName === 'INPUT') return
  switch (e.code) {
    case 'Space': e.preventDefault(); togglePlay(); break
    case 'ArrowLeft': e.preventDefault(); seekRelative(-10); break
    case 'ArrowRight': e.preventDefault(); seekRelative(10); break
  }
}

onMounted(async () => {
  try {
    // Fetch book info
    const details = await fetchBookDetails([bookId])
    bookInfo.value = details.find(d => d.productId === bookId) || details[0] || null

    // Parse chapters from the audio stream
    chapters.value = await parseChapters(`/api-audio/${bookId}`)

    loading.value = false
  } catch (e) {
    error.value = e.message
    loading.value = false
  }

  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="h-screen flex flex-col bg-neutral-100 dark:bg-neutral-950">
    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <Loader2 class="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
        <p class="text-neutral-500">{{ t('audio.loading') }}</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <p class="text-red-500 mb-4">{{ t('audio.loadError', { error }) }}</p>
        <button @click="router.push({ name: 'library' })" class="text-primary-500 hover:underline">
          {{ t('audio.backToLibrary') }}
        </button>
      </div>
    </div>

    <!-- Player -->
    <template v-else>
      <!-- Hidden audio element -->
      <audio
        ref="audioEl"
        :src="`/api-audio/${bookId}`"
        preload="auto"
        @play="playing = true"
        @pause="playing = false"
        @timeupdate="currentTime = $event.target.currentTime"
        @durationchange="duration = $event.target.duration"
        @progress="buffered = $event.target.buffered.length ? $event.target.buffered.end($event.target.buffered.length - 1) : 0"
      />

      <!-- Top bar -->
      <header class="flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-200 dark:border-neutral-800">
        <button @click="router.push({ name: 'library' })" class="p-2.5 rounded-full text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {{ bookInfo?.title || '' }}
          </h1>
          <p v-if="bookInfo?.authors?.length" class="text-sm text-neutral-500 dark:text-neutral-400 truncate">
            {{ bookInfo.authors.map(a => a.name).join(', ') }}
            <template v-if="bookInfo?.narrators?.length">
              · {{ t('audio.narrator', { name: bookInfo.narrators.map(n => n.name).join(', ') }) }}
            </template>
          </p>
        </div>
        <button @click="showChapters = !showChapters" :class="['p-2.5 rounded-full transition-colors', showChapters ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800']">
          <List class="w-5 h-5" />
        </button>
      </header>

      <!-- Main content area -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Cover + current chapter -->
        <div class="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div class="w-full max-w-xs sm:max-w-sm aspect-square rounded-2xl overflow-hidden shadow-2xl">
            <img
              v-if="bookInfo?.imageLarge || bookInfo?.imageSmall"
              :src="bookInfo.imageLarge || bookInfo.imageSmall"
              :alt="bookInfo.title"
              class="w-full h-full object-cover"
            />
          </div>
          <div v-if="chapters.length" class="text-center">
            <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {{ chapters[currentChapter]?.title }}
            </p>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {{ currentChapter + 1 }} / {{ chapters.length }}
            </p>
          </div>
        </div>

        <!-- Chapters panel (side panel on desktop, overlay on mobile) -->
        <Transition name="slide-panel">
          <div v-if="showChapters" class="w-full sm:w-80 sm:border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-y-auto absolute sm:relative inset-0 top-[61px] z-10">
            <div class="p-4">
              <h2 class="font-display text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                {{ t('audio.chapters') }}
              </h2>
              <div class="space-y-0.5">
                <button
                  v-for="(chapter, i) in chapters"
                  :key="i"
                  @click="goToChapter(i)"
                  :class="[
                    'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-3',
                    i === currentChapter
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  ]"
                >
                  <span class="text-xs text-neutral-400 dark:text-neutral-500 w-10 shrink-0 tabular-nums">
                    {{ formatTime(chapter.startMs / 1000) }}
                  </span>
                  <span class="truncate">{{ chapter.title }}</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Player controls (bottom bar) -->
      <div class="bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 px-4 pb-[env(safe-area-inset-bottom)]">
        <!-- Progress bar -->
        <div class="py-3">
          <div
            class="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full cursor-pointer relative group"
            @click="onProgressClick"
          >
            <!-- Buffered -->
            <div class="absolute inset-y-0 left-0 bg-neutral-300 dark:bg-neutral-600 rounded-full" :style="{ width: bufferedPercent + '%' }" />
            <!-- Progress -->
            <div class="absolute inset-y-0 left-0 bg-primary-500 rounded-full" :style="{ width: progressPercent + '%' }" />
            <!-- Thumb -->
            <div
              class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              :style="{ left: `calc(${progressPercent}% - 7px)` }"
            />
            <!-- Chapter markers -->
            <div
              v-for="(chapter, i) in chapters.slice(1)"
              :key="i"
              class="absolute top-0 bottom-0 w-px bg-neutral-400/30 dark:bg-neutral-500/30"
              :style="{ left: (chapter.startMs / 1000 / duration * 100) + '%' }"
            />
          </div>
          <div class="flex justify-between text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 tabular-nums">
            <span>{{ formatTime(currentTime) }}</span>
            <span>-{{ formatTime(Math.max(0, duration - currentTime)) }}</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-center gap-3 pb-4">
          <!-- Speed -->
          <button
            @click="cycleSpeed"
            class="text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-2 py-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors min-w-[3rem] tabular-nums"
          >
            {{ playbackRate }}x
          </button>

          <!-- Skip back -->
          <button @click="prevChapter" class="p-2.5 rounded-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <SkipBack class="w-5 h-5" />
          </button>

          <!-- Rewind 30s -->
          <button @click="seekRelative(-30)" class="p-2.5 rounded-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <Rewind class="w-5 h-5" />
          </button>

          <!-- Play/Pause -->
          <button
            @click="togglePlay"
            class="p-4 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg transition-colors"
          >
            <Pause v-if="playing" class="w-7 h-7" />
            <Play v-else class="w-7 h-7" />
          </button>

          <!-- Forward 30s -->
          <button @click="seekRelative(30)" class="p-2.5 rounded-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <FastForward class="w-5 h-5" />
          </button>

          <!-- Skip forward -->
          <button @click="nextChapter" class="p-2.5 rounded-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <SkipForward class="w-5 h-5" />
          </button>

          <!-- Download -->
          <button
            @click="handleDownload"
            :disabled="downloading"
            class="p-2.5 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            <Loader2 v-if="downloading" class="w-5 h-5 animate-spin" />
            <Download v-else class="w-5 h-5" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: translate 0.3s ease, opacity 0.3s ease;
}
.slide-panel-enter-from {
  translate: 100% 0;
  opacity: 0;
}
.slide-panel-leave-to {
  translate: 100% 0;
  opacity: 0;
}
</style>
