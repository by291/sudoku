import type { BoardDto, RulesDto } from '@sudoku/wasm'

// Pure generated contracts. Importing domain types never initializes WASM or browser services.
export type {
  DigitDto as Digit,
  DifficultyDto as Difficulty,
  VariantDto as SudokuVariant,
  MetadataDto as RuleMetadata,
  LogicalStepDto as LogicalStep,
  TechniqueDto as Technique,
  HintResultDto as HintResult,
  AssessmentSummaryDto as DifficultyAssessment,
  AssessmentResultDto as AssessmentResult,
  PuzzleAssessmentDto as PuzzleAssessment,
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
  EditWorkDto,
  SearchWorkDto,
} from '@sudoku/wasm'

/** Borrowed requests are read-only; binding conversion produces owned Rust values. */
export type ReadonlyContract<T> = T extends readonly (infer Item)[]
  ? readonly ReadonlyContract<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: ReadonlyContract<T[Key]> }
    : T

export type Board = Readonly<BoardDto>
export type PuzzleRules = ReadonlyContract<RulesDto>
export type { ParsedOutcomeDto } from '@sudoku/wasm'
