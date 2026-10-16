import type {
  BoardDto,
  TransformInputDto,
  ValidationDto,
  RulesDto,
  LogicalStepDto,
  HintResultDto,
  AssessmentSummaryDto,
  AssessmentResultDto,
  PuzzleAssessmentDto,
  AssessmentOutcomeDto,
  EvidenceDto,
  RuleEvidenceDto,
  UnitDto,
  TechniqueDto as Technique,
  DifficultyDto as Difficulty,
  VariantDto as SudokuVariant,
} from '@sudoku/wasm'

// Pure generated contracts. Importing domain types never initializes WASM or browser services.
export type {
  DigitDto as Digit,
  DifficultyDto as Difficulty,
  VariantDto as SudokuVariant,
  MetadataDto as RuleMetadata,
  TechniqueDto as Technique,
  GenerationResultDto as GenerationResult,
  GeneratedPuzzleDto as GeneratedPuzzle,
  GenerationOptionsDto as GenerationOptions,
  PuzzleContentDto as PuzzleContent,
  ValidationDto as PuzzleValidation,
  AssessmentValidationInputDto,
  AssessmentValidationDto,
  HintValidationInputDto,
  HintValidationDto,
  TransformInputDto,
  BoardQueryDto,
  PreparedCountInputDto,
  EditInputDto,
  CandidateWorkDto,
  ConflictWorkDto,
  ViolationDto as RuleViolation,
  EditWorkDto,
  SearchWorkDto,
} from '@sudoku/wasm'

/** Borrowed requests are read-only; binding conversion produces owned Rust values. */
export type ReadonlyContract<T> = T extends object
  ? { readonly [Key in keyof T]: ReadonlyContract<T[Key]> }
  : T

export type Board = Readonly<BoardDto>
export type PuzzleRules = ReadonlyContract<RulesDto>
export type { ParsedOutcomeDto } from '@sudoku/wasm'

export type LogicalStep = ReadonlyContract<LogicalStepDto>
export type HintResult = ReadonlyContract<HintResultDto>
export type DifficultyAssessment = ReadonlyContract<AssessmentSummaryDto>
export type AssessmentResult = ReadonlyContract<AssessmentResultDto>
export type AssessmentOutcome = ReadonlyContract<AssessmentOutcomeDto>
export type PuzzleAssessment = ReadonlyContract<PuzzleAssessmentDto>
export type Unit = ReadonlyContract<UnitDto>
export type RuleEvidence = ReadonlyContract<RuleEvidenceDto>
export type AdvancedEvidence = Extract<
  ReadonlyContract<EvidenceDto>,
  { kind: 'subset' | 'fish' | 'wing' | 'coloring' }
>
export type BasicClassicTechnique = Extract<
  Technique,
  'naked-single' | 'hidden-single' | 'locked-candidate' | 'naked-pair' | 'hidden-pair'
>
export type AdvancedTechnique = Extract<
  Technique,
  'naked-triple' | 'hidden-triple' | 'x-wing' | 'swordfish' | 'xy-wing' | 'simple-coloring'
>
export type ClassicTechnique = BasicClassicTechnique | AdvancedTechnique
export type CellValue = Board[number]
export type NoteMask = number
export type StandardDifficulty = Exclude<Difficulty, 'expert'>
export type NewSudokuVariant = Exclude<SudokuVariant, 'classic'>
export type RulesFor<Kind extends SudokuVariant> = Extract<PuzzleRules, { kind: Kind }>
export type ParseResult<Value> =
  { valid: true; value: Value } | { valid: false; issues: readonly string[] }
export type Puzzle = {
  givens: Board
  solution: Board
  rules: PuzzleRules
  difficulty: Difficulty
  seed: string
  puzzleVersion: string
}
export type AssessmentLimits = { maxSteps: number; maxWork: number }
export type AssessmentInput = {
  board: Board
  rules: PuzzleRules
  ratingVersion: 'sudoku-rating-v2'
  limits: AssessmentLimits
}
export type LogicalState = { board: Board; candidates: readonly NoteMask[] }

/** Pure lesson construction receives computation explicitly, without importing a WASM loader. */
export interface LessonCalculation {
  prepare(rules: PuzzleRules): { baseCandidates(board: Board): readonly number[]; dispose(): void }
  transformRules(input: TransformInputDto): PuzzleRules
  validateTeachingStep(value: unknown): ValidationDto
}
