import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { LESSONS } from './support/lessons'
import { testEngine } from './support/semantics'
import { transformStage } from '@/features/learning/model/exerciseStages'

it('all_32_lesson_identities_and_expected_deductions_are_preserved', () => {
  // Captured from the pre-cutover TS course at commit 6b6807d, before invoking Rust construction.
  const bytes = readFileSync('tests/fixtures/teaching-contracts.json.gz')
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'c5105e8ba1a054cf5f4a036e31026914dc9b75312dd7f9d0fb50c40e4d86b13c',
  )
  const expected: unknown = JSON.parse(gunzipSync(bytes).toString('utf8'))

  expect(LESSONS).toHaveLength(32)
  expect(JSON.parse(JSON.stringify(LESSONS))).toEqual(expected)
})

it('lesson_rule_transforms_obey_variant_capabilities', () => {
  for (const lesson of LESSONS) {
    const original = lesson.guided
    expect(transformStage(transformStage(original, testEngine), testEngine)).toEqual(original)
    if (original.rules.kind !== 'classic') {
      expect(() => transformStage(original, testEngine, 'swap-rows')).toThrow(/permutations/)
    }
  }
  expect(() =>
    testEngine.transformRules({
      rules: { kind: 'arrow', arrows: [{ circle: 8, shaft: [16, 24] }] },
      symmetry: 0,
      complement: true,
    }),
  ).toThrow(/arrow/)
})

it('rejects forged conclusions and malformed candidate states at the Rust teaching validation boundary', () => {
  const stage = LESSONS[0].guided
  if (stage.step.kind !== 'placement') {
    throw new Error('Expected authored placement')
  }
  expect(testEngine.validateTeachingStep({ ...stage, candidates: [0] }).status).toBe('invalid')
  expect(
    testEngine.validateTeachingStep({ ...stage, step: { ...stage.step, digit: 6 } }).status,
  ).toBe('invalid')
})

it('treats an explicitly undefined optional unit list as absent and rejects null', () => {
  const stage = LESSONS[0].guided
  const evidence = stage.step.evidence
  if (evidence.kind !== 'unit') {
    throw new Error('Expected authored unit evidence')
  }

  expect(
    testEngine.validateTeachingStep({
      ...stage,
      step: { ...stage.step, evidence: { ...evidence, units: undefined } },
    }),
  ).toEqual({ status: 'valid' })
  expect(
    testEngine.validateTeachingStep({
      ...stage,
      step: { ...stage.step, evidence: { ...evidence, units: null } },
    }).status,
  ).toBe('invalid')
})
