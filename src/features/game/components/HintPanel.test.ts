import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import HintPanel from '@/features/game/components/HintPanel.vue'
import type { HintResult } from '@reference/core/sudoku/hint'

const hint: HintResult = {
  kind: 'deduction',
  placement: { cell: 0, digit: 1 },
  steps: [
    {
      kind: 'elimination',
      technique: 'cage-combination',
      removals: [{ cell: 0, digit: 4 }],
      evidence: {
        kind: 'cage',
        constraintId: 'cage:0',
        cells: [0, 1, 2],
        digits: [1, 2, 3, 4],
        sum: 6,
        domains: [
          { cell: 0, mask: 15 },
          { cell: 1, mask: 15 },
          { cell: 2, mask: 15 },
        ],
      },
    },
    {
      kind: 'placement',
      technique: 'naked-single',
      cell: 0,
      digit: 1,
      evidence: {
        kind: 'unit',
        unit: { kind: 'row', index: 0 },
        cells: [0],
        digits: [1],
        premises: [],
      },
    },
  ],
}
it('renders arithmetic facts and reports only the currently displayed step for highlighting', async () => {
  const wrapper = mount(HintPanel, { props: { hint } })

  expect(wrapper.text()).toContain('第1行第1列排除4')
  expect(wrapper.text()).toContain('第1行第1列：1、2、3、4')
  expect(wrapper.emitted('highlight')).toEqual([[hint.steps[0]]])
  const next = wrapper.findAll('button').find((button) => button.text() === '下一步')
  if (!next) {
    throw new Error('Missing next step button')
  }

  await next.trigger('click')

  expect(wrapper.emitted('highlight')).toEqual([[hint.steps[0]], [hint.steps[1]]])
  await wrapper.setProps({ hint: { kind: 'unavailable', reason: 'complete' } })

  expect(wrapper.emitted('highlight')?.at(-1)).toEqual([null])
  wrapper.unmount()
})
