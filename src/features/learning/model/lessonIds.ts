import type { SudokuVariant } from '@/sudoku/contracts'
import { SUDOKU_VARIANTS } from '@/sudoku/catalogue'

export const LESSON_IDS = [
  'rules',
  'naked-single',
  'hidden-single',
  'locked-candidate',
  'naked-pair',
  'hidden-pair',
  'naked-triple',
  'hidden-triple',
  'x-wing',
  'swordfish',
  'xy-wing',
  'simple-coloring',
  'diagonal-rules',
  'diagonal-singles',
  'diagonal-intersections',
  'diagonal-combined',
  'jigsaw-rules',
  'jigsaw-singles',
  'jigsaw-intersections',
  'jigsaw-combined',
  'killer-rules',
  'killer-remainder',
  'killer-combinations',
  'killer-combined',
  'thermo-rules',
  'thermo-bounds',
  'thermo-interactions',
  'thermo-combined',
  'arrow-rules',
  'arrow-equations',
  'arrow-combinations',
  'arrow-combined',
] as const

/** Check whether an ID identifies a known lesson. */
export function isLessonId(value: unknown): value is (typeof LESSON_IDS)[number] {
  return LESSON_IDS.some((id) => id === value)
}

/** Return the number of authored stages for a lesson ID. */
export function lessonStageCount(id: string): number {
  return id.endsWith('-combined') ? 6 : 2
}

/** Stable course IDs own navigation metadata independently of exercise construction. */
/** Look up the practice variant for a known lesson ID. */
export function lessonVariant(id: unknown): SudokuVariant | null {
  if (!isLessonId(id)) {
    return null
  }
  return SUDOKU_VARIANTS.find((variant) => id.startsWith(`${variant}-`)) ?? 'classic'
}
