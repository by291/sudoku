<script setup lang="ts">
import { NButton, NSpin } from 'naive-ui'

defineProps<{ failed: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <main class="application-loading" aria-label="数独加载">
    <section class="panel application-state" :aria-busy="!failed">
      <h1>数独</h1>
      <div v-if="!failed" role="status" aria-atomic="true">
        <NSpin size="medium" aria-hidden="true" />
        <p>正在打开数独…</p>
      </div>
      <div v-else role="alert">
        <p>页面加载失败，请重试。</p>
        <NButton type="primary" @click="$emit('retry')">重试</NButton>
      </div>
    </section>
  </main>
</template>

<style scoped>
.application-loading {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: 24px;
}

.application-state {
  width: min(100%, 420px);
  text-align: center;
}

.application-state h1 {
  margin: 0 0 24px;
  font-size: 24px;
}
</style>
