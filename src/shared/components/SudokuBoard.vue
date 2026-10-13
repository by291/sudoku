<script setup lang="ts">
import { computed, useTemplateRef, watch, nextTick } from 'vue'
import type { Board, NoteMask } from '@/core/sudoku/types'
import { DIGITS } from '@/core/sudoku/types'
import { digitsIn, maskOf } from '@/core/sudoku/board'
import type { PuzzleRules } from '@/core/sudoku/rules'
import {
  getBoardGeometry,
  getCellRuleContext,
  getSelectedRuleDescriptions,
} from '@/shared/model/boardGeometry'
import SudokuClues from '@/shared/components/SudokuClues.vue'

const props = defineProps<{
  board: Board
  givens: Board
  notes: readonly NoteMask[]
  selectedCell: number | null
  conflicts: readonly number[]
  hintCells: readonly number[]
  disabled: boolean
  obscured: boolean
  rules: PuzzleRules
  relatedCells: readonly number[]
}>()
const emit = defineEmits<{ select: [cell: number] }>()
const root = useTemplateRef<HTMLDivElement>('root')
const geometry = computed(() => getBoardGeometry(props.rules))
const selectedRules = computed(() =>
  !props.obscured && props.selectedCell !== null
    ? getSelectedRuleDescriptions(props.selectedCell, props.rules)
    : [],
)
const cageAnchors = computed(
  () =>
    new Set(geometry.value.clues.flatMap((clue) => (clue.kind === 'cage' ? [clue.anchor] : []))),
)

function navigate(event: KeyboardEvent, cell: number) {
  if (props.disabled || props.obscured || event.ctrlKey || event.metaKey || event.altKey) {
    return
  }

  const row = Math.floor(cell / 9)
  const column = cell % 9
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
    const row = Math.floor(cell / 9)
    const column = cell % 9
    const notes = digitsIn(props.notes[cell])
    const conflicting = props.conflicts.includes(cell)
    const highlighted = props.hintCells.includes(cell)
    const descriptions = [`第${row + 1}行第${column + 1}列`]
    if (props.obscured) {
      descriptions.push('已暂停')
    } else {
      if (value) {
        descriptions.push(`数字${value}`)
        if (given) {
          descriptions.push('题目给定')
        }
      } else {
        descriptions.push('空格')
        if (notes.length) {
          descriptions.push(`笔记${notes.join('、')}`)
        }
      }

      if (conflicting) {
        descriptions.push('冲突，请检查')
      }

      if (highlighted) {
        descriptions.push('提示位置')
      }

      const ruleContext = getCellRuleContext(cell, props.rules)
      if (ruleContext) {
        descriptions.push(ruleContext)
      }
    }

    return {
      cell,
      value,
      given,
      label: descriptions.join('，'),
      notes: DIGITS.map((digit) => ({ digit, visible: !!(props.notes[cell] & maskOf(digit)) })),
      conflicting,
      highlighted,
      selected: cell === props.selectedCell,
      peer: props.relatedCells.includes(cell),
      matching:
        props.selectedCell !== null &&
        props.board[props.selectedCell] !== 0 &&
        value === props.board[props.selectedCell],
      boxRight: props.rules.kind !== 'jigsaw' && (column === 2 || column === 5),
      boxBottom: props.rules.kind !== 'jigsaw' && (row === 2 || row === 5),
      cageAnchor: cageAnchors.value.has(cell),
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
  <div class="sudoku-widget">
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
          'cage-anchor': item.cageAnchor,
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
      <SudokuClues :geometry="geometry" :obscured="obscured" />
    </div>
    <ul v-if="selectedRules.length" class="selected-rules" aria-label="所选格子的规则">
      <li v-for="description in selectedRules" :key="description">{{ description }}</li>
    </ul>
  </div>
</template>
<style scoped>
.sudoku-board {
  position: relative;
  isolation: isolate;
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
}
/* Raise the focus ring alone so an opaque cell background cannot conceal its clue. */
.cell:focus-visible::after {
  content: '';
  position: absolute;
  inset: 3px;
  outline: 2px solid var(--accent);
  pointer-events: none;
  z-index: 3;
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
  position: relative;
  z-index: 2;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, minmax(0, 1fr));
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
  z-index: 3;
  position: absolute;
  right: 2px;
  top: 2px;
  font-size: 10px;
}
.value {
  position: relative;
  z-index: 2;
}
.value,
.notes span {
  text-shadow:
    1px 0 var(--surface),
    -1px 0 var(--surface),
    0 1px var(--surface),
    0 -1px var(--surface);
}
.cage-anchor .notes {
  padding-top: 40%;
  padding-bottom: 0;
}
.cage-anchor .value {
  transform: translateY(12%);
}
.selected-rules {
  padding-left: 20px;
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
}
</style>
