import { createBindings } from '@sudoku/wasm/factory'
import type { GenerationLimitsDto, LogicInputDto } from '@sudoku/wasm'
import type {
  AssessmentInput,
  LiveAssessmentOutcome,
  AssessmentResult,
  Board,
  PuzzleRules,
} from '@/sudoku/contracts'
import type { GenerationInput } from '@/sudoku/generationInput'
import { copyRules } from '@/sudoku/ruleInput'
import { getTestModule } from './wasm'

// Fixture construction and transport checks use the actual Rust implementation.
// Mathematical expectations must come from authored fixtures or independent test solvers.
const bindings = createBindings()
await bindings.default({ module_or_path: getTestModule() })

export const DEFAULT_GENERATION_LIMITS: GenerationLimitsDto = {
  maxLayouts: 40,

  maxSteps: 500,
}

export function generatePuzzle(input: GenerationInput, limits?: GenerationLimitsDto) {
  return bindings.generate(input.seed, {
    variant: input.variant,
    difficulty: input.difficulty,
    puzzleVersion: input.puzzleVersion,
    ...(limits ? { limits } : {}),
  })
}

export function assessPuzzle(input: AssessmentInput) {
  return bindings.assess({
    ...input,
    board: [...input.board],
    rules: copyRules(input.rules),
  }).result
}

export function toAssessmentOutcome(result: AssessmentResult): LiveAssessmentOutcome {
  return result.status === 'rated' ? { status: 'rated', summary: result.summary } : result
}

export function analyzeHint(board: Board, solution: Board, rules: PuzzleRules) {
  return bindings.hint({ board: [...board], solution: [...solution], rules: copyRules(rules) })
    .result
}

export function analyzeLogic(input: LogicInputDto) {
  return bindings.analyze_logic(input).result
}
