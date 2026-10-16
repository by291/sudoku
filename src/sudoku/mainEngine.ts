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
  PreparedCountInputDto,
  SearchWorkDto,
  EditInputDto,
  EditWorkDto,
  PuzzleValidation,
  AssessmentValidationInputDto,
  AssessmentValidationDto,
  HintValidationDto,
  TransformInputDto,
  ParsedOutcomeDto,
} from '@/sudoku/contracts'

type Bindings = ReturnType<typeof createBindings>

/** Owns a prepared layout. Returned DTOs are independent copies; disposal is idempotent. */
export interface PreparedPuzzle {
  readonly preparationWork: number
  metadata(): RuleMetadata
  candidates(input: BoardQueryDto): CandidateWorkDto
  conflicts(input: BoardQueryDto): ConflictWorkDto
  countSolutions(input: PreparedCountInputDto): SearchWorkDto
  edit(input: EditInputDto): EditWorkDto
  isComplete(board: Board): boolean
  dispose(): void
}

/** Synchronous bounded operations only. Heavy generation, assessment and hints belong to Workers. */
export interface MainSudokuEngine {
  prepare(rules: PuzzleRules): PreparedPuzzle
  deriveSeed(material: Uint8Array): Uint8Array
  validatePuzzle(content: unknown): PuzzleValidation
  validateRules(rules: unknown): PuzzleValidation
  parseHint(value: unknown): HintValidationDto
  validateAssessment(input: AssessmentValidationInputDto): AssessmentValidationDto
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
      const resource: PreparedPuzzle = {
        get preparationWork() {
          return prepared().preparationWork
        },
        metadata: () => prepared().metadata(),
        candidates: (input) => prepared().candidates(input),
        conflicts: (input) => prepared().conflicts(input),
        countSolutions: (input) => prepared().count_solutions(input),
        edit: (input) => prepared().edit(input),
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
    parseHint: (value) => active().parse_hint(value),
    validateAssessment: (input) => active().validate_assessment(input),
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
