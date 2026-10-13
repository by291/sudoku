<script setup lang="ts">
import { nextTick, onUnmounted, useId, useTemplateRef, watch } from 'vue'
import { NModal } from 'naive-ui'

withDefaults(
  defineProps<{
    title: string
    description: string
    confirmLabel?: string
    destructive?: boolean
  }>(),
  {
    confirmLabel: '确认',
    destructive: false,
  },
)
defineEmits<{ confirm: []; cancel: [] }>()
const descriptionId = useId()
const previousFocus = document.activeElement
const descriptionContent = useTemplateRef<HTMLElement>('descriptionContent')
watch(
  descriptionContent,
  (content) => {
    // The teleported content may mount without an enter transition. Focus its first action.
    content?.closest('[role="dialog"]')?.querySelector('button')?.focus()
  },
  { flush: 'post' },
)
onUnmounted(async () => {
  // Restore after the teleported modal and its focus trap have been removed.
  await nextTick()
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
    previousFocus.focus()
  }
})
</script>
<template>
  <NModal
    preset="dialog"
    class="confirmation"
    :show="true"
    :auto-focus="false"
    :mask-closable="false"
    :closable="false"
    :show-icon="false"
    :title="title"
    :aria-label="title"
    :aria-describedby="descriptionId"
    negative-text="取消"
    :positive-text="confirmLabel"
    :negative-button-props="{ size: 'medium', ghost: false }"
    :positive-button-props="{ size: 'medium', type: destructive ? 'error' : 'primary' }"
    @esc="$emit('cancel')"
    @negative-click="$emit('cancel')"
    @positive-click="$emit('confirm')"
  >
    <p :id="descriptionId" ref="descriptionContent" class="muted">{{ description }}</p>
  </NModal>
</template>
<style scoped>
.confirmation {
  width: min(440px, calc(100vw - 32px));
  margin: auto;
}
</style>
