import { readdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect } from './support'
import type { WorkerRequest } from '../../src/infrastructure/worker/protocol'
import { parseWorkerResponse } from '../../src/infrastructure/worker/protocol'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'
import { countReferenceSolutions } from '../support/referenceSudoku'
import { rateDifficulty } from '../../src/core/sudoku/logic'
const asset = readdirSync('dist/assets').find(
  (file) => file.startsWith('sudoku.worker-') && file.endsWith('.js'),
)
if (!asset) throw new Error('Build the application before running browser tests')
async function runWorker(page: Page, request: WorkerRequest) {
  return page.evaluate(
    ({ url, request }) =>
      new Promise<unknown>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' })
        const timer = setTimeout(() => {
          worker.terminate()
          reject(new Error('Real worker timed out'))
        }, 15000)
        worker.onmessage = (event: MessageEvent<unknown>) => {
          clearTimeout(timer)
          worker.terminate()
          resolve(event.data)
        }
        worker.onerror = (event) => {
          clearTimeout(timer)
          worker.terminate()
          reject(new Error(event.message))
        }
        worker.postMessage(request)
      }),
    { url: `/assets/${asset}`, request },
  )
}
test('verifies fixed production-worker seeds and a known logical conclusion', async ({ page }) => {
  await page.goto('/#/')
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const response = parseWorkerResponse(
      await runWorker(page, {
        kind: 'generate',
        requestId: `seed-${difficulty}`,
        input: { difficulty, seed: 'production-fixed-seed', puzzleVersion: 'sudoku-v1' },
      }),
    )
    if (
      !response.valid ||
      response.value.kind !== 'generate' ||
      response.value.outcome.status !== 'completed'
    )
      throw new Error('Expected generated puzzle')
    const puzzle = response.value.outcome.value
    expect(countReferenceSolutions(puzzle.givens, 2)).toBe(1)
    expect(rateDifficulty(puzzle.givens, 500)).toBe(difficulty)
  }
  const hint = parseWorkerResponse(
    await runWorker(page, {
      kind: 'hint',
      requestId: 'known-hint',
      board: uniqueBoard,
      solution: solvedBoard,
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
test('loads hash routes and the real worker from a static deployment subpath', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/sudoku/#/play/free')
  const worker = page.waitForEvent('worker')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  expect((await worker).url()).toContain('/sudoku/assets/sudoku.worker-')
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
  expect(page.url()).toContain('/sudoku/#/play/free')
})
