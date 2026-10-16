import { searchGeneration } from '@/core/sudoku/generation/search'
import type {
  GenerationInput,
  GenerationMetrics,
  GenerationResult,
} from '@/core/sudoku/generation/types'
import {
  parseGenerationInput,
  DEFAULT_GENERATION_LIMITS,
  parseGenerationLimits,
} from '@/core/sudoku/generation/input'

export function generatePuzzle(
  input: GenerationInput,
  limits = DEFAULT_GENERATION_LIMITS,
): GenerationResult {
  const metrics: GenerationMetrics = {
    constructionWork: 0,
    layouts: 0,
    completedLayouts: 0,
    candidateVisits: 0,
    workByStage: { preparation: 0, arithmetic: 0, exact: 0, logic: 0, proposals: 0 },
  }
  const parsed = parseGenerationInput(input)
  const parsedLimits = parseGenerationLimits(limits)
  if (!parsed.valid) {
    return { status: 'failed', reason: parsed.issues.join('; '), metrics }
  }
  if (!parsedLimits.valid) {
    return { status: 'failed', reason: parsedLimits.issues.join('; '), metrics }
  }

  return { ...searchGeneration(parsed.value, parsedLimits.value, metrics), metrics }
}
