<script setup lang="ts">
import { computed, useTemplateRef, watch, nextTick } from 'vue'
import type { Board, NoteMask } from '@/core/sudoku/types'
import { DIGITS } from '@/core/sudoku/types'
import { digitsIn, maskOf, PEERS } from '@/core/sudoku/board'
const props = defineProps<{
  board: Board
  givens: Board
  notes: readonly NoteMask[]
  selectedCell: number | null
  conflicts: readonly number[]
  hintCells: readonly number[]
  disabled: boolean
  obscured: boolean
}>()
const emit = defineEmits<{ select: [cell: number] }>()
const root = useTemplateRef<HTMLDivElement>('root')
function navigate(event: KeyboardEvent, cell: number) {
  if (props.disabled || props.obscured || event.ctrlKey || event.metaKey || event.altKey) return
  const row = Math.floor(cell / 9),
    column = cell % 9
  let next: number
  switch (event.key) {
    case 'ArrowLeft':
      next = column > 0 ? cell - 1 : cell
      break
    case 'ArrowRight':
      next = column < 8 ? cell + 1 : cell
      break
    case 'ArrowUp':
      next = row > 0 ? cell - 9 : cell
      break
    case 'ArrowDown':
      next = row < 8 ? cell + 9 : cell
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
  emit('select', next)
}
const cells = computed(() =>
  props.board.map((value, cell) => {
    const given = props.givens[cell] !== 0
    const row = Math.floor(cell / 9),
      column = cell % 9
    const notes = digitsIn(props.notes[cell])
    const conflicting = props.conflicts.includes(cell)
    const highlighted = props.hintCells.includes(cell)
    const label =
      `第${row + 1}行第${column + 1}列，` +
      (props.obscured
        ? '已暂停'
        : value
          ? `数字${value}${given ? '，题目给定' : ''}`
          : `空格${notes.length ? `，笔记${notes.join('、')}` : ''}`) +
      (!props.obscured && conflicting ? '，冲突，请检查' : '') +
      (!props.obscured && highlighted ? '，提示位置' : '')
    return {
      cell,
      value,
      given,
      label,
      notes: DIGITS.map((digit) => ({ digit, visible: !!(props.notes[cell] & maskOf(digit)) })),
      conflicting,
      highlighted,
      selected: cell === props.selectedCell,
      peer: props.selectedCell !== null && PEERS[props.selectedCell].includes(cell),
      matching:
        props.selectedCell !== null &&
        props.board[props.selectedCell] !== 0 &&
        value === props.board[props.selectedCell],
      boxRight: column === 2 || column === 5,
      boxBottom: row === 2 || row === 5,
    }
  }),
)
watch(
  () => props.selectedCell,
  async () => {
    if (root.value?.contains(document.activeElement)) {
      await nextTick()
      root.value?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus()
    }
  },
)
</script>
<template>
  <div ref="root" class="sudoku-board" role="group" aria-label="数独棋盘">
    <button
      v-for="item in cells"
      :key="item.cell"
      class="cell"
      :class="{
        given: item.given,
        selected: item.selected && !obscured,
        peer: item.peer && !obscured,
        matching: item.matching && !obscured,
        conflict: item.conflicting && !obscured,
        hinted: item.highlighted && !obscured,
        'box-right': item.boxRight,
        'box-bottom': item.boxBottom,
      }"
      :aria-label="item.label"
      :aria-pressed="item.selected"
      :tabindex="item.cell === (selectedCell ?? 0) ? 0 : -1"
      :disabled="disabled"
      @click="$emit('select', item.cell)"
      @keydown="navigate($event, item.cell)"
    >
      <template v-if="!obscured">
        <span v-if="item.value" class="value">{{ item.value }}</span>
        <span v-else class="notes" aria-hidden="true"
          ><span v-for="note in item.notes" :key="note.digit">{{
            note.visible ? note.digit : ''
          }}</span></span
        >
        <span v-if="item.conflicting" class="marker" aria-hidden="true">!</span
        ><span v-else-if="item.highlighted" class="marker" aria-hidden="true">•</span>
      </template>
    </button>
  </div>
</template>
<style scoped>
.sudoku-board {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  grid-template-rows: repeat(9, minmax(0, 1fr));
  aspect-ratio: 1;
  border: 2px solid var(--text);
  background: var(--surface);
  border-radius: 6px;
  overflow: hidden;
  width: 100%;
}
.cell {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--accent);
  font-size: clamp(19px, 3vw, 30px);
  line-height: 1;
  cursor: pointer;
}
.cell:nth-child(9n) {
  border-right: 0;
}
.cell:nth-child(n + 73) {
  border-bottom: 0;
}
.cell.box-right {
  border-right: 2px solid var(--text);
}
.cell.box-bottom {
  border-bottom: 2px solid var(--text);
}
.cell.given {
  color: var(--text);
  font-weight: 650;
}
.cell.peer {
  background: var(--background);
}
.cell.matching {
  background: var(--accent-soft);
}
.cell.selected {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 2px var(--accent);
}
.cell.conflict {
  color: var(--error);
  text-decoration: underline wavy;
}
.cell.hinted {
  box-shadow: inset 0 0 0 2px var(--accent);
}
.cell:focus-visible {
  outline-offset: -4px;
  z-index: 1;
}
.cell:disabled {
  opacity: 1;
  cursor: default;
}
.cell:hover:not(:disabled) {
  border-color: var(--accent);
}
.cell:active:not(:disabled) {
  background: var(--accent-soft);
}
.notes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
  height: 100%;
  padding: 3px;
  color: var(--muted);
  font-size: clamp(9px, 1.4vw, 13px);
}
.notes span {
  display: grid;
  place-items: center;
}
.marker {
  position: absolute;
  right: 2px;
  top: 2px;
  font-size: 10px;
}
</style>
