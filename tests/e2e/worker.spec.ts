import { runWorker } from './workerHarness'
import { test, expect, makeVariantHintSession } from './support'
import { parseWorkerResponse } from '@/worker/protocol'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'
import { countReferenceSolutions } from '../support/referenceSudoku'
import { assessPuzzle, createAssessmentInput } from '@/core/sudoku/rating'
import { createGenerationInput, generatePuzzle } from '@/core/sudoku/generation'
import { KILLER_HARD_REGRESSION_SEEDS } from '../fixtures/generationCorpus'
import { explainStep } from '@/core/sudoku/techniques'
import { referenceCountSolutions } from '../support/referenceVariants'

test('delivers a freshly constructed Killer Hard puzzle from the real Worker at both roots', async ({
  page,
}) => {
  const request = KILLER_HARD_REGRESSION_SEEDS.map((seed) => {
    const input = createGenerationInput('killer', 'hard', seed)
    return { input, result: generatePuzzle(input) }
  }).find(({ result }) => result.status === 'ready' && result.source === 'generated')
  if (!request || request.result.status !== 'ready') {
    throw new Error('Missing fresh Killer Hard regression fixture')
  }
  for (const base of ['/', '/sudoku/'] as const) {
    await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
    const response = parseWorkerResponse(
      await runWorker(
        page,
        {
          kind: 'generate',
          requestId: `fresh-killer-${base}`,
          input: request.input,
        },
        base,
      ),
    )
    if (
      !response.valid ||
      response.value.kind !== 'generate' ||
      response.value.outcome.status !== 'completed'
    ) {
      throw new Error('Expected a completed Killer Hard Worker result')
    }
    const puzzle = response.value.outcome.value

    expect(puzzle).toEqual(request.result.puzzle)
    expect(referenceCountSolutions(puzzle.givens, puzzle.rules)).toEqual({
      count: 1,
      solution: puzzle.solution,
    })
    expect(response.value.outcome.assessment).toEqual({
      status: 'rated',
      summary: request.result.assessment,
    })
  }
})

test('delivers high-work regional corpus seeds within the production Worker timeout at both roots', async ({
  page,
}, testInfo) => {
  const timings: { base: string; difficulty: string; milliseconds: number }[] = []
  for (const base of ['/', '/sudoku/'] as const) {
    await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
    for (const [difficulty, seed] of [
      ['medium', '019'],
      ['hard', '020'],
    ] as const) {
      const started = performance.now()
      const response = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'generate',
            requestId: `regional-${seed}-${base}`,
            input: createGenerationInput(
              'jigsaw',
              difficulty,
              `local-product-corpus-v1:seed:${seed}`,
            ),
          },
          base,
        ),
      )
      timings.push({ base, difficulty, milliseconds: performance.now() - started })
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
  await testInfo.attach('regional-worker-timings', {
    body: JSON.stringify(timings),
    contentType: 'application/json',
  })
})

test('verifies fixed production-worker seeds and a known logical conclusion', async ({ page }) => {
  await page.goto('/#/')

  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
    const input = createGenerationInput('classic', difficulty, 'production-fixed-seed')
    const expected = generatePuzzle(input)
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
    const input = createGenerationInput(variant, 'medium', 'production-fixed-variant-seed')
    const expected = generatePuzzle(input)
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
