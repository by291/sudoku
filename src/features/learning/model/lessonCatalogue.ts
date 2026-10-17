import type { SudokuVariant } from '@/sudoku/contracts'
import { isDifficulty, isRecord } from '@/sudoku/values'
import { SUDOKU_VARIANTS, supportsDifficulty } from '@/sudoku/catalogue'
import { LESSON_IDS, lessonStageCount } from '@/features/learning/model/lessonIds'
import type { Lesson } from '@/features/learning/model/lessons'
import type { ExerciseStage, ExerciseAnswer } from '@/features/learning/model/exerciseStages'
import { stageAnswer } from '@/features/learning/model/exerciseStages'
import { isExerciseAnswer, isExerciseStage } from '@/features/learning/model/lessonStageShape'

type AuthoredStage = ExerciseStage & {
  answer: ExerciseAnswer
  explanation: string
  candidateOrigin: 'base-candidates' | 'authored-preconditions'
}

type AuthoredLesson = {
  id: string
  title: string
  introduction: string
  explanation: string
  practiceVariant: SudokuVariant
  practiceDifficulty: Lesson['practiceDifficulty']
  guided: AuthoredStage
  exercises: readonly { title: string; stages: readonly AuthoredStage[] }[]
  transfer: { kind: 'transpose' | 'rotate' | 'swap-rows'; source: 'focused' | 'authored-alternate' }
}

function hasChineseCopy(value: unknown): value is string {
  return typeof value === 'string' && /[\u4e00-\u9fff]/u.test(value)
}

function isStage(value: unknown): value is AuthoredStage {
  if (!isRecord(value) || !hasChineseCopy(value.explanation)) {
    return false
  }
  if (
    value.candidateOrigin !== 'base-candidates' &&
    value.candidateOrigin !== 'authored-preconditions'
  ) {
    return false
  }

  return isExerciseAnswer(value.answer) && isExerciseStage(value)
}

function isLesson(value: unknown): value is AuthoredLesson {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    !hasChineseCopy(value.introduction) ||
    !hasChineseCopy(value.explanation)
  ) {
    return false
  }
  if (
    !SUDOKU_VARIANTS.some((variant) => variant === value.practiceVariant) ||
    !isDifficulty(value.practiceDifficulty)
  ) {
    return false
  }
  if (
    !isRecord(value.transfer) ||
    !['transpose', 'rotate', 'swap-rows'].includes(String(value.transfer.kind)) ||
    !['focused', 'authored-alternate'].includes(String(value.transfer.source))
  ) {
    return false
  }
  if (!isStage(value.guided) || !Array.isArray(value.exercises) || value.exercises.length !== 2) {
    return false
  }
  return value.exercises.every(
    (exercise: unknown) =>
      isRecord(exercise) &&
      hasChineseCopy(exercise.title) &&
      Array.isArray(exercise.stages) &&
      exercise.stages.length > 0 &&
      exercise.stages.every((stage: unknown) => isStage(stage)),
  )
}

function stageSnapshot(stage: AuthoredStage): ExerciseStage {
  if (JSON.stringify(stage.answer) !== JSON.stringify(stageAnswer(stage))) {
    throw new Error('Authored stage answer disagrees with its evidence conclusion')
  }
  return { board: stage.board, candidates: stage.candidates, rules: stage.rules, step: stage.step }
}

/** Parsing owns a fresh snapshot; no consumer can mutate the imported catalogue or a later load. */
export function loadLessonCatalogue(source: unknown): readonly Lesson[] {
  const value: unknown = structuredClone(source)
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.provenance) ||
    typeof value.provenance.source !== 'string' ||
    !Array.isArray(value.lessons) ||
    value.lessons.length !== LESSON_IDS.length
  ) {
    throw new Error('Invalid lesson catalogue schema')
  }

  return value.lessons.map((input: unknown, index) => decodeLesson(input, LESSON_IDS[index]))
}

/** Decode a fresh owned lesson; module objects and later loads never share mutable arrays. */
export function decodeLesson(source: unknown, expectedId: string): Lesson {
  const input: unknown = structuredClone(source)
  if (
    !isLesson(input) ||
    input.id !== expectedId ||
    !supportsDifficulty(input.practiceVariant, input.practiceDifficulty)
  ) {
    throw new Error(`Invalid lesson catalogue entry for ${expectedId}`)
  }
  const guided = stageSnapshot(input.guided)
  const exercises = input.exercises.map((exercise) => ({
    title: exercise.title,
    stages: exercise.stages.map(stageSnapshot),
  }))
  const stages = exercises.flatMap((exercise) => exercise.stages)
  if (
    stages.length !== lessonStageCount(input.id) ||
    JSON.stringify(guided) !== JSON.stringify(stages[0]) ||
    stages.some((stage) => stage.rules.kind !== input.practiceVariant) ||
    (input.transfer.kind === 'swap-rows' && input.practiceVariant !== 'classic')
  ) {
    throw new Error(`Invalid lesson stage order or variant in ${input.id}`)
  }

  return {
    id: input.id,
    title: input.title,
    introduction: input.introduction,
    explanation: input.explanation,
    practiceDifficulty: input.practiceDifficulty,
    practiceVariant: input.practiceVariant,
    guided,
    exercises,
  }
}
