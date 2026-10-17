import type { Difficulty, SudokuVariant } from '@/sudoku/contracts'
import type {
  ExerciseStage,
  LessonExercise,
  ExerciseAnswer,
} from '@/features/learning/model/exerciseStages'

export type Lesson = {
  id: string
  title: string
  introduction: string
  explanation: string
  practiceDifficulty: Difficulty
  practiceVariant: SudokuVariant
  guided: ExerciseStage
  exercises: readonly LessonExercise[]
}

export function lessonStages(lesson: Lesson): readonly ExerciseStage[] {
  return lesson.exercises.flatMap((exercise) => exercise.stages)
}

export function checkExercise(
  exercise: { answer: ExerciseAnswer; explanation: string },
  answer: ExerciseAnswer['expected'],
): { correct: boolean; explanation: string } {
  let correct = false
  if (exercise.answer.kind === 'placement' && !Array.isArray(answer) && 'cell' in answer) {
    correct =
      answer.cell === exercise.answer.expected.cell &&
      answer.digit === exercise.answer.expected.digit
  }

  if (exercise.answer.kind === 'elimination' && Array.isArray(answer)) {
    const supplied = new Set(answer.map((pair) => `${pair.cell}:${pair.digit}`))
    const expected = new Set(exercise.answer.expected.map((pair) => `${pair.cell}:${pair.digit}`))
    correct = supplied.size === expected.size && [...expected].every((pair) => supplied.has(pair))
  }

  return {
    correct,
    explanation: correct
      ? '推理正确！' + exercise.explanation
      : '还差一点。请重新检查单元内候选数的位置，可以继续尝试。',
  }
}

/**
 * Advance and completion require durable progress. Cancelled and save-failed outcomes retain
 * correct-answer feedback, but cannot authorize a transition to the next stage or practice.
 */
export type ExerciseSubmissionResult =
  | { kind: 'incorrect'; explanation: string }
  | { kind: 'unavailable'; explanation: string }
  | { kind: 'cancelled'; explanation: string }
  | { kind: 'save-failed'; explanation: string }
  | { kind: 'advance'; explanation: string }
  | { kind: 'completed'; explanation: string }
