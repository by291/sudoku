import { LESSONS } from '../../../../tests/support/lessons'
import { expect, it } from 'vitest'

import { referenceCountSolutions } from '../../../../tests/support/referenceVariants'
import type { Board, Digit } from '@/sudoku/contracts'
import { VARIANT_TEMPLATES } from '../../../../tests/fixtures/variantTemplates'

it.each(LESSONS)(
  'independently proves candidate-constrained conclusions in $id',
  (lesson) => {
    const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (const exercise of lesson.exercises) {
      for (const stage of exercise.stages) {
        const domains = stage.candidates.map((mask) =>
          digits.filter((digit) => (mask & (2 ** (digit - 1))) !== 0),
        )
        if (lesson.id === 'jigsaw-rules') {
          const known = VARIANT_TEMPLATES.jigsaw.easy[0].solution
          const witnesses = [
            known,
            known.map((_, cell) => known[(cell % 9) * 9 + Math.floor(cell / 9)]),
            known.map((_, cell) => known[80 - cell]),
          ]
          const witness = witnesses.find((board) =>
            board.every((digit, cell) =>
              stage.board[cell] === 0
                ? digit !== 0 && domains[cell].includes(digit)
                : stage.board[cell] === digit,
            ),
          )
          if (!witness) {
            throw new Error('Missing independently checked complete regional assignment')
          }
          expect(referenceCountSolutions(witness, stage.rules).count).toBe(1)
        } else {
          expect(
            referenceCountSolutions(stage.board, stage.rules, 1, domains).count,
            `${lesson.id} has a consistent candidate assignment`,
          ).toBe(1)
        }
        const step = stage.step
        const forbidden =
          step.kind === 'elimination'
            ? step.removals
            : domains[step.cell]
                .filter((digit) => digit !== step.digit)
                .map((digit) => ({ cell: step.cell, digit }))
        for (const { cell, digit } of forbidden) {
          const forced: Board = stage.board.map((value, index) => (index === cell ? digit : value))
          expect(
            referenceCountSolutions(forced, stage.rules, 1, domains).count,
            `${lesson.id} cannot place ${digit} at ${cell}`,
          ).toBe(0)
        }
      }
    }
  },
  20000,
)
