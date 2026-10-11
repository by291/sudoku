import type { Board, Digit, Difficulty, NoteMask } from '../../core/sudoku/types'
import { EXAMPLES } from './examples'
import { explainStep, TECHNIQUE_NAMES } from '../../core/sudoku/techniques'
import type { Technique } from '../../core/sudoku/techniques'
export type Exercise =
  | { kind: 'placement'; expected: { cell: number; digit: Digit } }
  | { kind: 'elimination'; expected: readonly { cell: number; digit: Digit }[] }
export type Lesson = {
  id: string
  title: string
  introduction: string
  board: Board
  candidates: readonly NoteMask[]
  explanation: string
  exercise: Exercise
  practiceDifficulty: Difficulty
}
const introductions: Record<Technique, string> = {
  'naked-single': '逐一排除同一行、列、宫里已出现的数字。如果只剩一个候选数，就可以落笔。',
  'hidden-single':
    '把注意力放在一个数字上：即使某格有多个候选数，这个数字也可能在整个单元里只有一个位置。',
  'locked-candidate':
    '观察行、列和宫的交叉。当一个数字在单元内的位置被锁定在交叉区，就能排除另一单元的其他位置。',
  'naked-pair': '如果同一单元中恰有两格都只剩相同的两个候选数，这两个数字就被这两格占住了。',
  'hidden-pair': '如果两个数字在一个单元里都只出现在相同的两格，这两格中的其他候选数就可以排除。',
}
const techniqueLessons = Object.entries(EXAMPLES).map(([id, example]): Lesson => {
  const step = example.step
  return {
    id,
    title: TECHNIQUE_NAMES[step.technique],
    introduction: introductions[step.technique],
    board: example.board,
    candidates: example.candidates,
    explanation: explainStep(step),
    exercise:
      step.kind === 'placement'
        ? { kind: 'placement', expected: { cell: step.cell, digit: step.digit } }
        : { kind: 'elimination', expected: step.removals },
    practiceDifficulty:
      step.technique === 'locked-candidate'
        ? 'medium'
        : step.technique.endsWith('pair')
          ? 'hard'
          : 'easy',
  }
})
export const LESSONS: readonly Lesson[] = [
  {
    id: 'rules',
    title: '认识数独',
    introduction:
      '在 9 × 9 的棋盘中填入 1–9。每一行、每一列、每个 3 × 3 宫中的数字都只能出现一次。题目给定的数字不能修改。',
    board: EXAMPLES['naked-single'].board,
    candidates: EXAMPLES['naked-single'].candidates,
    explanation:
      '先找只能填一个数字的位置。小数字是候选笔记，表示仍可考虑的数字；候选笔记本身不等于答案。' +
      explainStep(EXAMPLES['naked-single'].step),
    exercise: { kind: 'placement', expected: { cell: 40, digit: 5 } },
    practiceDifficulty: 'easy',
  },
  ...techniqueLessons.sort(
    (first, second) =>
      ['naked-single', 'hidden-single', 'locked-candidate', 'naked-pair', 'hidden-pair'].indexOf(
        first.id,
      ) -
      ['naked-single', 'hidden-single', 'locked-candidate', 'naked-pair', 'hidden-pair'].indexOf(
        second.id,
      ),
  ),
]
export function checkExercise(
  lesson: Lesson,
  answer: Exercise['expected'],
): { correct: boolean; explanation: string } {
  let correct = false
  if (lesson.exercise.kind === 'placement' && !Array.isArray(answer) && 'cell' in answer)
    correct =
      answer.cell === lesson.exercise.expected.cell &&
      answer.digit === lesson.exercise.expected.digit
  if (lesson.exercise.kind === 'elimination' && Array.isArray(answer)) {
    const supplied = new Set(answer.map((pair) => `${pair.cell}:${pair.digit}`))
    const expected = new Set(lesson.exercise.expected.map((pair) => `${pair.cell}:${pair.digit}`))
    correct = supplied.size === expected.size && [...expected].every((pair) => supplied.has(pair))
  }
  return {
    correct,
    explanation: correct
      ? '推理正确！' + lesson.explanation
      : '还差一点。请重新检查单元内候选数的位置，可以继续尝试。',
  }
}
