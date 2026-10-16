import {
  test,
  expect,
  seedSession,
  cellName,
  enterGameDigit,
  selectGameMenuAction,
  readSessions,
} from './support'
import { makeSession } from '../support/gameFixtures'
import { runWorker, parseWorkerResponse } from './workerHarness'
import type { PuzzleRules } from '@/sudoku/contracts'

const rules: PuzzleRules = {
  kind: 'killer',
  cages: Array.from({ length: 9 }, (_, row) => ({
    cells: Array.from({ length: 9 }, (_, column) => row * 9 + column),
    sum: 45,
  })),
}
const empty = Array<0>(81).fill(0)

for (const base of ['/', 'http://127.0.0.1:4174/sudoku/'] as const) {
  test(`heavy live jobs retain full work and atomic notes at ${base}`, async ({ page }) => {
    await page.goto(base)
    const assetBase = base === '/' ? '/' : '/sudoku/'
    const response = await runWorker(
      page,
      { kind: 'conflicts', requestId: 'large-cage-conflicts', board: empty, rules },
      assetBase,
    )
    const parsed = parseWorkerResponse(response)
    expect(parsed.valid && parsed.value.kind === 'conflicts' && parsed.value.outcome).toMatchObject(
      {
        status: 'completed',
        value: {
          computation: {
            result: { status: 'budget-exhausted', violations: [] },
            workUsed: 1000000,
          },
        },
      },
    )
    const notes = await runWorker(
      page,
      {
        kind: 'generate-notes',
        requestId: 'large-cage-notes',
        input: { givens: empty, entries: empty, notes: Array(81).fill(7), rules },
      },
      assetBase,
    )
    expect(parseWorkerResponse(notes)).toMatchObject({
      valid: true,
      value: {
        outcome: {
          status: 'completed',
          value: { computation: { result: { status: 'budget-exhausted' }, workUsed: 1000000 } },
        },
      },
    })
  })

  test(`heavy player input cancels pending notes at ${base}`, async ({ page }) => {
    // Delay delivery only, keeping the emitted Worker and its full Rust allowance real.
    await page.addInitScript(() => {
      const OriginalWorker = Worker
      window.Worker = class extends OriginalWorker {
        override postMessage(message: unknown) {
          if (
            message &&
            typeof message === 'object' &&
            'kind' in message &&
            (message.kind === 'conflicts' || message.kind === 'generate-notes')
          ) {
            setTimeout(() => super.postMessage(message), 1500)
          } else {
            super.postMessage(message)
          }
        }
      }
    })
    const session = makeSession({
      puzzle: { ...makeSession().puzzle, rules, givens: empty },
      notes: Array(81).fill(7),
    })
    await seedSession(page, session, '/play/free', base)
    await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
    await expect(
      page.getByText('正在检查线索，仅显示已确认的冲突。', { exact: true }),
    ).toBeVisible()
    await selectGameMenuAction(page, '生成候选数')
    await expect(
      page.getByText('正在生成候选数，修改局面会取消本次计算。', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: '更多操作', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '生成候选数', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: cellName(0) }).click()
    await enterGameDigit(page, 5)
    await expect(page.getByRole('button', { name: cellName(0) })).toHaveAccessibleName(/数字5/)
    await expect(
      page.getByText('正在生成候选数，修改局面会取消本次计算。', { exact: true }),
    ).toBeHidden()
    await expect
      .poll(async () => (await readSessions(page))[0]?.session.assistance.candidateCount)
      .toBe(0)
    await selectGameMenuAction(page, '生成候选数')
    await expect(page.getByText(/候选计算超出预算，原有笔记已保留/)).toBeVisible()
    const saved = (await readSessions(page))[0]?.session
    expect(saved?.assistance.candidateCount).toBe(0)
    expect(saved?.notes[1]).toBe(7)
  })
}
