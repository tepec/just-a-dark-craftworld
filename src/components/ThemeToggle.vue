<script setup>
import { useToggle } from '@vueuse/core'
import { useDark } from '@vueuse/core'
import { Sun, Moon } from 'lucide-vue-next'

const isDark = useDark()
const toggleDark = useToggle(isDark)
</script>

<template>
  <button
    @click="toggleDark()"
    class="p-2.5 rounded-full text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
    :title="isDark ? 'Mode clair' : 'Mode sombre'"
  >
    <Moon v-if="!isDark" class="w-5 h-5" />
    <Sun v-else class="w-5 h-5" />
  </button>
</template>
