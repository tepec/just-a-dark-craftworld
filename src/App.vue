<script setup>
import { RouterView } from 'vue-router'
import { useDark } from '@vueuse/core'

useDark()
</script>

<template>
  <RouterView />
</template>
