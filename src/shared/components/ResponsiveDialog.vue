<script setup lang="ts">
import { NModal } from 'naive-ui'

withDefaults(
  defineProps<{
    show: boolean
    title: string
    maxWidth?: number
    closable?: boolean
    autoFocus?: boolean
    maskClosable?: boolean
  }>(),
  { maxWidth: 640, closable: true, autoFocus: true, maskClosable: true },
)
defineEmits<{ 'update:show': [show: boolean]; afterLeave: [] }>()
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="title"
    :aria-label="title"
    role="dialog"
    aria-modal="true"
    class="responsive-dialog"
    :style="{ '--dialog-width': `${maxWidth}px` }"
    :closable="closable"
    :auto-focus="autoFocus"
    :mask-closable="maskClosable"
    @update:show="$emit('update:show', $event)"
    @after-leave="$emit('afterLeave')"
  >
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </NModal>
</template>

<style>
/* Naive UI 2.45.3 teleports its preset card without the caller's SFC scope attribute. */
.responsive-dialog.n-card {
  width: min(var(--dialog-width), calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  margin: 24px auto;
}
.responsive-dialog.n-card > .n-card-content {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.responsive-dialog.n-card > .n-card-header,
.responsive-dialog.n-card > .n-card__footer {
  flex-shrink: 0;
}
@media (max-width: 600px) {
  .responsive-dialog.n-card {
    position: fixed;
    inset: auto 0 0;
    width: 100%;
    max-height: calc(100dvh - 16px);
    margin: 0;
    border-radius: 20px 20px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .responsive-dialog.n-card > .n-card-header,
  .responsive-dialog.n-card > .n-card-content,
  .responsive-dialog.n-card > .n-card__footer {
    padding-left: 20px;
    padding-right: 20px;
  }
}
</style>
