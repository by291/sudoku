import { createLessons } from '@/features/learning/model/lessons'
import type { NewSudokuVariant } from '@/sudoku/contracts'

export const LESSONS = createLessons()

function variantExample(variant: NewSudokuVariant) {
  const stage = LESSONS.find((lesson) => lesson.id === `${variant}-rules`)?.guided
  if (!stage || stage.step.kind !== 'placement') {
    throw new Error(`Missing variant rule example: ${variant}`)
  }
  return { ...stage, step: stage.step }
}

export const VARIANT_EXAMPLES = {
  diagonal: variantExample('diagonal'),
  jigsaw: variantExample('jigsaw'),
  killer: variantExample('killer'),
  thermo: variantExample('thermo'),
  arrow: variantExample('arrow'),
}
