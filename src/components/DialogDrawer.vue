<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import Dialog from './Dialog.vue'

const visible = defineModel('visible', {
  type: Boolean,
  default: false,
})

const props = defineProps({
  closable: { type: Boolean, default: false },
  dismissableMask: { type: Boolean, default: true },
  draggable: { type: Boolean, default: true },
})

const emits = defineEmits(['open', 'close', 'closed'])

const breakpoints = useBreakpoints(breakpointsTailwind)
const breakpointMDAndUp = breakpoints.greaterOrEqual('md')

const drawerRef = ref()
const drawerHandleRef = ref()

const touchStartYPos = ref(0)
const drawerStartHeight = ref(0)
const drawerIsMoving = ref(false)
const drawerIsMovingBack = ref(false)
const deltaY = ref(0)
const keyboardHeight = ref(0)
const blurReady = ref(false)

const ANIMATION_DURATION = 350

const onMaskClick = () => {
  if (props.dismissableMask)
    visible.value = false
}

function open() {
  nextTick(() => { visible.value = true })
}

defineExpose({ open })

const onTouchStart = (e) => {
  touchStartYPos.value = e.touches[0].clientY
  drawerIsMoving.value = true
  if (drawerRef.value) {
    drawerStartHeight.value = drawerRef.value.clientHeight
    drawerRef.value.style.height = `${drawerStartHeight.value}px`
  }
}

const onTouchMove = (e) => {
  const touchEndYPos = e.touches[0].clientY
  deltaY.value = touchStartYPos.value - touchEndYPos
  requestAnimationFrame(() => {
    if (!drawerRef.value) return
    if (deltaY.value > 0)
      drawerRef.value.style.height = `${drawerStartHeight.value + deltaY.value}px`
    else
      drawerRef.value.style.height = `${drawerStartHeight.value - Math.abs(deltaY.value)}px`
  })
}

const onTouchEnd = () => {
  drawerIsMovingBack.value = true
  drawerIsMoving.value = false
  if (deltaY.value < -100)
    visible.value = false

  const height = drawerStartHeight.value + 0
  setTimeout(() => {
    if (drawerRef.value)
      drawerRef.value.style.height = `${height}px`
    touchStartYPos.value = 0
    drawerStartHeight.value = 0
    setTimeout(() => {
      if (drawerRef.value)
        drawerRef.value.style.height = ''
      drawerIsMovingBack.value = false
    }, ANIMATION_DURATION)
  }, 1)
}

const onScrollWhenInputFocused = (e) => {
  e.preventDefault()
  e.stopPropagation()
  document.documentElement.scrollTop = 0
}

const onVisualViewportResize = () => {
  if (breakpointMDAndUp.value)
    return

  if (
    visible.value
    && window.visualViewport.height < window.innerHeight
    && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
  ) {
    document.documentElement.scrollTop = 0
    window.addEventListener('scroll', onScrollWhenInputFocused, { passive: true })
    keyboardHeight.value = window.innerHeight - window.visualViewport.height
  } else {
    window.removeEventListener('scroll', onScrollWhenInputFocused)
    keyboardHeight.value = 0
  }
}

onBeforeUnmount(() => {
  window.visualViewport.removeEventListener('resize', onVisualViewportResize)
  window.removeEventListener('scroll', onScrollWhenInputFocused)
})

onMounted(() => {
  window.visualViewport.addEventListener('resize', onVisualViewportResize)
})

watch(
  () => visible.value,
  (v) => {
    if (v) {
      document.body.style.overflowY = 'hidden'
      document.documentElement.style.overflowY = 'hidden'
      emits('open')
      setTimeout(() => { blurReady.value = true }, ANIMATION_DURATION)
    } else {
      blurReady.value = false
      emits('close')
      setTimeout(() => {
        document.body.style.overflowY = 'auto'
        document.documentElement.style.overflowY = 'auto'
        emits('closed')
      }, ANIMATION_DURATION)
    }
  }
)
</script>

