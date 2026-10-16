import { beforeAll, expect, it } from 'vitest'
import { createBindings } from '@sudoku/wasm/factory'
import type { AssessmentInputDto, BoardDto } from '@sudoku/wasm'
import { RATING_FIXTURES } from './fixtures/rating'
import { getTestModule } from './support/wasm'
import { copyRules } from '@/sudoku/ruleInput'

const bindings = createBindings()

beforeAll(async () => {
  await bindings.default({ module_or_path: getTestModule() })
})

it.each(RATING_FIXTURES)('returns the full assessment summary and work for $id', (fixture) => {
  const input = { board: [...fixture.board], rules: copyRules(fixture.rules) }

  const full = bindings.assess(input)
  const summary = bindings.assess_summary(input)
  if (full.result.status !== 'rated') {
    throw new Error('The authored rating fixture must complete')
  }

  expect(summary).toEqual({
    result: { status: 'rated', summary: full.result.summary },
    workUsed: full.workUsed,
  })
  expect(summary.result).not.toHaveProperty('trace')
})

const empty: BoardDto = Array<0>(81).fill(0)
const duplicate = [...empty]
duplicate[0] = 1
duplicate[1] = 1

const boundedCases: { name: string; input: AssessmentInputDto; status: string }[] = [
  { name: 'stalled', input: { board: empty, rules: { kind: 'classic' } }, status: 'ungraded' },
  {
    name: 'variant preparation limit',
    input: { board: empty, rules: { kind: 'diagonal' }, maxWork: 0 },
    status: 'budget-exhausted',
  },
  {
    name: 'contradictory',
    input: { board: duplicate, rules: { kind: 'classic' } },
    status: 'invalid',
  },
  {
    name: 'work limit',
    input: { board: empty, rules: { kind: 'classic' }, maxWork: 0 },
    status: 'budget-exhausted',
  },
  {
    name: 'step limit',
    input: { board: empty, rules: { kind: 'classic' }, limits: { maxSteps: 0, maxWork: 4000000 } },
    status: 'budget-exhausted',
  },
  {
    name: 'initial work overflow',
    input: { board: empty, rules: { kind: 'classic' }, maxWork: 0, initialWork: 1 },
    status: 'invalid',
  },
  {
    name: 'unknown rating version',
    input: { board: empty, rules: { kind: 'classic' }, ratingVersion: 'unknown' },
    status: 'invalid',
  },
]

it.each(boundedCases)('preserves the $name outcome and exact work', ({ input, status }) => {
  const full = bindings.assess(input)
  const summary = bindings.assess_summary(input)

  expect(full.result.status).toBe(status)
  expect(summary).toEqual(full)
})

it('retains explicit null difficulty when variant preparation is incomplete', () => {
  const result = bindings.assess_summary({ board: empty, rules: { kind: 'diagonal' }, maxWork: 0 })

  expect(result).toEqual({
    result: {
      status: 'budget-exhausted',
      ratingVersion: 'sudoku-rating-v2',
      variant: 'diagonal',
      stage: 'validation',
      difficulty: null,
    },
    workUsed: 0,
  })
})
