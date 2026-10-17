import { copyRules } from '@/sudoku/ruleInput'
import { createBindings } from '@sudoku/wasm/factory'
import { validateEngineInfo, validateModuleExports } from '@/sudoku/guards'
import type {
  Board,
  PuzzleRules,
  RuleMetadata,
  BoardQueryDto,
  CandidateWorkDto,
  ConflictWorkDto,
  EditInputDto,
  EditWorkDto,
  PuzzleValidation,
  AssessmentValidationInputDto,
  AssessmentValidationDto,
  HintValidationDto,
  TransformInputDto,
  ParsedOutcomeDto,
  ParsedLiveOutcomeDto,
} from '@/sudoku/contracts'

type Bindings = ReturnType<typeof createBindings>

/** Owns a prepared layout. Returned DTOs are independent copies; disposal is idempotent. */
export interface PreparedPuzzle {
  readonly liveExecution: 'immediate' | 'worker'
  readonly preparationWork: number
  baseCandidates(board: Board): readonly number[]
  metadata(): RuleMetadata
  candidates(input: BoardQueryDto): CandidateWorkDto
  previewConflicts(board: Board): ConflictWorkDto
  conflicts(input: BoardQueryDto): ConflictWorkDto
  edit(input: EditInputDto): EditWorkDto
  reviewEntries(board: Board, solution: Board): readonly number[]
  isComplete(board: Board): boolean
  dispose(): void
}

/** Synchronous bounded operations only. Heavy generation, assessment and hints belong to Workers. */
export interface MainSudokuEngine {
  prepare(rules: PuzzleRules): PreparedPuzzle
  deriveSeed(material: Uint8Array): Uint8Array
  validatePuzzle(content: unknown): PuzzleValidation
  validateRules(rules: unknown): PuzzleValidation
  validateTeachingStep(value: unknown): PuzzleValidation
  parseConflicts(value: unknown): ConflictWorkDto
  parseEdit(value: unknown): EditWorkDto
  parseHint(value: unknown): HintValidationDto
  validateAssessment(input: AssessmentValidationInputDto): AssessmentValidationDto
  validateLiveAssessmentOutcome(value: unknown): ParsedLiveOutcomeDto
  validateAssessmentOutcome(value: unknown): ParsedOutcomeDto
  validateHint(input: unknown): HintValidationDto
  transformRules(input: TransformInputDto): PuzzleRules
  dispose(): void
}

export async function createMainEngine(module: WebAssembly.Module): Promise<MainSudokuEngine> {
  validateModuleExports(module)
  let bindings: Bindings | null = createBindings()
  await bindings.default({ module_or_path: module })
  validateEngineInfo(bindings.engine_info())
  const resources = new Set<PreparedPuzzle>()

  function active(): Bindings {
    if (!bindings) {
      throw new Error('Sudoku engine has been disposed')
    }
    return bindings
  }

  return {
    prepare(rules) {
      let raw: InstanceType<Bindings['PreparedPuzzle']> | null = new (active().PreparedPuzzle)({
        rules: copyRules(rules),
      })
      function prepared() {
        if (!raw) {
          throw new Error('Prepared puzzle has been disposed')
        }
        return raw
      }
      function requireImmediate() {
        if (prepared().liveExecution === 'worker') {
          throw new Error('This layout requires Worker computation')
        }
      }
      const resource: PreparedPuzzle = {
        get liveExecution() {
          return prepared().liveExecution
        },
        get preparationWork() {
          return prepared().preparationWork
        },
        baseCandidates: (board) => Array.from(prepared().base_candidates([...board])),
        metadata: () => prepared().metadata(),
        candidates(input) {
          requireImmediate()
          return prepared().candidates(input)
        },
        previewConflicts: (board) =>
          prepared().conflicts({ board: [...board], work: { maxWork: 0 } }),
        conflicts(input) {
          requireImmediate()
          return prepared().conflicts(input)
        },
        edit(input) {
          if (input.action.kind === 'generate-notes') {
            requireImmediate()
          }
          return prepared().edit(input)
        },
        reviewEntries: (board, solution) =>
          Array.from(prepared().review_entries({ board: [...board], solution: [...solution] })),
        isComplete: (board) => prepared().is_complete([...board]),
        dispose() {
          if (raw) {
            raw.free()
            raw = null
            resources.delete(resource)
          }
        },
      }
      resources.add(resource)
      return resource
    },
    deriveSeed: (material) => active().derive_seed(material),
    validatePuzzle: (content) => active().validate_puzzle(content),
    validateRules: (rules) => active().validate_rules(rules),
    validateTeachingStep: (value) => active().validate_teaching_step(value),
    parseConflicts: (value) => active().parse_conflicts(value),
    parseEdit: (value) => active().parse_edit(value),
    parseHint: (value) => active().parse_hint(value),
    validateAssessment: (input) => active().validate_assessment(input),
    validateLiveAssessmentOutcome: (value) => active().parse_live_assessment_outcome(value),
    validateAssessmentOutcome: (value) => active().parse_assessment_outcome(value),
    validateHint: (input) => active().validate_hint_evidence(input),
    transformRules: (input) => active().transform_rules(input),
    dispose() {
      for (const resource of resources) {
        resource.dispose()
      }
      // Dropping the closure releases memory too; no per-instance ESM module cache is retained.
      bindings = null
    },
  }
}
