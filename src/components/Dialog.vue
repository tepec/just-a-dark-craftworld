<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { onKeyStroke } from '@vueuse/core'

const visible = defineModel('visible', {
  type: Boolean,
  default: false
})

const props = defineProps({
  modal: { type: Boolean, default: false },
  closable: { type: Boolean, default: true },
  dismissableMask: { type: Boolean, default: true },
  draggable: { type: Boolean, default: false },
  header: { type: String, default: '' },
  pt: { type: Object, default: () => ({}) },
})

const emits = defineEmits(['show', 'hide'])

const dialogRef = ref()
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

const headerClasses = computed(() => {
  return [
    'px-6 py-4',
    props.draggable ? 'cursor-move' : '',
    props.pt.header || ''
  ].filter(Boolean).join(' ')
})

const contentClasses = computed(() => {
  return [
    'px-6 pb-6 flex-1',
    props.pt.content || ''
  ].filter(Boolean).join(' ')
})

const onMaskClick = () => {
  if (props.dismissableMask)
    visible.value = false
}

let startX, startY, initialX, initialY

const onMouseDown = (e) => {
  if (!props.draggable || e.button !== 0) return
  isDragging.value = true
  startX = e.clientX
  startY = e.clientY
  const rect = dialogRef.value.getBoundingClientRect()
  initialX = rect.left + rect.width / 2 - window.innerWidth / 2
  initialY = rect.top + rect.height / 2 - window.innerHeight / 2
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  e.preventDefault()
}

const onMouseMove = (e) => {
  if (!isDragging.value) return
  const deltaX = e.clientX - startX
  const deltaY = e.clientY - startY
  const newX = initialX + deltaX
  const newY = initialY + deltaY
  const rect = dialogRef.value.getBoundingClientRect()
  const minX = -window.innerWidth / 2 + rect.width / 2
  const maxX = window.innerWidth / 2 - rect.width / 2
  const minY = -window.innerHeight / 2 + rect.height / 2
  const maxY = window.innerHeight / 2 - rect.height / 2
  dragOffset.value = {
    x: Math.max(minX, Math.min(maxX, newX)),
    y: Math.max(minY, Math.min(maxY, newY)),
  }
}

const onMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

onKeyStroke('Escape', () => {
  if (props.closable && visible.value)
    visible.value = false
})

const handleBodyOverflow = (show) => {
  if (props.modal)
    document.body.style.overflow = show ? 'hidden' : ''
}

watch(() => visible.value, (newValue) => {
  handleBodyOverflow(newValue)
  emits(newValue ? 'show' : 'hide')
  if (newValue)
    dragOffset.value = { x: 0, y: 0 }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  handleBodyOverflow(false)
})

const dialogStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${dragOffset.value.x}px, ${dragOffset.value.y}px)`
}))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-mask">
      <div
        v-if="visible && modal"
        class="fixed inset-0 bg-black/50 z-40"
        @click="onMaskClick"
      />
    </Transition>

    <Transition name="dialog">
      <div
        v-if="visible"
        ref="dialogRef"
        :class="[
          'fixed bg-gradient-to-bl from-white/90 to-white/80 dark:from-neutral-900/80 dark:to-neutral-900/50 border border-neutral-200 dark:border-neutral-800 drop-shadow-lg backdrop-blur-md dark:backdrop-blur-xl z-50',
          'rounded-lg',
          'top-1/2 left-1/2',
          'max-w-[90vw] max-h-[90vh] min-w-[320px]',
          'flex flex-col',
          pt.root || ''
        ]"
        :style="dialogStyle"
      >
        <div
          v-if="$slots.header || header || closable"
          :class="headerClasses"
          @mousedown="onMouseDown"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 text-xl font-semibold text-black dark:text-white">
              <slot name="header">
                <span v-if="header">{{ header }}</span>
              </slot>
            </div>
            <button
              v-if="closable"
              type="button"
              class="p-2 mb-4 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full cursor-pointer"
              @click="visible = false"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>
        <div :class="`text-black dark:text-white ${contentClasses}`">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-mask-enter-active,
.dialog-mask-leave-active {
  transition: opacity 0.3s ease;
}
.dialog-mask-enter-from,
.dialog-mask-leave-to {
  opacity: 0;
}
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.7);
}
</style>
