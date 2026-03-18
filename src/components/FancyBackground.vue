<script setup>
</script>

<template>
  <div class="fixed inset-0 pointer-events-none">
    <div class="absolute inset-0 bg-white dark:bg-neutral-950" />
    <div class="absolute inset-0 dot-pattern" />
    <div class="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E');" />
    <div class="absolute -top-56 right-1/4 w-96 h-96 bg-primary-500/10 dark:bg-primary-500/5 rounded-full blur-3xl" />
  </div>
</template>

<style>
.dot-pattern {
  background-image: radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px);
  background-size: 24px 24px;
}

.dark .dot-pattern {
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
}
</style>
