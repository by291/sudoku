import { testEngine } from './semantics'
import { createLessons } from '@/features/learning/model/lessons'
import { createVariantExamples } from '@/features/learning/model/variantExamples'

export const LESSONS = createLessons(testEngine)
export const { VARIANT_EXAMPLES } = createVariantExamples(testEngine)
