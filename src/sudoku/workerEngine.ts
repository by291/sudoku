import { createBindings } from '@sudoku/wasm/factory'
import type { Board, PuzzleRules } from '@/sudoku/contracts'
import type { AssessmentInput, LiveAssessmentOutcome } from '@/sudoku/contracts'
import type { GenerationInput } from '@/sudoku/generationInput'
import { validateEngineInfo, validateModuleExports } from '@/sudoku/guards'
import { copyRules } from '@/sudoku/ruleInput'
import type { GenerateNotesInput } from '@/worker/protocol'

/** One isolated Worker owns this instance until the client terminates it. */
export async function createWorkerEngine(module: WebAssembly.Module) {
  validateModuleExports(module)
  const bindings = createBindings()
  await bindings.default({ module_or_path: module })
  validateEngineInfo(bindings.engine_info())

  function withPrepared<T>(
    rules: PuzzleRules,
    compute: (layout: InstanceType<typeof bindings.PreparedPuzzle>) => T,
  ) {
    const layout = new bindings.PreparedPuzzle({
      rules: copyRules(rules),
    })
    try {
      return { computation: compute(layout) }
    } finally {
      layout.free()
    }
  }

  return {
    conflicts(board: Board, rules: PuzzleRules) {
      return withPrepared(rules, (layout) => layout.conflicts({ board: [...board] }))
    },
    generateNotes(input: GenerateNotesInput) {
      return withPrepared(input.rules, (layout) =>
        layout.edit({
          givens: [...input.givens],
          entries: [...input.entries],
          notes: [...input.notes],
          action: { kind: 'generate-notes' },
        }),
      )
    },
    validateRules: (value: unknown) => bindings.validate_rules(value),
    validatePuzzle: (value: unknown) => bindings.validate_puzzle(value),
    generate(input: GenerationInput) {
      return bindings.generate(input.seed, {
        variant: input.variant,
        difficulty: input.difficulty,
        puzzleVersion: input.puzzleVersion,
      })
    },
    assess(input: AssessmentInput): LiveAssessmentOutcome {
      const result = bindings.assess_summary({
        board: [...input.board],
        rules: copyRules(input.rules),
        ratingVersion: input.ratingVersion,
        limits: { ...input.limits },
      }).result
      return result
    },
    hint(board: Board, solution: Board, rules: PuzzleRules) {
      return bindings.hint({
        board: [...board],
        solution: [...solution],
        rules: copyRules(rules),
        maxSteps: 500,
      }).result
    },
  }
}
