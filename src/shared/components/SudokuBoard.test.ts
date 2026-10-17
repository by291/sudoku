import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { expect, it } from 'vitest'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import { makeSession } from '../../../tests/support/gameFixtures'
import { sessionBoard } from '@/features/game/model/session'

const emptyBoardProps = {
  board: Array(81).fill(0),
  givens: Array(81).fill(0),
  notes: Array(81).fill(0),
  selectedCell: 0,
  conflicts: [],
  hintCells: [],
  disabled: false,
  obscured: false,
  rules: { kind: 'classic' as const },
  relatedCells: [],
}

it('omits empty note layouts and removes them when notes are cleared', async () => {
  const wrapper = mount(SudokuBoard, { props: emptyBoardProps })

  expect(wrapper.findAll('.notes')).toHaveLength(0)
  expect(wrapper.findAll('button')[0].attributes('aria-label')).toBe('第1行第1列，空格')

  const notes = Array(81).fill(0)
  notes[0] = 16
  await wrapper.setProps({ notes })

  expect(wrapper.findAll('.notes')).toHaveLength(1)
  expect(wrapper.findAll('button')[0].attributes('aria-label')).toContain('笔记5')

  await wrapper.setProps({ notes: Array(81).fill(0) })

  expect(wrapper.findAll('.notes')).toHaveLength(0)
  expect(wrapper.findAll('button')[0].attributes('aria-label')).not.toContain('笔记')
  wrapper.unmount()
})

it('keeps sparse notes in their digit positions as selection and notes change', async () => {
  const notes = Array(81).fill(0)
  notes[0] = 273
  const wrapper = mount(SudokuBoard, { props: { ...emptyBoardProps, notes } })
  const noteElements = wrapper.findAll<HTMLSpanElement>('.notes span')

  expect(noteElements.map((note) => note.text())).toEqual(['1', '5', '9'])
  expect(
    noteElements.map((note) => [note.element.style.gridRow, note.element.style.gridColumn]),
  ).toEqual([
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
  ])
  expect(wrapper.findAll('button')[0].attributes('aria-label')).toContain('笔记1、5、9')

  await wrapper.setProps({ selectedCell: 1, relatedCells: [0] })

  expect(wrapper.findAll('.notes span')[0].element).toBe(noteElements[0].element)
  expect(wrapper.findAll('button')[0].attributes('aria-label')).toContain('笔记1、5、9')

  const updatedNotes = [...notes]
  updatedNotes[0] = 130
  await wrapper.setProps({ notes: updatedNotes })

  expect(wrapper.findAll('.notes span').map((note) => note.text())).toEqual(['2', '8'])
  expect(wrapper.findAll('button')[0].attributes('aria-label')).toContain('笔记2、8')
  wrapper.unmount()
})

it('describes conflicts without visible markers and preserves hints and keyboard selection', async () => {
  const board = [...emptyBoardProps.board]
  board[0] = 5
  board[1] = 5
  const givens = [...emptyBoardProps.givens]
  givens[0] = 5
  const wrapper = mount(SudokuBoard, {
    attachTo: document.body,
    props: { ...emptyBoardProps, board, givens, conflicts: [0, 1], hintCells: [2] },
  })
  const buttons = wrapper.findAll('button')

  expect(buttons[0].classes()).toEqual(expect.arrayContaining(['given', 'selected', 'conflict']))
  expect(buttons[1].classes()).not.toContain('given')
  expect(buttons[1].get('.value').text()).toBe('5')
  expect(buttons[1].find('.marker').exists()).toBe(false)
  expect(buttons[1].attributes('aria-label')).toContain('冲突，请检查')
  expect(buttons[2].get('.marker').text()).toBe('•')
  expect(buttons[2].attributes('aria-label')).toContain('提示位置')

  buttons[0].element.focus()
  await buttons[0].trigger('keydown', { key: 'ArrowRight' })

  expect(wrapper.emitted('select')).toEqual([[1]])

  await wrapper.setProps({ selectedCell: 1 })
  await nextTick()

  expect(document.activeElement).toBe(buttons[1].element)
  expect(buttons[1].attributes('tabindex')).toBe('0')
  expect(buttons[1].attributes('aria-pressed')).toBe('true')
  expect(buttons[1].classes()).toEqual(expect.arrayContaining(['selected', 'conflict']))

  await wrapper.setProps({ obscured: true, disabled: true })

  expect(wrapper.findAll('.value, .notes, .marker, .conflict, .hinted, .selected')).toHaveLength(0)
  expect(buttons[1].attributes('aria-label')).toBe('第1行第2列，已暂停')
  wrapper.unmount()
})

it('labels all cells and removes values and notes from paused presentation', async () => {
  const session = makeSession()
  const notes = Array(81).fill(0)
  notes[2] = 5
  const wrapper = mount(SudokuBoard, {
    props: {
      board: sessionBoard(session),
      givens: session.puzzle.givens,
      notes,
      selectedCell: 2,
      conflicts: [],
      hintCells: [2],
      disabled: false,
      obscured: false,
      rules: session.puzzle.rules,
      relatedCells: [],
    },
  })

  expect(wrapper.findAll('button')).toHaveLength(81)
  expect(wrapper.findAll('button')[0].attributes('aria-label')).toContain('数字5，题目给定')
  expect(wrapper.findAll('button')[2].attributes('aria-label')).toContain('笔记1、3')
  await wrapper.findAll('button')[0].trigger('click')

  expect(wrapper.emitted('select')).toEqual([[0]])
  await wrapper.setProps({ obscured: true, disabled: true })

  expect(wrapper.text()).not.toMatch(/[1-9]/)
  expect(
    wrapper
      .findAll('button')
      .every((button) => button.attributes('aria-label')?.endsWith('已暂停')),
  ).toBe(true)
  wrapper.unmount()
})
it('explains selected Arrow clues and removes clue details while paused', async () => {
  const wrapper = mount(SudokuBoard, {
    props: {
      board: Array(81).fill(0),
      givens: Array(81).fill(0),
      notes: Array(81).fill(0),
      selectedCell: 16,
      conflicts: [],
      hintCells: [],
      disabled: false,
      obscured: false,
      rules: { kind: 'arrow', arrows: [{ circle: 8, shaft: [16, 24, 32, 40] }] },
      relatedCells: [8, 24, 32, 40],
    },
  })

  expect(wrapper.findAll('button')[16].attributes('aria-label')).toContain('箭头')
  expect(wrapper.text()).toContain('总和')
  expect(wrapper.findAll('button')[40].classes()).toContain('peer')
  await wrapper.setProps({ obscured: true })

  expect(wrapper.text()).not.toContain('箭头')
  expect(wrapper.findAll('button')[16].attributes('aria-label')).not.toContain('箭头')
  wrapper.unmount()
})
