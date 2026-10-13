import { expect, it } from 'vitest'
import { maskOf } from '@/core/sudoku/board'
import { explainStep, explainStepEvidence } from '@/core/sudoku/techniques'
import type { LogicalStep } from '@/core/sudoku/techniques'

it('names each eliminated cage candidate and exposes its input domains and target sum', () => {
  const step: LogicalStep = {
    kind: 'elimination',
    technique: 'cage-combination',
    removals: [
      { cell: 0, digit: 4 },
      { cell: 1, digit: 4 },
    ],
    evidence: {
      kind: 'cage',
      constraintId: 'cage:0',
      cells: [0, 1, 2],
      digits: [1, 2, 3, 4],
      sum: 6,
      domains: [0, 1, 2].map((cell) => ({ cell, mask: 15 })),
    },
  }

  expect(explainStep(step)).toContain('第1行第1列排除4')
  expect(explainStep(step)).toContain('第1行第2列排除4')
  expect(explainStepEvidence(step).join('；')).toContain('目标总和：6')
  expect(explainStepEvidence(step).join('；')).toContain('第1行第1列：1、2、3、4')
})

it('names arrow eliminations and distinguishes the circle and shaft domains', () => {
  const step: LogicalStep = {
    kind: 'elimination',
    technique: 'arrow-combination',
    removals: [{ cell: 16, digit: 6 }],
    evidence: {
      kind: 'arrow',
      constraintId: 'arrow:0',
      cells: [8, 16, 24, 32, 40],
      digits: [1, 2, 3, 6, 8],
      circle: 8,
      shaft: [16, 24, 32, 40],
      domains: [
        { cell: 8, mask: maskOf(8) },
        { cell: 16, mask: maskOf(1) | maskOf(2) | maskOf(6) },
        { cell: 24, mask: maskOf(1) | maskOf(2) },
        { cell: 32, mask: maskOf(1) | maskOf(3) },
        { cell: 40, mask: maskOf(1) | maskOf(2) },
      ],
    },
  }

  expect(explainStep(step)).toContain('第2行第8列排除6')
  const details = explainStepEvidence(step).join('；')

  expect(details).toContain('圆圈第1行第9列：8')
  expect(details).toContain('箭杆第2行第8列：1、2、6')
})

it('explains thermo bounds using path order and specific numeric ranges', () => {
  const step: LogicalStep = {
    kind: 'elimination',
    technique: 'thermo-bound',
    removals: [{ cell: 0, digit: 9 }],
    evidence: {
      kind: 'thermo',
      constraintId: 'thermo:0',
      cells: [0, 1, 2],
      digits: [9],
      path: [0, 1, 2],
      bounds: [
        { cell: 0, min: 1, max: 7 },
        { cell: 1, min: 2, max: 8 },
        { cell: 2, min: 3, max: 9 },
      ],
    },
  }

  expect(explainStep(step)).toContain('第1行第1列排除9')
  expect(explainStepEvidence(step).join('；')).toContain('第1行第1列（从圆头起第1格，共3格）：1–7')
})

it('shows the subtraction for a cage remainder placement', () => {
  const step: LogicalStep = {
    kind: 'placement',
    technique: 'cage-remainder',
    cell: 0,
    digit: 1,
    evidence: {
      kind: 'cage',
      constraintId: 'cage:0',
      cells: [0, 1, 2],
      digits: [1, 2, 3],
      sum: 6,
      domains: [
        { cell: 0, mask: 7 },
        { cell: 1, mask: maskOf(2) },
        { cell: 2, mask: maskOf(3) },
      ],
    },
  }

  expect(explainStepEvidence(step)).toContain('6 − 2 − 3 = 1')
})
