import { expectTypeOf, test } from 'vitest'
import type {
  assess,
  generate,
  derive_seed,
  count_solutions,
  hint,
  parse_assessment_summary,
  PreparedPuzzle,
  WorkResultDto,
  AssessmentResultDto,
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
  expectTypeOf<ReturnType<typeof assess>>().toEqualTypeOf<WorkResultDto<AssessmentResultDto>>()
  expectTypeOf<ReturnType<typeof hint>>().toEqualTypeOf<WorkResultDto<HintResultDto>>()
  expectTypeOf<ReturnType<typeof count_solutions>>().toEqualTypeOf<WorkResultDto<SearchResultDto>>()
  expectTypeOf<ReturnType<PreparedPuzzle['candidates']>>().toEqualTypeOf<
    WorkResultDto<CandidateResultDto>
  >()
  expectTypeOf<ReturnType<typeof parse_assessment_summary>>().toEqualTypeOf<
    ParsedAssessmentDto<AssessmentSummaryDto>
  >()
})
