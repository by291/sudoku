<script setup lang="ts">
import { DIGITS } from '../../core/sudoku/types'
import type { Digit } from '../../core/sudoku/types'
defineProps<{
  editable: boolean
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
      <h2>落笔，想一想</h2>
      <span class="muted">键盘 1–9</span>
    </div>
    <div class="number-pad" aria-label="数字输入">
      <button
        v-for="digit in DIGITS"
        :key="digit"
        :disabled="!editable"
        :aria-label="`输入数字${digit}`"
        @click="$emit('digit', digit)"
      >
        {{ digit }}
      </button>
    </div>
    <div class="tools">
      <button :disabled="!editable" :aria-pressed="noteMode" @click="$emit('note')">
        笔记 <kbd>N</kbd></button
      ><button :disabled="!editable" @click="$emit('erase')">擦除</button
      ><button :disabled="!canUndo" @click="$emit('undo')">撤销</button
      ><button :disabled="!canRedo" @click="$emit('redo')">重做</button>
    </div>
    <h3>辅助工具</h3>
    <p class="muted small">使用以下工具会将本局记为「辅助完成」。</p>
    <div class="tools">
      <button :disabled="!editable || hintLoading" @click="$emit('hint')">
        {{ hintLoading ? '正在分析…' : '逻辑提示' }}</button
      ><button :disabled="!editable" @click="$emit('check')">检查填写</button
      ><button :disabled="!editable" @click="$emit('candidates')">生成候选数</button>
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
  margin: 0 0 18px;
}
.control-header span {
  font-size: 12px;
}
.number-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.number-pad button {
  font-size: 25px;
  color: var(--accent);
  background: var(--background);
  min-height: 54px;
}
.tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.tools button {
  flex: 1;
  padding: 10px 12px;
  white-space: nowrap;
}
h3 {
  margin: 24px 0 0;
  font-size: 14px;
}
.small {
  font-size: 12px;
  margin: 6px 0 12px;
}
kbd {
  color: var(--muted);
  font-size: 10px;
  margin-left: 5px;
}
button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
}
@media (max-width: 700px) {
  .number-pad {
    grid-template-columns: repeat(9, 1fr);
    gap: 4px;
  }
  .number-pad button {
    min-width: 0;
    padding: 4px;
    min-height: 44px;
    font-size: 20px;
  }
  .controls {
    padding: 16px;
  }
}
</style>
