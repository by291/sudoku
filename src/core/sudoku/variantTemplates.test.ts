import { expect, it } from 'vitest'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import { compileRules } from '@/core/sudoku/rules'
import { createWorkBudget } from '@/core/sudoku/budget'
import { assessPuzzleWithBudget, createAssessmentInput } from '@/core/sudoku/rating'
import { analyzeLogic } from '@/core/sudoku/logic'
import { RATING_POLICIES } from '@/core/sudoku/ratingPolicies'
import { variantRulesMatter } from '@/core/sudoku/variantGeneration'
import { referenceCountSolutions } from '../../../tests/support/referenceVariants'

it('verifies all fifteen original fallback slots independently', () => {
  expect(Object.keys(VARIANT_TEMPLATES)).toHaveLength(5)

  for (const [variant, tiers] of Object.entries(VARIANT_TEMPLATES)) {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      expect(tiers[difficulty].length, `${variant}/${difficulty}`).toBeGreaterThanOrEqual(1)

      for (const template of tiers[difficulty]) {
        expect(referenceCountSolutions(template.givens, template.rules)).toEqual({
          count: 1,
          solution: template.solution,
        })
        const budget = createWorkBudget(1000000)

        expect(
          assessPuzzleWithBudget(createAssessmentInput(template.givens, template.rules), budget),
        ).toMatchObject({ status: 'rated', summary: { difficulty } })
        expect(variantRulesMatter(template, budget)).toEqual({ status: 'complete', matters: true })
        const context = compileRules(template.rules)
        const proof = analyzeLogic(
          template.givens,
          RATING_POLICIES[template.rules.kind][difficulty],
          500,
          {
            context,
            workBudget: createWorkBudget(1000000),
          },
        )

        expect(proof.status).toBe('solved')

        for (const step of proof.steps) {
          if (step.kind === 'placement') {
            expect(step.digit).toBe(template.solution[step.cell])
          } else {
            for (const removal of step.removals) {
              expect(removal.digit).not.toBe(template.solution[removal.cell])
            }
          }
        }

        if (difficulty !== 'easy') {
          const easier = difficulty === 'hard' ? 'medium' : 'easy'

          expect(
            analyzeLogic(template.givens, RATING_POLICIES[template.rules.kind][easier], 500, {
              context,
              workBudget: createWorkBudget(1000000),
            }).status,
          ).toBe('stalled')
        }
      }
    }
  }
}, 120000)
