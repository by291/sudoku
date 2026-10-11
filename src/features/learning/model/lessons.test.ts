import { expect, it } from 'vitest'
import { LESSONS, checkExercise } from '@/features/learning/model/lessons'
import { EXAMPLES } from '@/features/learning/model/examples'
import { solvedBoard } from '../../../../tests/fixtures/sudoku'
import { UNITS, maskOf, digitsIn } from '@/core/sudoku/board'
it('provides six lessons with explicit exercises and mode-appropriate practice', () => {
  expect(LESSONS.map((lesson) => lesson.id)).toEqual([
    'rules',
    'naked-single',
    'hidden-single',
    'locked-candidate',
    'naked-pair',
    'hidden-pair',
  ])
  expect(LESSONS.map((lesson) => lesson.practiceDifficulty)).toEqual([
    'easy',
    'easy',
    'easy',
    'medium',
    'hard',
    'hard',
  ])
  for (const lesson of LESSONS) {
    expect(lesson.explanation).toMatch(/[\u4e00-\u9fff]/)
    expect(checkExercise(lesson, lesson.exercise.expected).correct).toBe(true)
    expect(checkExercise(lesson, { cell: 80, digit: 9 }).correct).toBe(false)
  }
})
it('verifies frozen witnesses against an independent solution and unit facts', () => {
  for (const example of Object.values(EXAMPLES)) {
    const { board, candidates, step } = example
    expect(board.every((value, cell) => value === 0 || value === solvedBoard[cell])).toBe(true)
    const unit = UNITS.find(
      (unit) => unit.kind === step.evidence.unit.kind && unit.index === step.evidence.unit.index,
    )
    if (!unit) throw new Error('Missing unit')
    if (step.kind === 'placement') expect(step.digit).toBe(solvedBoard[step.cell])
    else
      for (const removal of step.removals) expect(removal.digit).not.toBe(solvedBoard[removal.cell])
    if (step.technique === 'naked-single')
      expect(digitsIn(candidates[step.evidence.cells[0]])).toEqual(step.evidence.digits)
    if (step.technique === 'hidden-single' || step.technique === 'hidden-pair')
      for (const digit of step.evidence.digits)
        expect(unit.cells.filter((cell) => candidates[cell] & maskOf(digit))).toEqual(
          step.evidence.cells,
        )
    if (step.technique === 'naked-pair')
      for (const cell of step.evidence.cells)
        expect(digitsIn(candidates[cell])).toEqual(step.evidence.digits)
    if (step.technique === 'locked-candidate') {
      expect(
        unit.cells.filter((cell) => candidates[cell] & maskOf(step.evidence.digits[0])),
      ).toEqual(step.evidence.cells)
      expect(new Set(step.evidence.cells.map((cell) => Math.floor(cell / 9))).size).toBe(1)
    }
  }
})
it('compares distinct elimination pairs as a set and rejects missing or extra answers', () => {
  const lesson = LESSONS.find((lesson) => lesson.id === 'hidden-pair')
  if (!lesson || lesson.exercise.kind !== 'elimination') throw new Error('Missing elimination')
  const answer = lesson.exercise.expected
  expect(checkExercise(lesson, [...answer].reverse()).correct).toBe(true)
  expect(checkExercise(lesson, [...answer, answer[0]]).correct).toBe(true)
  expect(checkExercise(lesson, answer.slice(1)).correct).toBe(false)
  expect(checkExercise(lesson, [...answer, { cell: 80, digit: 9 }]).correct).toBe(false)
})
