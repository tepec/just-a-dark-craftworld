<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  align: { type: String, default: 'right' },
  width: { type: String, default: 'w-56' },
  panelClass: { type: String, default: '' },
})

const isOpen = defineModel('open', { default: false })

const triggerRef = ref(null)

function close() { isOpen.value = false }
function toggle() { isOpen.value = !isOpen.value }

const dropdownPosition = computed(() => {
  if (!triggerRef.value) return {}
  const rect = triggerRef.value.getBoundingClientRect()
  const style = {}
  if (props.align === 'right')
    style.right = `${window.innerWidth - rect.right}px`
  else
    style.left = `${rect.left}px`
  style.top = `${rect.bottom + 8}px`
  return style
})

defineExpose({ close, toggle })
</script>

<template>
  <div class="relative">
    <div ref="triggerRef" @click="toggle">
      <slot name="trigger" :is-open="isOpen" :toggle="toggle" />
    </div>
    <Teleport to="body">
      <Transition name="backdrop">
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[60]"
          @click="close"
        />
      </Transition>

      <Transition name="dropdown-down">
        <div
          v-if="isOpen"
          class="fixed z-[70] py-2 rounded-xl shadow-xl overflow-hidden bg-white/90 dark:bg-neutral-800/90 backdrop-blur-md border border-neutral-200/50 dark:border-neutral-700/50"
          :class="[width, align === 'right' ? 'origin-top-right' : 'origin-top-left', panelClass]"
          :style="dropdownPosition"
        >
          <div class="dropdown-content">
            <slot :close="close" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}

.dropdown-down-enter-active {
  transition: opacity 0.2s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-down-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-down-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
.dropdown-down-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.dropdown-content :deep(.dropdown-item) {
  animation: dropdownItemIn 0.4s var(--transition-easing, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
  animation-delay: calc(var(--item-index, 0) * 0.04s + 0.08s);
  opacity: 0;
}

@keyframes dropdownItemIn {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
