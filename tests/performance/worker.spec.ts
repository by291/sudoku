import { test, expect } from '@playwright/test'
import { runWorker, parseWorkerResponse } from '../e2e/workerHarness'
import { generationInput } from '../support/generation'
import {
  GENERATION_LATENCY_INPUTS,
  KILLER_HARD_RECOVERY_INPUT,
} from '../fixtures/generationLatency'

const REQUEST_BUDGET_MILLISECONDS = 3000
const DEPLOYMENTS = ['/', '/sudoku/'] as const
const LATENCY_INPUTS = [
  ...GENERATION_LATENCY_INPUTS,
  { ...KILLER_HARD_RECOVERY_INPUT, expectedStatus: 'completed' },
] as const

// This isolated single-worker suite measures startup, compilation, transport and execution together.
for (const input of LATENCY_INPUTS) {
  for (const base of DEPLOYMENTS) {
    test(`${input.variant}/${input.difficulty}/${input.seed} stays within the request budget at ${base}`, async ({
      page,
    }) => {
      const origin = base === '/' ? 'http://127.0.0.1:4173/' : 'http://127.0.0.1:4174/sudoku/'
      await page.goto(origin)
      const requestId = `${input.variant}-${input.difficulty}-${base}`
      const started = performance.now()

      const response = parseWorkerResponse(
        await runWorker(
          page,
          {
            kind: 'generate',
            requestId,
            input: generationInput(input.variant, input.difficulty, input.seed),
          },
          base,
        ),
      )

      expect(performance.now() - started).toBeLessThan(REQUEST_BUDGET_MILLISECONDS)
      expect(response).toMatchObject({
        valid: true,
        value: {
          kind: 'generate',
          requestId,
          outcome: {
            status: input.expectedStatus,
            assessment: {
              status: 'rated',
              summary: { variant: input.variant, difficulty: input.difficulty },
            },
          },
        },
      })
    })
  }
}