<template>
  <Teleport
    v-if="!breakpointMDAndUp"
    to="body"
  >
    <div>
      <Transition name="transition--fade">
        <div
          v-if="visible"
          class="fixed top-0 left-0 z-50 w-screen h-dvh bg-black opacity-50"
          @click="onMaskClick"
        />
      </Transition>
      <div
        ref="drawerRef"
        class="dialog-drawer fixed bottom-0 left-0 z-50 flex flex-col w-full h-auto border border-neutral-200 dark:border-neutral-800 drop-shadow-lg rounded-t-3xl"
        :class="{
          'translate-y-0': visible,
          'translate-y-full': !visible,
          'dialog-drawer--moving': drawerIsMoving,
          'max-h-[80vh]': !drawerIsMoving && !drawerIsMovingBack,
          'dialog-drawer--settled': blurReady
        }"
        :style="keyboardHeight ? `height: calc(100vh - ${keyboardHeight}px); max-height: calc(100vh - ${keyboardHeight}px); position: fixed; bottom: unset; top: 0; transform: none` : ''"
      >
        <div
          ref="drawerHandleRef"
          class="dialog-drawer__handle absolute -top-6 left-0 z-10 flex justify-center items-center w-full h-20 pt-8 pb-12 md:h-12"
          @touchstart.passive="onTouchStart"
          @touchmove.passive="onTouchMove"
          @touchend.passive="onTouchEnd"
        >
          <div class="w-24 h-1 mt-1 bg-neutral-400 dark:bg-neutral-600 rounded-full" />
        </div>
        <div
          v-if="$slots.header"
          class="pointer-events-none relative z-20 flex-none flex justify-between items-center mt-4 px-4 pb-4"
        >
          <div class="flex-1 mt-2">
            <p class="text-xl! font-semibold text-black dark:text-white">
              <slot name="header" />
            </p>
          </div>
        </div>
        <div class="dialog-drawer__content px-4 pt-4 pb-8 overflow-y-auto">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
  <Dialog
    v-else
    v-model:visible="visible"
    modal
    :closable="closable"
    :draggable="draggable"
    :dismissable-mask="dismissableMask"
  >
    <template #header>
      <div
        v-if="$slots.header"
        class="w-full flex justify-between items-center pb-3"
      >
        <div class="flex-1">
          <p class="text-lg font-[450] text-black dark:text-white">
            <slot name="header" />
          </p>
        </div>
      </div>
    </template>
    <slot />
  </Dialog>
</template>

<style>
.dialog-drawer {
  overscroll-behavior: contain;
  touch-action: none;
  will-change: transform;

  /* Default: opaque background, no blur */
  background: rgb(255 255 255);
  backdrop-filter: blur(0px);
  transition: background .4s ease, backdrop-filter .4s ease;
}

.dark .dialog-drawer {
  background: rgb(23 23 23);
}

/* Settled: translucent + blur */
.dialog-drawer.dialog-drawer--settled {
  background: linear-gradient(to bottom left, rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.8));
  backdrop-filter: blur(12px);
}

.dark .dialog-drawer.dialog-drawer--settled {
  background: linear-gradient(to bottom left, rgb(23 23 23 / 0.8), rgb(23 23 23 / 0.5));
  backdrop-filter: blur(24px);
}

.dialog-drawer .dialog-drawer__handle {
  touch-action: pan-y;
}

.dialog-drawer:not(.dialog-drawer--moving) {
  height: calc-size(auto, size);
  transition: height .25s cubic-bezier(0.17, 0.67, 0.16, 0.99),
              transform .35s cubic-bezier(0.17, 0.67, 0.16, 0.99),
              translate .35s cubic-bezier(0.17, 0.67, 0.16, 0.99),
              background .4s ease,
              backdrop-filter .4s ease;
}

.dialog-drawer__content {
  height: calc-size(auto, size);
  transition: height .25s cubic-bezier(0.17, 0.67, 0.16, 0.99);
}

.transition--fade-enter-active,
.transition--fade-leave-active {
  transition: opacity 0.15s linear;
}
.transition--fade-enter-from,
.transition--fade-leave-to {
  opacity: 0 !important;
}
</style>
