import { directory } from 'virtual:sudoku-lessons'
import type { Difficulty, SudokuVariant } from '@/sudoku/contracts'
import { isDifficulty, isRecord } from '@/sudoku/values'
import { SUDOKU_VARIANTS, supportsDifficulty } from '@/sudoku/catalogue'
import { LESSON_IDS, lessonStageCount } from '@/features/learning/model/lessonIds'

export type LessonDirectoryEntry = {
  readonly id: string
  readonly order: number
  readonly title: string
  readonly introduction: string
  readonly practiceVariant: SudokuVariant
  readonly practiceDifficulty: Difficulty
  readonly stageCount: number
}

function decodeDirectory(source: unknown): readonly LessonDirectoryEntry[] {
  if (!Array.isArray(source) || source.length !== LESSON_IDS.length) {
    throw new Error('Invalid lesson directory')
  }
  return source.map((entry: unknown, index) => {
    if (!isRecord(entry)) {
      throw new Error('Invalid lesson directory entry')
    }
    const variant = SUDOKU_VARIANTS.find((variant) => variant === entry.practiceVariant)
    if (
      typeof entry.id !== 'string' ||
      entry.id !== LESSON_IDS[index] ||
      entry.order !== index ||
      typeof entry.title !== 'string' ||
      !entry.title.trim() ||
      typeof entry.introduction !== 'string' ||
      !entry.introduction.trim() ||
      !variant ||
      !isDifficulty(entry.practiceDifficulty) ||
      !supportsDifficulty(variant, entry.practiceDifficulty) ||
      entry.stageCount !== lessonStageCount(entry.id)
    ) {
      throw new Error(`Invalid lesson directory entry at ${index}`)
    }
    return Object.freeze({
      id: entry.id,
      order: index,
      title: entry.title,
      introduction: entry.introduction,
      practiceVariant: variant,
      practiceDifficulty: entry.practiceDifficulty,
      stageCount: entry.stageCount,
    })
  })
}

export const LESSON_DIRECTORY = Object.freeze(decodeDirectory(directory))
