import { expectTypeOf, test } from 'vitest'
import type {
  assess,
  assess_summary,
  generate,
  derive_seed,
  count_solutions,
  hint,
  parse_assessment_summary,
  PreparedPuzzle,
  ComputationResultDto,
  AssessmentResultDto,
  AssessmentOutcomeDto,
  LiveAssessmentOutcomeDto,
  parse_live_assessment_outcome,
  parse_assessment_outcome,
  SearchResultDto,
  CandidateResultDto,
  HintResultDto,
  ParsedAssessmentDto,
  AssessmentSummaryDto,
} from '@sudoku/wasm'

test('generated_exports_preserve_concrete_result_types', () => {
  expectTypeOf<ReturnType<typeof assess>>().not.toBeAny()
  expectTypeOf<ReturnType<PreparedPuzzle['candidates']>['result']>().not.toBeAny()
  expectTypeOf<Parameters<typeof generate>[0]>().toEqualTypeOf<Uint8Array>()
  expectTypeOf<Parameters<typeof derive_seed>[0]>().toEqualTypeOf<Uint8Array>()
  expectTypeOf<Parameters<typeof parse_assessment_summary>[0]>().toBeUnknown()
  expectTypeOf<ReturnType<typeof assess>>().toEqualTypeOf<
    ComputationResultDto<AssessmentResultDto>
  >()
  expectTypeOf<ReturnType<typeof assess_summary>>().toEqualTypeOf<
    ComputationResultDto<LiveAssessmentOutcomeDto>
  >()
  expectTypeOf<
    Extract<ReturnType<typeof assess_summary>['result'], { status: 'rated' }>
  >().not.toHaveProperty('trace')
  expectTypeOf<ReturnType<typeof parse_live_assessment_outcome>>().toEqualTypeOf<
    ParsedAssessmentDto<LiveAssessmentOutcomeDto>
  >()
  expectTypeOf<ReturnType<typeof parse_assessment_outcome>>().toEqualTypeOf<
    ParsedAssessmentDto<AssessmentOutcomeDto>
  >()
  expectTypeOf<ReturnType<typeof hint>>().toEqualTypeOf<ComputationResultDto<HintResultDto>>()
  expectTypeOf<ReturnType<typeof count_solutions>>().toEqualTypeOf<
    ComputationResultDto<SearchResultDto>
  >()
  expectTypeOf<ReturnType<PreparedPuzzle['candidates']>>().toEqualTypeOf<
    ComputationResultDto<CandidateResultDto>
  >()
  expectTypeOf<ReturnType<typeof parse_assessment_summary>>().toEqualTypeOf<
    ParsedAssessmentDto<AssessmentSummaryDto>
  >()
})

test('nested_records_and_nulls_match_the_actual_js_values', () => {
  expectTypeOf<import('@sudoku/wasm').WorkloadDto['techniqueCounts']>().toEqualTypeOf<
    Record<import('@sudoku/wasm').TechniqueDto, number>
  >()
  expectTypeOf<import('@sudoku/wasm').WorkloadDto['highestTier']>().toEqualTypeOf<
    import('@sudoku/wasm').DifficultyDto | null
  >()
})

test('preserves fixed-size proof tuples in read-only application contracts', () => {
  expectTypeOf<
    Extract<import('@/sudoku/contracts').AdvancedEvidence, { kind: 'wing' }>['wings']
  >().toEqualTypeOf<readonly [number, number]>()
  expectTypeOf<
    Extract<import('@/sudoku/contracts').AdvancedEvidence, { kind: 'coloring' }>['colors']
  >().toEqualTypeOf<readonly [readonly number[], readonly number[]]>()
})
