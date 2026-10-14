import { runWorker } from './workerHarness'
import { test, expect, makeVariantHintSession } from './support'
import { parseWorkerResponse } from '@/worker/protocol'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'
import { countReferenceSolutions } from '../support/referenceSudoku'
import { assessPuzzle, createAssessmentInput } from '@/core/sudoku/rating'
import { createGenerationInput } from '@/core/sudoku/generation'
import { explainStep } from '@/core/sudoku/techniques'
import { referenceCountSolutions } from '../support/referenceVariants'

test('verifies fixed production-worker seeds and a known logical conclusion', async ({ page }) => {
  await page.goto('/#/')

  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
    const response = parseWorkerResponse(
      await runWorker(page, {
        kind: 'generate',
        requestId: `seed-${difficulty}`,
        input: createGenerationInput('classic', difficulty, 'production-fixed-seed'),
      }),
    )
    if (
      !response.valid ||
      response.value.kind !== 'generate' ||
      response.value.outcome.status !== 'completed'
    ) {
      throw new Error('Expected generated puzzle')
    }

    const puzzle = response.value.outcome.value

    expect(response.value.outcome.assessment).toMatchObject({
      status: 'rated',
      summary: { variant: 'classic', difficulty },
    })

    expect(countReferenceSolutions(puzzle.givens, 2)).toBe(1)
    expect(assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))).toMatchObject({
      status: 'rated',
      summary:
        response.value.outcome.assessment?.status === 'rated'
          ? response.value.outcome.assessment.summary
          : undefined,
    })
  }

  const hint = parseWorkerResponse(
    await runWorker(page, {
      kind: 'hint',
      requestId: 'known-hint',
      board: uniqueBoard,
      solution: solvedBoard,
      rules: { kind: 'classic' },
    }),
  )

  expect(hint).toMatchObject({
    valid: true,
    value: {
      kind: 'hint',
      outcome: {
        status: 'completed',
        value: { kind: 'deduction', placement: { cell: 40, digit: 5 } },
      },
    },
  })
})

for (const variant of ['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
  test(`verifies real ${variant} generation and rule evidence at both deployment roots`, async ({
    page,
  }) => {
    const fixture = makeVariantHintSession(variant)

    for (const base of ['/', '/sudoku/'] as const) {
      await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
      const generated = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'generate',
            requestId: `${variant}-${base}-generate`,
            input: createGenerationInput(variant, 'medium', 'production-fixed-variant-seed'),
          },
          base,
        ),
      )
      if (
        !generated.valid ||
        generated.value.kind !== 'generate' ||
        generated.value.outcome.status !== 'completed'
      ) {
        throw new Error('Expected generated variant')
      }

      const puzzle = generated.value.outcome.value

      expect(generated.value.outcome.assessment).toMatchObject({
        status: 'rated',
        summary: { variant, difficulty: 'medium' },
      })

      expect(puzzle.rules.kind).toBe(variant)
      expect(referenceCountSolutions(puzzle.givens, puzzle.rules)).toEqual({
        count: 1,
        solution: puzzle.solution,
      })
      expect(assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))).toMatchObject({
        status: 'rated',
        summary: { variant, difficulty: 'medium' },
      })
      const hint = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'hint',
            requestId: `${variant}-${base}-hint`,
            board: fixture.puzzle.givens,
            solution: fixture.puzzle.solution,
            rules: fixture.puzzle.rules,
          },
          base,
        ),
      )
      if (
        !hint.valid ||
        hint.value.kind !== 'hint' ||
        hint.value.outcome.status !== 'completed' ||
        hint.value.outcome.value.kind !== 'deduction'
      ) {
        throw new Error('Expected rule deduction')
      }

      expect(hint.value.outcome.value.placement).toEqual({
        cell: variant === 'arrow' ? 40 : 0,
        digit: variant === 'arrow' ? 2 : 1,
      })
      expect(hint.value.outcome.value.steps.map(explainStep).join(' ')).toContain(
        { diagonal: '对角线', jigsaw: '不规则区域', killer: '笼', thermo: '递增', arrow: '总和' }[
          variant
        ],
      )
    }
  })
}
test('loads hash routes and the real worker from a static deployment subpath', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/sudoku/#/play/free')
  const worker = page.waitForEvent('worker')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()

  expect((await worker).url()).toContain('/sudoku/assets/sudoku.worker-')
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)

  expect(page.url()).toContain('/sudoku/#/play/free')
})
