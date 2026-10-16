import { runWorker, parseWorkerResponse, generateReference } from './workerHarness'
import { test, expect, makeVariantHintSession } from './support'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'
import { countReferenceSolutions } from '../support/referenceSudoku'
import { assessPuzzle } from '@reference/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@reference/core/sudoku/rating/input'
import { generationInput } from '../support/generation'
import { explainStep } from '@/features/game/model/techniquePresentation'
import { referenceCountSolutions } from '../support/referenceVariants'
import {
  GENERATION_LATENCY_INPUTS,
  GENERATION_RECOVERY_INPUTS,
  KILLER_HARD_RECOVERY_INPUT,
} from '../fixtures/generationLatency'

test('verifies current-identity puzzles for historical recovery seeds at both roots', async ({
  page,
}) => {
  for (const base of ['/', '/sudoku/'] as const) {
    await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
    for (const { variant, difficulty, seed } of GENERATION_RECOVERY_INPUTS) {
      const response = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'generate',
            requestId: `recovered-${variant}-${base}`,
            input: generationInput(variant, difficulty, seed),
          },
          base,
        ),
      )

      expect(response).toMatchObject({
        valid: true,
        value: {
          kind: 'generate',
          outcome: {
            status: 'completed',
            assessment: { status: 'rated', summary: { variant, difficulty } },
          },
        },
      })
      if (
        !response.valid ||
        response.value.kind !== 'generate' ||
        response.value.outcome.status !== 'completed'
      ) {
        throw new Error('Expected recovered generated puzzle')
      }
      const puzzle = response.value.outcome.value
      expect(referenceCountSolutions(puzzle.givens, puzzle.rules)).toEqual({
        count: 1,
        solution: puzzle.solution,
      })
      expect(assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))).toMatchObject({
        status: 'rated',
        summary: { variant, difficulty },
      })
    }
  }
})

test('keeps historical type-and-tier latency inputs within the current Worker deadline', async ({
  page,
}) => {
  for (const base of ['/', '/sudoku/'] as const) {
    await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
    for (const { variant, difficulty, seed, expectedStatus } of GENERATION_LATENCY_INPUTS) {
      const started = performance.now()
      const response = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'generate',
            requestId: `latency-${variant}-${difficulty}-${base}`,
            input: generationInput(variant, difficulty, seed),
          },
          base,
        ),
      )
      const milliseconds = performance.now() - started

      expect(milliseconds, `${variant}/${difficulty}/${base}`).toBeLessThan(3000)
      if (expectedStatus === 'completed') {
        expect(response).toMatchObject({
          valid: true,
          value: {
            kind: 'generate',
            outcome: {
              status: 'completed',
              assessment: { status: 'rated', summary: { variant, difficulty } },
            },
          },
        })
      } else {
        expect(response).toMatchObject({
          valid: true,
          value: { kind: 'generate', outcome: { status: 'budget-exhausted' } },
        })
        expect(response).not.toHaveProperty('value.outcome.value')
        expect(response).not.toHaveProperty('value.outcome.assessment')
      }
    }
  }
})

test('delivers a freshly constructed Killer Hard puzzle from the real Worker at both roots', async ({
  page,
}) => {
  const { variant, difficulty, seed } = KILLER_HARD_RECOVERY_INPUT
  const input = generationInput(variant, difficulty, seed)
  const result = await generateReference(input)
  if (result.status !== 'ready') {
    throw new Error('Missing fresh Killer Hard regression fixture')
  }
  for (const base of ['/', '/sudoku/'] as const) {
    await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
    const started = performance.now()
    const response = parseWorkerResponse(
      await runWorker(
        page,
        {
          kind: 'generate',
          requestId: `fresh-killer-${base}`,
          input,
        },
        base,
      ),
    )
    expect(performance.now() - started).toBeLessThan(3000)
    if (
      !response.valid ||
      response.value.kind !== 'generate' ||
      response.value.outcome.status !== 'completed'
    ) {
      throw new Error('Expected a completed Killer Hard Worker result')
    }
    const puzzle = response.value.outcome.value

    expect(puzzle).toEqual(result.puzzle)
    expect(referenceCountSolutions(puzzle.givens, puzzle.rules)).toEqual({
      count: 1,
      solution: puzzle.solution,
    })
    expect(response.value.outcome.assessment).toEqual({
      status: 'rated',
      summary: result.assessment,
    })
  }
})

test('delivers fixed regional regression seeds within the production Worker timeout at both roots', async ({
  page,
}) => {
  for (const base of ['/', '/sudoku/'] as const) {
    await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
    for (const [difficulty, seed] of [
      ['medium', '006'],
      ['hard', '010'],
    ] as const) {
      const response = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'generate',
            requestId: `regional-${seed}-${base}`,
            input: generationInput('jigsaw', difficulty, `local-product-corpus-v1:seed:${seed}`),
          },
          base,
        ),
      )
      expect(response).toMatchObject({
        valid: true,
        value: {
          kind: 'generate',
          outcome: {
            status: 'completed',
            assessment: { status: 'rated', summary: { variant: 'jigsaw', difficulty } },
          },
        },
      })
    }
  }
})

test('verifies fixed production-worker seeds and a known logical conclusion', async ({ page }) => {
  await page.goto('/#/')

  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
    const input = generationInput('classic', difficulty, 'production-fixed-seed')
    const expected = await generateReference(input)
    if (expected.status !== 'ready') {
      throw new Error('Expected a complete Classic reference result')
    }
    const response = parseWorkerResponse(
      await runWorker(page, {
        kind: 'generate',
        requestId: `seed-${difficulty}`,
        input,
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

    expect(puzzle).toEqual(expected.puzzle)
    expect(response.value.outcome.assessment).toEqual({
      status: 'rated',
      summary: expected.assessment,
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
    const input = generationInput(variant, 'medium', 'production-fixed-variant-seed')
    const expected = await generateReference(input)
    if (expected.status !== 'ready') {
      throw new Error('Expected a complete variant reference result')
    }

    for (const base of ['/', '/sudoku/'] as const) {
      await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
      const generated = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'generate',
            requestId: `${variant}-${base}-generate`,
            input,
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

      expect(puzzle).toEqual(expected.puzzle)
      expect(generated.value.outcome.assessment).toEqual({
        status: 'rated',
        summary: expected.assessment,
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
