import { expect, it } from 'vitest'
import { findAdvancedStep } from '@/core/sudoku/logic/advancedTechniques'
import { validateAdvancedStep } from '@/core/sudoku/logic/advancedEvidence'
import { createWorkBudget } from '@/core/sudoku/budget'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules/context'
import type { LogicalState, Technique } from '@/core/sudoku/logic/types'
import type { CellValue } from '@/core/sudoku/types'

function fixture(entries: readonly [number, number][], base = 511): LogicalState {
  const candidates = Array<number>(81).fill(base)

  for (const [cell, mask] of entries) {
    candidates[cell] = mask
  }

  return { board: Array<CellValue>(81).fill(0), candidates, context: CLASSIC_CONTEXT }
}

const naked = fixture([
  [0, 3],
  [1, 6],
  [2, 5],
])

const hidden = fixture(
  [
    [0, 11],
    [1, 14],
    [2, 13],
  ],
  504,
)

// Digit 1 is restricted to columns 2 and 7 in rows 1 and 4.
const xWing = fixture(
  [
    [1, 511],
    [6, 511],
    [28, 511],
    [33, 511],
    [10, 511],
  ],
  510,
)

// Three rows use the cyclic pairs (2,5), (5,8), (2,8).
const swordfish = fixture(
  [
    [1, 511],
    [4, 511],
    [31, 511],
    [34, 511],
    [55, 511],
    [61, 511],
    [10, 511],
  ],
  510,
)

const wing = fixture([
  [0, 3],
  [4, 5],
  [27, 6],
])

const coloring = fixture(
  [
    [0, 511],
    [4, 511],
    [40, 511],
    [36, 511],
    [9, 511],
    [18, 511],
  ],
  510,
)

it.each([
  ['naked-triple', naked, 3, 1],
  ['hidden-triple', hidden, 0, 4],
  ['x-wing', xWing, 10, 1],
  ['swordfish', swordfish, 10, 1],
  ['xy-wing', wing, 31, 3],
  ['simple-coloring', coloring, 9, 1],
] as const)('proves %s from authored candidate facts', (technique, state, cell, digit) => {
  const result = findAdvancedStep(state, technique, createWorkBudget(100000))

  expect(result.status).toBe('complete')
  if (result.status !== 'complete' || !result.step) {
    throw new Error('Missing expected deduction')
  }

  expect(result.step).toMatchObject({ kind: 'elimination' })
  if (result.step.kind !== 'elimination') {
    throw new Error('Expected elimination')
  }

  expect(result.step.removals).toContainEqual({ cell, digit })
  expect(validateAdvancedStep(state, result.step)).toBe(true)
  expect(validateAdvancedStep(state, { ...result.step, removals: [{ cell: 80, digit: 9 }] })).toBe(
    false,
  )
})

