import { expect, it } from 'vitest'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../../tests/fixtures/classicPuzzles'
import { assessPuzzle } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import { analyzeLogic } from '@/core/sudoku/logic/solver'
import { RATING_POLICIES } from '@/core/sudoku/rating/policies'
import { generatePuzzle } from '@/core/sudoku/generation/generate'
import { createGenerationInput, DEFAULT_GENERATION_LIMITS } from '@/core/sudoku/generation/input'
import { analyzeHint } from '@/core/sudoku/hint'
import { validateHintEvidence, parseHint } from '@/worker/hintEvidence'
import { referenceCountSolutions } from '../../../../tests/support/referenceVariants'
import { referenceRatingState } from '../../../../tests/support/referenceRatingState'

it('has a uniquely solvable authored Expert fixture requiring a deduction beyond Hard', () => {
  const template = CLASSIC_PUZZLE_FIXTURES.find((item) => item.difficulty === 'expert')
  if (!template) {
    throw new Error('Missing Expert fixture')
  }

  const rules = { kind: 'classic' } as const

  expect(referenceCountSolutions(template.givens, rules)).toEqual({
    count: 1,
    solution: template.solution,
  })
  expect(analyzeLogic(template.givens, RATING_POLICIES.classic.hard, 500).status).toBe('stalled')
  const result = assessPuzzle(createAssessmentInput(template.givens, rules))

  expect(result.status).toBe('rated')
  if (result.status !== 'rated') {
    throw new Error('Expected Expert assessment')
  }

  expect(result.summary.difficulty).toBe('expert')
  for (let index = 0; index < result.trace.length; index++) {
    const step = result.trace[index]
    const state = referenceRatingState(template.givens, rules, result.trace.slice(0, index))
    if (step.kind === 'placement') {
      expect(step.digit).toBe(template.solution[step.cell])
    } else {
      for (const { cell, digit } of step.removals) {
        expect(state.candidates[cell]).toContain(digit)
        expect(template.solution[cell]).not.toBe(digit)
      }
    }
    if (step.evidence.kind === 'coloring') {
      for (const link of step.evidence.links) {
        const cells = state.units.get(`${link.unit.kind}:${link.unit.index}`)

        expect(
          cells?.filter((cell) => state.candidates[cell].includes(step.evidence.digits[0])),
        ).toEqual([...link.cells])
      }
    }
  }
})

it.each(['expert-limited-a', 'expert-limited-b', 'expert-limited-c', 'expert-limited-d'])(
  'does not substitute an authored Expert puzzle when layouts are exhausted for %s',
  (seed) => {
    const result = generatePuzzle(createGenerationInput('classic', 'expert', seed), {
      ...DEFAULT_GENERATION_LIMITS,
      maxLayouts: 0,
    })

    expect(result).toMatchObject({
      status: 'budget-exhausted',
      stage: 'construction',
    })
  },
)

it('validates every advanced proof against the actual replayed board and rejects forged domains', () => {
  const template = CLASSIC_PUZZLE_FIXTURES.find((item) => item.difficulty === 'expert')
  if (!template) {
    throw new Error('Missing Expert fixture')
  }

  const result = analyzeLogic(template.givens, RATING_POLICIES.classic.hard, 500)
  const hint = analyzeHint(result.board, template.solution, 500)
  const rules = { kind: 'classic' } as const

  expect(hint.kind).toBe('deduction')
  expect(parseHint(hint)).toEqual(hint)
  expect(validateHintEvidence(hint, rules, result.board).valid).toBe(true)
  expect(validateHintEvidence(hint, { kind: 'diagonal' }, result.board).valid).toBe(false)
  if (hint.kind !== 'deduction') {
    throw new Error('Expected advanced hint')
  }

  const changed = structuredClone(hint)
  const proof = changed.steps.find((step) => step.evidence.kind === 'coloring')?.evidence
  if (!proof || proof.kind !== 'coloring') {
    throw new Error('Expected coloring evidence')
  }

  const forged = {
    ...changed,
    steps: changed.steps.map((step) =>
      step.evidence === proof
        ? {
            ...step,
            evidence: {
              ...proof,
              domains: proof.domains.map((domain) =>
                domain.cell === 0 ? { ...domain, mask: 511 } : domain,
              ),
            },
          }
        : step,
    ),
  }

  expect(validateHintEvidence(forged, rules, result.board).valid).toBe(false)
})
