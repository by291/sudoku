import { beforeAll, expect, it } from 'vitest'
import { createBindings } from '@sudoku/wasm/factory'
import type { BoardDto, RulesDto, ViolationDto } from '@sudoku/wasm'
import { getTestModule } from './support/wasm'
import { RATING_FIXTURES } from './fixtures/rating'
import { copyRules } from '@/sudoku/ruleInput'

const bindings = createBindings()
beforeAll(async () => {
  await bindings.default({ module_or_path: getTestModule() })
})

it('transports a literal duplicate fact from assessment', () => {
  const board = Array<0 | 1>(81).fill(0)
  board[0] = 1
  board[1] = 1

  expect(bindings.assess({ board, rules: { kind: 'classic' } }).result).toMatchObject({
    status: 'invalid',
    issues: expect.arrayContaining([
      {
        kind: 'violation',
        violation: { constraintId: 'row:0', cells: [0, 1], code: { kind: 'duplicate' } },
      },
    ]),
  })
})

it('has a live parser distinct from the historical string parser', () => {
  expect(typeof Reflect.get(bindings, 'parse_live_assessment_outcome')).toBe('function')
})

const literalIssues = [
  { kind: 'message', message: '  diagnostic  ' },
  {
    kind: 'violation',
    violation: {
      constraintId: 'cage:2',
      cells: [12, 3],
      code: { kind: 'cage-total', index: 2, sum: 11 },
    },
  },
  {
    kind: 'violation',
    violation: {
      constraintId: 'thermo:4',
      cells: [20, 11, 2],
      code: { kind: 'thermo-order', index: 4 },
    },
  },
  {
    kind: 'violation',
    violation: {
      constraintId: 'arrow:6',
      cells: [30, 21, 12],
      code: { kind: 'arrow-total', index: 6 },
    },
  },
]

it('validates and owns literal diagnostic identities, cells and typed details', () => {
  const input = { status: 'invalid', issues: structuredClone(literalIssues) }
  const expected = { valid: true, value: structuredClone(input) }

  const parsed = bindings.parse_live_assessment_outcome(input)
  input.issues.length = 0

  expect(parsed).toEqual(expected)
})

it('keeps the historical parser and stored text separate from live diagnostics', () => {
  const old = { status: 'invalid', issues: ['historical text'] }

  expect(bindings.parse_assessment_outcome(old)).toEqual({ valid: true, value: old })
  expect(bindings.parse_live_assessment_outcome(old).valid).toBe(false)
  expect(
    bindings.validate_assessment({
      present: true,
      value: {
        status: 'unavailable',
        reason: 'invalid-input',
        issues: ['原始历史文本', '  keep whitespace  '],
      },
      identity: { variant: 'classic', difficulty: 'easy' },
    }),
  ).toEqual({
    status: 'present',
    value: {
      status: 'unavailable',
      reason: 'invalid-input',
      issues: ['原始历史文本', '  keep whitespace  '],
    },
  })
  expect(
    bindings.validate_assessment({
      present: true,
      value: { status: 'rated', summary: { ratingVersion: 'future', workload: { steps: 1n } } },
      identity: { variant: 'classic', difficulty: 'easy' },
    }),
  ).toMatchObject({
    status: 'present',
    value: { status: 'unavailable', reason: 'unsupported-version' },
  })
})

const malformedIssues: unknown[] = [
  null,
  [],
  '',
  {},
  { kind: 'unknown' },
  { kind: 'message' },
  { kind: 'message', message: '' },
  { kind: 'message', message: '  ' },
  { kind: 'message', message: 1 },
  { kind: 'message', message: 'text', violation: {} },
  { kind: 'violation', violation: null },
  { kind: 'violation', violation: [] },
  ...[
    null,
    [],
    {},
    { kind: 'unknown' },
    { kind: 'duplicate', index: 0 },
    { kind: 'cage-total', index: 0 },
    { kind: 'thermo-order' },
    { kind: 'arrow-total', index: null },
  ].map((code) => ({ kind: 'violation', violation: { constraintId: 'clue', cells: [0], code } })),
  ...['', '  ', null, 1].map((constraintId) => ({
    kind: 'violation',
    violation: { constraintId, cells: [0], code: { kind: 'duplicate' } },
  })),
  ...[
    [],
    [81],
    [-1],
    [0.5],
    [NaN],
    [Infinity],
    ['0'],
    [true],
    [0n],
    new Uint32Array([0]),
    { 0: 0, length: 1 },
    Array(82).fill(0),
  ].map((cells) => ({
    kind: 'violation',
    violation: { constraintId: 'clue', cells, code: { kind: 'duplicate' } },
  })),
  ...[-1, 0.5, NaN, Infinity, '1', true, 1n, 4294967296].map((index) => ({
    kind: 'violation',
    violation: { constraintId: 'clue', cells: [0], code: { kind: 'thermo-order', index } },
  })),
  ...[-1, 0.5, NaN, Infinity, '1', true, 1n, 65536].map((sum) => ({
    kind: 'violation',
    violation: { constraintId: 'clue', cells: [0], code: { kind: 'cage-total', index: 0, sum } },
  })),
]
it.each(malformedIssues.map((issue, index) => ({ issue, index })))(
  'rejects malformed live issue $index',
  ({ issue }) => {
    expect(
      bindings.parse_live_assessment_outcome({ status: 'invalid', issues: [issue] }).valid,
    ).toBe(false)
  },
)

