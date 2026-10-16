import type { LessonCalculation } from '@/sudoku/contracts'
import type { Board } from '@/sudoku/contracts'
import { ALL_DIGITS_MASK, DIGITS } from '@/sudoku/values'
import type { LogicalStep } from '@/sudoku/contracts'
import type { NewSudokuVariant, PuzzleRules } from '@/sudoku/contracts'
import { maskOf } from '@/shared/model/sudokuPresentation'
import { VARIANT_TEMPLATES } from '@/features/learning/model/variantTemplates'

type PlacementProof = Extract<LogicalStep, { kind: 'placement' }>

type VariantExample = {
  rules: PuzzleRules
  board: Board
  candidates: readonly number[]
  step: PlacementProof
}

export function createVariantExamples(calculation: Pick<LessonCalculation, 'prepare'>) {
  function example(rules: PuzzleRules, board: Board, step: PlacementProof): VariantExample {
    const layout = calculation.prepare(rules)
    try {
      return { rules, board, candidates: layout.baseCandidates(board), step }
    } finally {
      layout.dispose()
    }
  }

  const diagonal = VARIANT_TEMPLATES.diagonal.easy[0]
  const diagonalCells = Array.from({ length: 9 }, (_, index) => index * 10)
  const diagonalBoard = diagonal.solution.map((digit, cell) =>
    cell !== 0 && diagonalCells.includes(cell) ? digit : 0,
  )
  const jigsaw = VARIANT_TEMPLATES.jigsaw.easy[0]
  if (jigsaw.rules.kind !== 'jigsaw') {
    throw new Error('Expected authored Jigsaw rules')
  }
  const regionCells = jigsaw.rules.regions[0]
  const jigsawBoard = jigsaw.solution.map((digit, cell) =>
    cell !== 0 && regionCells.includes(cell) ? digit : 0,
  )
  const killerRules = VARIANT_TEMPLATES.killer.easy[0].rules
  const killerBoard: Board = Array.from({ length: 81 }, (_, cell) =>
    cell === 1 ? 2 : cell === 2 ? 3 : 0,
  )
  const thermoRules: PuzzleRules = { kind: 'thermo', paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]] }
  const arrowRules: PuzzleRules = {
    kind: 'arrow',
    arrows: [{ circle: 8, shaft: [16, 24, 32, 40] }],
  }
  const arrowBoard: Board = Array.from({ length: 81 }, (_, cell) =>
    cell === 8 ? 8 : cell === 16 ? 2 : cell === 24 ? 1 : cell === 32 ? 3 : 0,
  )
  const arrowTransferBoard: Board = arrowBoard.map((digit, cell) =>
    cell === 32 ? 0 : cell === 40 ? 2 : digit,
  )
  const arrowCircleBoard: Board = arrowBoard.map((digit, cell) =>
    cell === 8 ? 0 : cell === 40 ? 2 : digit,
  )

  function domains(board: Board, cells: readonly number[]) {
    return cells.map((cell) => ({
      cell,
      mask: board[cell] ? maskOf(board[cell]) : ALL_DIGITS_MASK,
    }))
  }

  const ARROW_TRANSFER_EXAMPLE = example(arrowRules, arrowTransferBoard, {
    kind: 'placement',
    technique: 'arrow-equation',
    cell: 32,
    digit: 3,
    evidence: {
      kind: 'arrow',
      constraintId: 'arrow:0',
      cells: [8, 16, 24, 32, 40],
      digits: [3],
      circle: 8,
      shaft: [16, 24, 32, 40],
      domains: domains(arrowTransferBoard, [8, 16, 24, 32, 40]),
    },
  })

  const ARROW_CIRCLE_EXAMPLE = example(arrowRules, arrowCircleBoard, {
    kind: 'placement',
    technique: 'arrow-equation',
    cell: 8,
    digit: 8,
    evidence: {
      kind: 'arrow',
      constraintId: 'arrow:0',
      cells: [8, 16, 24, 32, 40],
      digits: [8],
      circle: 8,
      shaft: [16, 24, 32, 40],
      domains: domains(arrowCircleBoard, [8, 16, 24, 32, 40]),
    },
  })

  // Proofs are authored from unit contents, arithmetic, and strict path length; no search answer supplies a hint.
  const VARIANT_EXAMPLES: Record<NewSudokuVariant, VariantExample> = {
    diagonal: example(diagonal.rules, diagonalBoard, {
      kind: 'placement',
      technique: 'hidden-single',
      cell: 0,
      digit: 1,
      evidence: {
        kind: 'unit',
        unit: { kind: 'diagonal', index: 0 },
        cells: [0],
        digits: [1],
        premises: [],
      },
    }),
    jigsaw: example(jigsaw.rules, jigsawBoard, {
      kind: 'placement',
      technique: 'hidden-single',
      cell: 0,
      digit: 1,
      evidence: {
        kind: 'unit',
        unit: { kind: 'region', index: 0 },
        cells: [0],
        digits: [1],
        premises: [],
      },
    }),
    killer: example(killerRules, killerBoard, {
      kind: 'placement',
      technique: 'cage-remainder',
      cell: 0,
      digit: 1,
      evidence: {
        kind: 'cage',
        constraintId: 'cage:0',
        cells: [0, 1, 2],
        digits: [1],
        sum: 6,
        domains: domains(killerBoard, [0, 1, 2]),
      },
    }),
    thermo: example(thermoRules, Array(81).fill(0), {
      kind: 'placement',
      technique: 'thermo-bound',
      cell: 0,
      digit: 1,
      evidence: {
        kind: 'thermo',
        constraintId: 'thermo:0',
        cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        path: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        digits: [1],
        bounds: DIGITS.map((digit, cell) => ({ cell, min: digit, max: digit })),
      },
    }),
    arrow: example(arrowRules, arrowBoard, {
      kind: 'placement',
      technique: 'arrow-equation',
      cell: 40,
      digit: 2,
      evidence: {
        kind: 'arrow',
        constraintId: 'arrow:0',
        cells: [8, 16, 24, 32, 40],
        circle: 8,
        shaft: [16, 24, 32, 40],
        digits: [2],
        domains: domains(arrowBoard, [8, 16, 24, 32, 40]),
      },
    }),
  }

  return { VARIANT_EXAMPLES, ARROW_CIRCLE_EXAMPLE, ARROW_TRANSFER_EXAMPLE }
}
