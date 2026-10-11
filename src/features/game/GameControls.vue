<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { Digit } from '../../core/sudoku/types'
import NumberPad from '../../components/NumberPad.vue'
defineProps<{
  editable: boolean
  inputEditable: boolean
  selectionMessage: string
  noteMode: boolean
  canUndo: boolean
  canRedo: boolean
  hintLoading: boolean
}>()
defineEmits<{
  digit: [digit: Digit]
  erase: []
  note: []
  undo: []
  redo: []
  candidates: []
  check: []
  hint: []
}>()
</script>
<template>
  <section class="panel controls" aria-label="游戏操作">
    <div class="control-header">
      <h2>{{ noteMode ? '笔记模式' : '填写模式' }}</h2>
      <span class="muted">键盘 1–9</span>
    </div>
    <p class="selection-message" role="status">{{ selectionMessage }}</p>
    <NumberPad :disabled="!inputEditable" @digit="$emit('digit', $event)" />
    <div class="tools">
      <NButton
        :disabled="!editable"
        :aria-pressed="noteMode"
        :type="noteMode ? 'primary' : 'default'"
        :secondary="noteMode"
        @click="$emit('note')"
      >
        笔记 <kbd>N</kbd></NButton
      ><NButton :disabled="!inputEditable" @click="$emit('erase')">擦除</NButton
      ><NButton :disabled="!canUndo" @click="$emit('undo')">撤销</NButton
      ><NButton :disabled="!canRedo" @click="$emit('redo')">重做</NButton>
    </div>
    <h3>辅助工具</h3>
    <p class="muted small">使用以下工具会将本局记为「辅助完成」。</p>
    <div class="tools">
      <NButton :disabled="!editable || hintLoading" :loading="hintLoading" @click="$emit('hint')">
        {{ hintLoading ? '正在分析…' : '逻辑提示' }}</NButton
      ><NButton :disabled="!editable" @click="$emit('check')">检查填写</NButton
      ><NButton :disabled="!editable" @click="$emit('candidates')">生成候选数</NButton>
    </div>
  </section>
</template>
<style scoped>
.controls {
  padding: 22px;
}
.control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h2 {
  font-size: 18px;
  margin: 0;
}
.control-header span {
  font-size: 12px;
}
.selection-message {
  min-height: 24px;
  margin: 8px 0 16px;
  color: var(--muted);
  font-size: 14px;
}
.tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.tools button {
  flex: 1;
}
h3 {
  margin: 24px 0 0;
  font-size: 14px;
}
.small {
  font-size: 14px;
  margin: 6px 0 12px;
}
kbd {
  color: var(--muted);
  font-size: 10px;
  margin-left: 5px;
}
@media (max-width: 700px) {
  .controls {
    padding: 16px;
  }
}
</style>
