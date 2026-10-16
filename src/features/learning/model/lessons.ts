import type {
  Board,
  Difficulty,
  NoteMask,
  PuzzleRules,
  SudokuVariant,
  LessonCalculation,
} from '@/sudoku/contracts'
import type {
  ExerciseStage,
  LessonExercise,
  ExerciseAnswer,
} from '@/features/learning/model/exerciseStages'
import { loadLessonCatalogue } from '@/features/learning/model/lessonCatalogue'

export type Exercise = ExerciseAnswer

export type Lesson = {
  id: string
  title: string
  introduction: string
  board: Board
  candidates: readonly NoteMask[]
  explanation: string
  exercise: Exercise
  practiceDifficulty: Difficulty
  rules: PuzzleRules
  practiceVariant: SudokuVariant
  guided: ExerciseStage
  exercises: readonly LessonExercise[]
}

/** Load one owned course snapshot and validate its mathematical evidence through Rust. */
export function createLessons(calculation: LessonCalculation): readonly Lesson[] {
  return loadLessonCatalogue(calculation)
}

export function lessonStages(lesson: Lesson): readonly ExerciseStage[] {
  return lesson.exercises.flatMap((exercise) => exercise.stages)
}

export function checkExercise(
  lesson: Lesson,
  answer: Exercise['expected'],
): { correct: boolean; explanation: string } {
  let correct = false
  if (lesson.exercise.kind === 'placement' && !Array.isArray(answer) && 'cell' in answer) {
    correct =
      answer.cell === lesson.exercise.expected.cell &&
      answer.digit === lesson.exercise.expected.digit
  }

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