it.each([
  null,
  [],
  { status: 'invalid', issues: [] },
  { status: 'invalid', issues: { 0: literalIssues[0], length: 1 } },
  { status: 'invalid', issues: new Uint8Array(1) },
  { status: 'invalid', issues: literalIssues, extra: true },
])('rejects malformed outcome or issue arrays %#', (value) => {
  expect(bindings.parse_live_assessment_outcome(value).valid).toBe(false)
})

it('catches throwing reflective reads without crashing response handling', () => {
  const throwing = Object.defineProperty({}, 'status', {
    get() {
      throw new Error('getter')
    },
  })
  const throwingIssue = Object.defineProperty({ kind: 'message' }, 'message', {
    get() {
      throw new Error('getter')
    },
  })
  const throwingKeys = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error('keys')
      },
    },
  )

  for (const value of [
    throwing,
    throwingKeys,
    { status: 'invalid', issues: [throwingIssue] },
    {
      status: 'rated',
      summary: {
        ratingVersion: 'sudoku-rating-v2',
        variant: 'classic',
        difficulty: 'easy',
        workload: { techniqueCounts: throwingKeys },
      },
    },
  ]) {
    expect(bindings.parse_live_assessment_outcome(value).valid).toBe(false)
  }
})

it('requires explicit null validation difficulty and a supported logic tier', () => {
  const base = {
    status: 'budget-exhausted',
    ratingVersion: 'sudoku-rating-v2',
    variant: 'classic',
    stage: 'validation',
  }

  expect(bindings.parse_live_assessment_outcome(base).valid).toBe(false)
  expect(bindings.parse_live_assessment_outcome({ ...base, difficulty: undefined }).valid).toBe(
    false,
  )
  expect(bindings.parse_live_assessment_outcome({ ...base, difficulty: null })).toEqual({
    valid: true,
    value: { ...base, difficulty: null },
  })
  expect(
    bindings.parse_live_assessment_outcome({ ...base, stage: 'logic', difficulty: null }).valid,
  ).toBe(false)
  expect(
    bindings.parse_live_assessment_outcome({ ...base, stage: 'logic', difficulty: 'easy' }).valid,
  ).toBe(true)
  expect(
    bindings.parse_live_assessment_outcome({
      ...base,
      variant: 'arrow',
      stage: 'logic',
      difficulty: 'expert',
    }).valid,
  ).toBe(false)
})

it('retains the DTO numeric bounds without inventing board-sized clue indices', () => {
  const value = {
    status: 'invalid',
    issues: [
      {
        kind: 'violation',
        violation: {
          constraintId: 'clue',
          cells: [80, 0],
          code: { kind: 'cage-total', index: 4294967295, sum: 65535 },
        },
      },
    ],
  }

  expect(bindings.parse_live_assessment_outcome(value)).toEqual({ valid: true, value })
})

it('transports literal cage, thermometer and arrow facts from computation', () => {
  const cases: { rules: RulesDto; digits: BoardDto; violation: ViolationDto }[] = [
    {
      rules: {
        kind: 'killer',
        cages: [
          { cells: [1, 0], sum: 3 },
          ...Array.from({ length: 79 }, (_, index) => ({ cells: [index + 2], sum: 1 })),
        ],
      },
      digits: [8, 9],
      violation: {
        constraintId: 'cage:0',
        cells: [1, 0],
        code: { kind: 'cage-total', index: 0, sum: 3 },
      },
    },
    {
      rules: { kind: 'thermo', paths: [[10, 1, 0]] },
      digits: [1, 2, 3],
      violation: {
        constraintId: 'thermo:0',
        cells: [10, 1, 0],
        code: { kind: 'thermo-order', index: 0 },
      },
    },
    {
      rules: { kind: 'arrow', arrows: [{ circle: 10, shaft: [1, 0] }] },
      digits: [1, 2, 5],
      violation: {
        constraintId: 'arrow:0',
        cells: [10, 1, 0],
        code: { kind: 'arrow-total', index: 0 },
      },
    },
  ]
  for (const { rules, digits, violation } of cases) {
    const board: BoardDto = Array<0>(81).fill(0)
    board[0] = digits[0]
    board[1] = digits[1]
    board[10] = digits[2] ?? 0
    const result = bindings.assess({ board, rules })

    expect(result).toMatchObject({
      result: {
        status: 'invalid',
        issues: expect.arrayContaining([{ kind: 'violation', violation }]),
      },
    })
  }
})

it('rejects an own __proto__ technique key rather than dropping it during snapshotting', () => {
  const fixture = RATING_FIXTURES[0]
  const assessed = bindings.assess_summary({
    board: [...fixture.board],
    rules: copyRules(fixture.rules),
  })
  if (assessed.result.status !== 'rated') {
    throw new Error('The authored rating fixture must complete')
  }
  const summary = assessed.result.summary
  const text = JSON.stringify(summary.workload.techniqueCounts)
  const techniqueCounts: unknown = JSON.parse(`${text.slice(0, -1)},"__proto__":0}`)

  expect(
    bindings.parse_live_assessment_outcome({
      status: 'rated',
      summary: { ...summary, workload: { ...summary.workload, techniqueCounts } },
    }),
  ).toEqual({
    valid: false,
    issues: ['Assessment technique counts must include every known technique'],
  })
})

it('returns invalid for revoked proxies at record and array boundaries', () => {
  const record = Proxy.revocable({}, {})
  const array = Proxy.revocable([], {})
  record.revoke()
  array.revoke()

  expect(bindings.parse_live_assessment_outcome(record.proxy).valid).toBe(false)
  expect(
    bindings.parse_live_assessment_outcome({ status: 'invalid', issues: array.proxy }).valid,
  ).toBe(false)
})