it('rejects a fish with a third cover column and a wing without both pivot peers', () => {
  const falseFish = fixture(
    [
      [1, 511],
      [6, 511],
      [28, 511],
      [33, 511],
      [35, 511],
      [10, 511],
    ],
    510,
  )
  const falseWing = fixture([
    [0, 3],
    [4, 5],
    [30, 6],
  ])

  expect(findAdvancedStep(falseFish, 'x-wing', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
  expect(findAdvancedStep(falseWing, 'xy-wing', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
})

it('proves color wrap using strong links in complete units', () => {
  // Row 1 links 0–1, column 2 links 1–10. Cells 0 and 10 share a box.
  const result = findAdvancedStep(
    fixture(
      [
        [0, 511],
        [1, 511],
        [10, 511],
      ],
      510,
    ),
    'simple-coloring',
    createWorkBudget(100000),
  )

  expect(result).toMatchObject({
    status: 'complete',
    step: {
      evidence: { kind: 'coloring', mode: 'wrap' },
      removals: [
        { cell: 0, digit: 1 },
        { cell: 10, digit: 1 },
      ],
    },
  })
})

it('rejects filled cells, no-op removals and invented strong links in a proof', () => {
  const state = fixture(
    [
      [0, 511],
      [1, 511],
      [10, 511],
    ],
    510,
  )
  const result = findAdvancedStep(state, 'simple-coloring', createWorkBudget(100000))
  if (result.status !== 'complete' || !result.step || result.step.evidence.kind !== 'coloring') {
    throw new Error('Expected wrap proof')
  }

  const step = result.step
  if (step.evidence.kind !== 'coloring') {
    throw new Error('Expected coloring proof')
  }

  const filled = { ...state, board: state.board.map((value, cell) => (cell === 0 ? 1 : value)) }

  expect(validateAdvancedStep(filled, step)).toBe(false)
  expect(
    validateAdvancedStep(state, {
      ...step,
      kind: 'elimination',
      removals: [{ cell: 80, digit: 1 }],
    }),
  ).toBe(false)
  expect(
    validateAdvancedStep(state, {
      ...step,
      evidence: { ...step.evidence, links: [{ unit: { kind: 'box', index: 0 }, cells: [0, 10] }] },
    }),
  ).toBe(false)
  expect(
    findAdvancedStep(
      { ...state, context: { ...CLASSIC_CONTEXT, rules: { kind: 'diagonal' } } },
      'simple-coloring',
      createWorkBudget(100000),
    ),
  ).toEqual({ status: 'complete', step: null })
})

it('rejects odd strong-link cycles and components with both colors in conflict', () => {
  // Five links use row 1, column 5, row 5, column 2 and box 1 respectively.
  const odd = fixture(
    [
      [0, 511],
      [4, 511],
      [40, 511],
      [37, 511],
      [10, 511],
    ],
    510,
  )
  // A four-link rectangle gives each diagonal one color; both diagonals share box 1.
  const impossible = fixture(
    [
      [0, 511],
      [1, 511],
      [9, 511],
      [10, 511],
    ],
    510,
  )

  expect(findAdvancedStep(odd, 'simple-coloring', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
  expect(findAdvancedStep(impossible, 'simple-coloring', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
})

it('rejects triple near misses and patterns with no effective elimination', () => {
  const nakedNearMiss = fixture([
    [0, 3],
    [4, 6],
    [8, 9],
  ])
  const hiddenMasks = Array<number>(81).fill(511)

  for (let cell = 0; cell < 9; cell++) {
    hiddenMasks[cell] = 504
  }
  hiddenMasks[0] = 11
  hiddenMasks[4] = 14
  hiddenMasks[8] = 13
  hiddenMasks[3] = 505
  const hiddenNearMiss = { ...nakedNearMiss, candidates: hiddenMasks }
  const noOp = fixture([
    [0, 3],
    [4, 6],
    [8, 5],
  ])
  const noOpMasks = [...noOp.candidates]

  for (const cell of [1, 2, 3, 5, 6, 7]) {
    noOpMasks[cell] = 504
  }

  const noOpTriple = { ...noOp, candidates: noOpMasks }
  const noOpWing = fixture([
    [0, 3],
    [4, 5],
    [27, 6],
    [31, 507],
  ])

  expect(findAdvancedStep(nakedNearMiss, 'naked-triple', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
  expect(findAdvancedStep(hiddenNearMiss, 'hidden-triple', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
  expect(findAdvancedStep(noOpTriple, 'naked-triple', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
  expect(findAdvancedStep(noOpTriple, 'hidden-triple', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
  expect(findAdvancedStep(noOpWing, 'xy-wing', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
})

it('rejects a Swordfish whose three base rows need four cover columns', () => {
  const masks = Array<number>(81).fill(511)

  for (const row of [0, 3, 6]) {
    for (let column = 0; column < 9; column++) {
      masks[row * 9 + column] = 510
    }
  }
  for (const cell of [1, 4, 31, 34, 55, 61, 60]) {
    masks[cell] = 511
  }

  const state = { ...naked, candidates: masks }

  expect(findAdvancedStep(state, 'swordfish', createWorkBudget(100000))).toEqual({
    status: 'complete',
    step: null,
  })
})

it.each([
  'naked-triple',
  'hidden-triple',
  'x-wing',
  'swordfish',
  'xy-wing',
  'simple-coloring',
] satisfies Technique[])(
  'reports exhaustion for %s instead of an incomplete proof',
  (technique) => {
    expect(findAdvancedStep(naked, technique, createWorkBudget(0))).toEqual({
      status: 'budget-exhausted',
    })
  },
)
