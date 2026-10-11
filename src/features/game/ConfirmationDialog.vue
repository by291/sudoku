<script setup lang="ts">
import { onMounted, onScopeDispose, useTemplateRef } from 'vue'
withDefaults(defineProps<{ title: string; description: string; confirmLabel?: string }>(), {
  confirmLabel: '确认',
})
defineEmits<{ confirm: []; cancel: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let previousFocus: Element | null = null
onMounted(() => {
  previousFocus = document.activeElement
  dialog.value?.showModal()
})
onScopeDispose(() => {
  if (previousFocus instanceof HTMLElement) previousFocus.focus()
})
</script>
<template>
  <dialog ref="dialog" aria-labelledby="confirmation-title" @cancel.prevent="$emit('cancel')">
    <h2 id="confirmation-title">{{ title }}</h2>
    <p>{{ description }}</p>
    <div class="button-row">
      <button autofocus @click="$emit('cancel')">取消</button
      ><button class="primary" @click="$emit('confirm')">{{ confirmLabel }}</button>
    </div>
  </dialog>
</template>
<style scoped>
dialog {
  max-width: min(440px, calc(100% - 32px));
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
dialog::backdrop {
  background: #102a2a80;
  backdrop-filter: blur(3px);
}
h2 {
  margin-top: 0;
}
p {
  color: var(--muted);
}
</style>
