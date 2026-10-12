import { expect, it } from 'vitest'
import { LESSONS, checkExercise } from '@/features/learning/model/lessons'
import { EXAMPLES } from '@/features/learning/model/examples'
import { solvedBoard } from '../../../../tests/fixtures/sudoku'
import { UNITS, maskOf, digitsIn } from '@/core/sudoku/board'
import { LESSON_IDS } from '@/features/learning/model/lessonIds'
import { VARIANT_EXAMPLES } from '@/features/learning/model/variantExamples'
it('provides six lessons with explicit exercises and mode-appropriate practice', () => {
  expect(LESSONS.slice(0, 6).map((lesson) => lesson.id)).toEqual([
    'rules',
    'naked-single',
    'hidden-single',
    'locked-candidate',
    'naked-pair',
    'hidden-pair',
  ])
  expect(LESSONS.slice(0, 6).map((lesson) => lesson.practiceDifficulty)).toEqual([
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
it('keeps six Classic identities and adds five independently answerable rule lessons', () => {
  expect(LESSON_IDS).toHaveLength(11)
  const expectations = {
    diagonal: { cell: 0, digit: 1 },
    jigsaw: { cell: 0, digit: 1 },
    killer: { cell: 0, digit: 1 },
    thermo: { cell: 0, digit: 1 },
    arrow: { cell: 40, digit: 2 },
  }
  for (const [variant, answer] of Object.entries(expectations)) {
    const lesson = LESSONS.find((lesson) => lesson.id === `${variant}-rules`)
    expect(lesson).toMatchObject({
      practiceVariant: variant,
      rules: { kind: variant },
      practiceDifficulty: 'easy',
      exercise: { kind: 'placement', expected: answer },
    })
  }
})
it('derives variant exercise answers from explicit unit and arithmetic facts', () => {
  const diagonal = VARIANT_EXAMPLES.diagonal
  expect(Array.from({ length: 8 }, (_, index) => diagonal.board[(index + 1) * 10]).sort()).toEqual([
    2, 3, 4, 5, 6, 7, 8, 9,
  ])
  const jigsaw = VARIANT_EXAMPLES.jigsaw
  if (jigsaw.rules.kind !== 'jigsaw') throw new Error('Expected Jigsaw lesson')
  expect(
    jigsaw.rules.regions[0]
      .filter((cell) => cell !== 0)
      .map((cell) => jigsaw.board[cell])
      .sort(),
  ).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
  const killer = VARIANT_EXAMPLES.killer
  if (killer.rules.kind !== 'killer') throw new Error('Expected Killer lesson')
  expect(killer.rules.cages[0].sum - killer.board[1] - killer.board[2]).toBe(1)
  const thermo = VARIANT_EXAMPLES.thermo
  if (thermo.rules.kind !== 'thermo') throw new Error('Expected Thermo lesson')
  expect(thermo.rules.paths[0]).toHaveLength(9)
  expect(10 - thermo.rules.paths[0].length).toBe(1)
  const arrow = VARIANT_EXAMPLES.arrow
  expect(arrow.board[8] - arrow.board[16] - arrow.board[24] - arrow.board[32]).toBe(2)
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
