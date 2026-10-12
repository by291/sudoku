import { onMounted, onScopeDispose } from 'vue'
import { isDigit, UNIT_SIZE } from '@/core/sudoku/types'
import { useGameStore } from '@/features/game/stores/useGameStore'
import type { GameAction } from '@/features/game/model/session'
import { isKeyboardOwnedByControl } from '@/shared/utils/keyboardOwnership'
type KeyboardGame = {
  editable: boolean
  selectedCell: number | null
  noteMode: boolean
  dispatch(action: GameAction): void
  selectCell(cell: number): void
  toggleNoteMode(): void
}
export function handleGameKey(event: KeyboardEvent, game: KeyboardGame): boolean {
  if (!game.editable || isKeyboardOwnedByControl(event)) return false
  const key = event.key.toLowerCase()
  const modifier = event.ctrlKey || event.metaKey
  if (modifier && key === 'z') game.dispatch({ kind: event.shiftKey ? 'redo' : 'undo' })
  else if (modifier || event.altKey) return false
  else if (key === 'n') game.toggleNoteMode()
  else if (game.selectedCell === null) return false
  else {
    const cell = game.selectedCell
    const row = Math.floor(cell / UNIT_SIZE),
      column = cell % UNIT_SIZE
    const digit = Number(key)
    if (key.length === 1 && isDigit(digit))
      game.dispatch({ kind: game.noteMode ? 'toggle-note' : 'enter', cell, digit })
    else if (['delete', 'backspace'].includes(key)) game.dispatch({ kind: 'erase', cell })
    else if (key === 'arrowleft') game.selectCell(column === 0 ? cell : cell - 1)
    else if (key === 'arrowright') game.selectCell(column === UNIT_SIZE - 1 ? cell : cell + 1)
    else if (key === 'arrowup') game.selectCell(row === 0 ? cell : cell - UNIT_SIZE)
    else if (key === 'arrowdown') game.selectCell(row === UNIT_SIZE - 1 ? cell : cell + UNIT_SIZE)
    else return false
  }
  event.preventDefault()
  return true
}
export function useGameKeyboard() {
  const game = useGameStore()
  const listener = (event: KeyboardEvent) => {
    handleGameKey(event, game)
  }
  onMounted(() => window.addEventListener('keydown', listener))
  onScopeDispose(() => window.removeEventListener('keydown', listener))
}
