import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import SudokuBoard from './SudokuBoard.vue'
import { makeSession } from '../../../tests/support/gameFixtures'
import { sessionBoard } from './session'
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
