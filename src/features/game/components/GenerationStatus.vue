<script setup lang="ts">
import { NSpin } from 'naive-ui'

withDefaults(
  defineProps<{
    message?: string
    description?: string
  }>(),
  {
    message: '正在生成题目…',
    description: '正在检查唯一解与难度，请稍候。',
  },
)
</script>

<template>
  <div class="generation-status">
    <div class="generation-announcement" role="status" aria-live="polite" aria-atomic="true">
      <NSpin class="generation-spinner" :size="24" aria-hidden="true">
        <!-- Naive UI 2.45's default SVG animation ignores CSS reduced-motion rules. -->
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle class="spinner-track" cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round" />
          </svg>
        </template>
      </NSpin>
      <div class="generation-copy">
        <p class="generation-title">{{ message }}</p>
        <p class="generation-description">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.default" class="generation-actions"><slot /></div>
  </div>
</template>

<style scoped>
.generation-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: var(--accent-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.generation-announcement {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.generation-spinner {
  flex-shrink: 0;
  color: var(--accent);
}
.generation-spinner svg {
  display: block;
  width: 24px;
  height: 24px;
}
.spinner-track {
  opacity: 0.2;
}
.generation-copy {
  min-width: 0;
}
.generation-title {
  margin: 0;
  color: var(--text);
  font-weight: 600;
}
.generation-description {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.generation-actions {
  flex-shrink: 0;
}
.generation-actions :deep(button) {
  min-height: 44px;
}
@media (max-width: 440px) {
  .generation-status {
    flex-wrap: wrap;
    gap: 12px;
  }
  .generation-actions {
    margin-left: 36px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .generation-spinner :deep(.n-spin--rotate) {
    animation: none !important;
  }
}
</style>
