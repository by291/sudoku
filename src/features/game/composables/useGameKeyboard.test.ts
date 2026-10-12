import { expect, it } from 'vitest'
import { handleGameKey } from '@/features/game/composables/useGameKeyboard'
import type { GameAction } from '@/features/game/model/session'
it('routes digits, notes, erasing, arrows and history through shared actions', () => {
  const actions: GameAction[] = []
  const game = {
    editable: true,
    selectedCell: 2 as number | null,
    noteMode: false,
    dispatch: (action: GameAction) => actions.push(action),
    selectCell(cell: number) {
      this.selectedCell = cell
    },
    toggleNoteMode() {
      this.noteMode = !this.noteMode
    },
  }
  for (const key of ['4', 'n', '5', 'ArrowRight', 'Backspace'])
    handleGameKey(new KeyboardEvent('keydown', { key, cancelable: true }), game)
  handleGameKey(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }), game)
  handleGameKey(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }), game)
  expect(actions).toEqual([
    { kind: 'enter', cell: 2, digit: 4 },
    { kind: 'toggle-note', cell: 2, digit: 5 },
    { kind: 'erase', cell: 3 },
    { kind: 'undo' },
    { kind: 'redo' },
  ])
})
it('leaves form fields, dialog controls and inactive games untouched', () => {
  const game = {
    editable: true,
    selectedCell: 2,
    noteMode: false,
    dispatch() {
      throw new Error('Unexpected edit')
    },
    selectCell() {},
    toggleNoteMode() {},
  }
  for (const html of [
    '<input>',
    '<textarea></textarea>',
    '<select></select>',
    '<div contenteditable="true"></div>',
    '<dialog open><button>Cancel</button></dialog>',
  ]) {
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const target = container.querySelector('button') ?? container.firstElementChild
    target?.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent) handleGameKey(event, game)
    })
    target?.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))
    container.remove()
  }
  game.editable = false
  expect(handleGameKey(new KeyboardEvent('keydown', { key: '4' }), game)).toBe(false)
})
it.each([
  { key: 'ArrowUp', cells: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'ArrowDown', cells: [72, 73, 74, 75, 76, 77, 78, 79, 80] },
])('keeps every edge cell selected when pressing $key beyond the board', ({ key, cells }) => {
  for (const cell of cells) {
    const game = {
      editable: true,
      selectedCell: cell,
      noteMode: false,
      dispatch() {
        throw new Error('Navigation must not edit the board')
      },
      selectCell(next: number) {
        this.selectedCell = next
      },
      toggleNoteMode() {},
    }
    const event = new KeyboardEvent('keydown', { key, cancelable: true })
    expect(handleGameKey(event, game)).toBe(true)
    expect(game.selectedCell).toBe(cell)
    expect(event.defaultPrevented).toBe(true)
  }
})
it('moves vertically in the same column when another row is available', () => {
  for (const { cell, key, expected } of [
    { cell: 17, key: 'ArrowUp', expected: 8 },
    { cell: 63, key: 'ArrowDown', expected: 72 },
    { cell: 8, key: 'ArrowDown', expected: 17 },
    { cell: 72, key: 'ArrowUp', expected: 63 },
  ]) {
    const game = {
      editable: true,
      selectedCell: cell,
      noteMode: false,
      dispatch() {
        throw new Error('Navigation must not edit the board')
      },
      selectCell(next: number) {
        this.selectedCell = next
      },
      toggleNoteMode() {},
    }
    handleGameKey(new KeyboardEvent('keydown', { key }), game)
    expect(game.selectedCell).toBe(expected)
  }
})

it.each(['combobox', 'listbox', 'option', 'radiogroup', 'radio', 'switch', 'checkbox'])(
  'leaves keyboard input inside a %s to its control',
  (role) => {
    const actions: GameAction[] = []
    const game = {
      editable: true,
      selectedCell: 2,
      noteMode: false,
      dispatch: (action: GameAction) => actions.push(action),
      selectCell() {},
      toggleNoteMode() {},
    }
    const control = document.createElement('div')
    control.setAttribute('role', role)
    document.body.append(control)
    let handled: boolean | undefined
    control.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent) handled = handleGameKey(event, game)
    })
    control.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))
    control.remove()
    expect(handled).toBe(false)
    expect(actions).toEqual([])
  },
)

it('leaves consumed keyboard events and open custom modals untouched', () => {
  const actions: GameAction[] = []
  const game = {
    editable: true,
    selectedCell: 2,
    noteMode: false,
    dispatch: (action: GameAction) => actions.push(action),
    selectCell() {},
    toggleNoteMode() {},
  }
  const consumed = new KeyboardEvent('keydown', { key: '4', cancelable: true })
  consumed.preventDefault()
  expect(handleGameKey(consumed, game)).toBe(false)
  const modal = document.createElement('div')
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  document.body.append(modal)
  expect(handleGameKey(new KeyboardEvent('keydown', { key: '4' }), game)).toBe(false)
  modal.remove()
  expect(actions).toEqual([])
})

it('lets an open action menu own input while focus remains on its trigger', () => {
  const actions: GameAction[] = []
  const game = {
    editable: true,
    selectedCell: 2,
    noteMode: false,
    dispatch: (action: GameAction) => actions.push(action),
    selectCell() {},
    toggleNoteMode() {},
  }
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-hidden', 'false')
  document.body.append(menu)
  const event = new KeyboardEvent('keydown', { key: '4', cancelable: true })
  expect(handleGameKey(event, game)).toBe(false)
  expect(actions).toEqual([])
  menu.setAttribute('aria-hidden', 'true')
  expect(handleGameKey(new KeyboardEvent('keydown', { key: '4' }), game)).toBe(true)
  expect(actions).toEqual([{ kind: 'enter', cell: 2, digit: 4 }])
  menu.remove()
})
