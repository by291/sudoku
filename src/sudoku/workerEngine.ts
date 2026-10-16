import { createBindings } from '@sudoku/wasm/factory'
import type { Board, PuzzleRules } from '@/sudoku/contracts'
import type { AssessmentInput, AssessmentOutcome } from '@/sudoku/contracts'
import type { GenerationInput } from '@/sudoku/generationInput'
import { validateEngineInfo, validateModuleExports } from '@/sudoku/guards'
import { copyRules } from '@/sudoku/ruleInput'

/** One isolated Worker owns this instance until the client terminates it. */
export async function createWorkerEngine(module: WebAssembly.Module) {
  validateModuleExports(module)
  const bindings = createBindings()
  await bindings.default({ module_or_path: module })
  validateEngineInfo(bindings.engine_info())

  return {
    validateRules: (value: unknown) => bindings.validate_rules(value),
    validatePuzzle: (value: unknown) => bindings.validate_puzzle(value),
    generate(input: GenerationInput) {
      return bindings.generate(input.seed, {
        variant: input.variant,
        difficulty: input.difficulty,
        puzzleVersion: input.puzzleVersion,
      })
    },
    assess(input: AssessmentInput): AssessmentOutcome {
      const result = bindings.assess({
        board: [...input.board],
        rules: copyRules(input.rules),
        ratingVersion: input.ratingVersion,
        limits: { ...input.limits },
      }).result
      return result.status === 'rated' ? { status: 'rated', summary: result.summary } : result
    },
    hint(board: Board, solution: Board, rules: PuzzleRules) {
      return bindings.hint({
        board: [...board],
        solution: [...solution],
        rules: copyRules(rules),
        maxSteps: 500,
        maxWork: 1000000,
      }).result
    },
  }
}
