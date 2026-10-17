import type { Locator } from '@playwright/test'
import { expect, seedRecords, test } from './support'
import { makeSession } from '../support/gameFixtures'
import { parseResultRecord } from '../support/semantics'

async function expectPageIds(history: Locator, expectedIds: readonly string[]) {
  const rows = history.getByRole('listitem')
  const links = history.getByRole('link')
  await expect(rows).toHaveCount(expectedIds.length)
  await expect
    .poll(() =>
      links.evaluateAll((elements) =>
        elements.map(
          (element) => element.getAttribute('href')?.split('/records/')[1]?.split('?')[0],
        ),
      ),
    )
    .toEqual(expectedIds)
  expect(await rows.count()).toBeLessThanOrEqual(30)
}

test('pages tied completion records in a bounded stable order before loading computation for one detail', async ({
  page,
}) => {
  const completedAt = '2026-10-11T02:00:00.000Z'
  const ids = Array.from(
    { length: 65 },
    (_, index) => `pagination-result-${String(index).padStart(2, '0')}`,
  )
  const results = ids.map((id, index) => {
    const elapsedMs = 60000 + index * 1000
    const session = makeSession({ id, elapsedMs, completion: { completedAt, elapsedMs } })
    session.entries = session.puzzle.solution.map((digit, cell) =>
      session.puzzle.givens[cell] ? 0 : digit,
    )
    const record = { formatVersion: 2, session }
    expect(parseResultRecord(record).valid, `Valid completed fixture ${id}`).toBe(true)
    return record
  })
  const wasmRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('.wasm')) {
      wasmRequests.push(request.url())
    }
  })

  await page.goto('/#/')
  await expect(page.getByRole('button', { name: /开始一局数独/ })).toBeEnabled()
  // Reversed insertion makes the ID tie-break independent of insertion order.
  await seedRecords(page, 'results', [...results].reverse())
  await page.goto('/#/records?variant=classic&tab=history')
  const history = page.getByRole('region', { name: '完成历史', exact: true })
  const pagination = page.getByRole('navigation', { name: '记录分页', exact: true })
  const previous = pagination.getByRole('button', { name: '上一页', exact: true })
  const next = pagination.getByRole('button', { name: '下一页', exact: true })

  await expectPageIds(history, ids.slice(0, 30))
  await expect(previous).toBeDisabled()
  expect(wasmRequests).toEqual([])

  await next.click()
  await expect(pagination).toContainText('第 2 页')
  await expectPageIds(history, ids.slice(30, 60))
  expect(wasmRequests).toEqual([])

  await next.click()
  await expect(pagination).toContainText('第 3 页')
  await expectPageIds(history, ids.slice(60))
  await expect(next).toBeDisabled()
  expect(wasmRequests).toEqual([])

  await previous.click()
  await expect(pagination).toContainText('第 2 页')
  await expectPageIds(history, ids.slice(30, 60))
  await previous.click()
  await expectPageIds(history, ids.slice(0, 30))
  await expect(previous).toBeDisabled()
  await page.reload()
  await expectPageIds(history, ids.slice(0, 30))
  expect(wasmRequests).toEqual([])

  await next.click()
  await expectPageIds(history, ids.slice(30, 60))
  await history.getByRole('link').filter({ hasText: '01:42' }).click()

  await expect(page).toHaveURL(/#\/records\/pagination-result-42\?variant=classic$/)
  const board = page.getByRole('group', { name: '数独棋盘', exact: true })
  await expect(board.getByRole('button')).toHaveCount(81)
  await expect(board.getByRole('button', { name: /^第1行第3列，/ })).toHaveText('4')
  await expect(board.getByRole('button').first()).toBeDisabled()
  await expect(page.getByRole('region', { name: '完成成绩', exact: true })).toContainText('01:42')
  await expect.poll(() => wasmRequests.length).toBe(1)
})
