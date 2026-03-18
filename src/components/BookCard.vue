<script setup>
import { computed } from 'vue'
import { BookOpen, CheckCircle, Headphones } from 'lucide-vue-next'

const props = defineProps({
  book: { type: Object, required: true },
  progress: { type: Object, default: null },
})

const progressPercent = computed(() => {
  if (!props.progress) return 0
  if (props.progress.finished) return 100
  return Math.round((props.progress.percentage || 0) * 100)
})

const statusLabel = computed(() => {
  if (!props.progress) return null
  if (props.progress.finished) return 'Terminé'
  if (props.progress.percentage > 0) return `${progressPercent.value}%`
  return null
})

const isAudiobook = computed(() => props.book.productType === 'audiobook')
const coverUrl = computed(() => props.book.imageLarge || props.book.imageSmall || null)
const title = computed(() => props.book.title || 'Sans titre')
const author = computed(() => props.book.authors?.map(a => a.name).join(', ') || '')
const narrator = computed(() => props.book.narrators?.map(n => n.name).join(', ') || '')
</script>

<template>
  <router-link
    :to="isAudiobook
      ? { name: 'audio', params: { id: book.productId } }
      : { name: 'reader', params: { id: book.productId } }"
    class="group block bg-white dark:bg-neutral-800 rounded-xl overflow-hidden shadow-sm border border-neutral-200 dark:border-neutral-700 hover:shadow-lg hover:border-primary-400 dark:hover:border-primary-500 transition-all duration-300"
  >
    <div class="aspect-[2/3] bg-neutral-100 dark:bg-neutral-700 relative overflow-hidden">
      <img
        v-if="coverUrl"
        :src="coverUrl"
        :alt="title"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-neutral-400 dark:text-neutral-500">
        <BookOpen class="w-12 h-12" :stroke-width="1.2" />
      </div>

      <!-- Audiobook badge -->
      <div v-if="isAudiobook" class="absolute top-2 left-2">
        <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full backdrop-blur-sm bg-amber-500/90 text-white">
          <Headphones class="w-3 h-3" />
        </span>
      </div>

      <!-- Progress badge -->
      <div v-if="statusLabel" class="absolute top-2 right-2">
        <span
          :class="[
            'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full backdrop-blur-sm',
            progress?.finished
              ? 'bg-emerald-500/90 text-white'
              : 'bg-primary-600/90 text-white'
          ]"
        >
          <CheckCircle v-if="progress?.finished" class="w-3 h-3" />
          {{ statusLabel }}
        </span>
      </div>

      <!-- Progress bar -->
      <div v-if="progress && !progress.finished && progressPercent > 0" class="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
        <div class="h-full bg-primary-500 transition-all duration-300" :style="{ width: progressPercent + '%' }"></div>
      </div>
    </div>

    <div class="p-3">
      <h3 class="font-display text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
        {{ title }}
      </h3>
      <p v-if="author" class="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">{{ author }}</p>
      <p v-if="narrator" class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 line-clamp-1 flex items-center gap-1">
        <Headphones class="w-3 h-3 shrink-0" />
        {{ narrator }}
      </p>
    </div>
  </router-link>
</template>
