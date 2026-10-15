import type { Page } from '@playwright/test'
import { test, expect } from './support'
import { makeSession } from '../support/gameFixtures'
import { VARIANT_FIXTURES } from '../fixtures/variants'
import { VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import type { GameSession } from '@/features/game/model/session'

async function chooseRecordsVariant(page: Page, name: string) {
  const selector = page.getByRole('combobox', { name: '成绩玩法', exact: true })
  if (await selector.isVisible()) {
    await selector.click()
    await page.getByRole('option', { name, exact: true }).click()
    await expect(selector).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('listbox', { name: '玩法选项', exact: true })).toBeHidden()
  } else {
    await page
      .getByRole('navigation', { name: '成绩玩法', exact: true })
      .getByRole('link', { name: new RegExp(name) })
      .click()
  }
}

async function seedCompletedRecords(page: Page) {
  const completedAt = '2026-10-11T01:00:00.000Z'
  const classic = makeSession({ id: 'records-classic-free', elapsedMs: 61000 })
  const arrow = makeSession({
    id: 'records-arrow-free',
    elapsedMs: 125000,
    puzzle: {
      ...makeSession().puzzle,
      ...VARIANT_FIXTURES.arrow,
      puzzleVersion: VARIANT_PUZZLE_VERSION,
    },
  })
  const arrowAssisted = {
    ...arrow,
    id: 'records-arrow-assisted',
    elapsedMs: 185000,
    assistance: { hintCount: 1, checkCount: 0, candidateCount: 0, assisted: true },
  }
  const arrowDaily: GameSession = {
    ...arrow,
    id: 'daily:arrow:2026-10-11:formal',
    mode: 'daily',
    elapsedMs: 121000,
    puzzle: { ...arrow.puzzle, difficulty: 'medium' },
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
  }
  const results = [classic, arrow, arrowAssisted, arrowDaily].map((session) => ({
    formatVersion: 2,
    session: {
      ...session,
      entries: session.puzzle.solution.map((digit, cell) =>
        session.puzzle.givens[cell] ? 0 : digit,
      ),
      completion: { completedAt, elapsedMs: session.elapsedMs },
    },
  }))
  await page.goto('/#/')
  await expect(page.getByRole('button', { name: /开始一局数独/ })).toBeVisible()
  await page.evaluate(async (results) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('results', 'readwrite')

      for (const result of results) {
        transaction.objectStore('results').put(result)
      }

      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  }, results)
}

test('keeps populated completion history beside best times in a short desktop window', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop records columns')
  await page.setViewportSize({ width: 1100, height: 720 })
  await seedCompletedRecords(page)

  await page.goto('/#/records?variant=arrow')
  const history = page.getByRole('list').filter({ hasText: '箭头数独' })

  await expect(history.getByRole('listitem')).toHaveCount(3)
  await expect(history).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('table')).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1100)
})

test('restores the records type from its URL through refresh and browser history', async ({
  page,
}, testInfo) => {
  await page.goto('/#/records?variant=arrow')
  await expect(page.getByRole('heading', { name: '箭头数独', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '箭头数独', exact: true })).toBeVisible()
  await page.screenshot({
    path: `.superpowers/navigation-refinement/records-${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  await chooseRecordsVariant(page, '杀手数独')
  await expect(page).toHaveURL(/#\/records\?variant=killer$/)
  await expect(page.getByRole('heading', { name: '杀手数独', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/records\?variant=arrow$/)
  await expect(page.getByRole('heading', { name: '箭头数独', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: '杀手数独', exact: true })).toBeVisible()
})

test('exposes desktop links and a compact mobile selector at the layout boundary', async ({
  page,
}) => {
  await page.setViewportSize({ width: 801, height: 900 })
  await page.goto('/#/records?variant=diagonal')
  const navigation = page.getByRole('navigation', { name: '成绩玩法', exact: true })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('link')).toHaveCount(6)
  const diagonal = navigation.getByRole('link', { name: /对角数独/ })
  await expect(diagonal).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('combobox', { name: '成绩玩法', exact: true })).toHaveCount(0)
  await diagonal.focus()
  await page.keyboard.press('Tab')
  const jigsaw = navigation.getByRole('link', { name: /不规则数独/ })
  await expect(jigsaw).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(jigsaw).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveURL(/#\/records\?variant=jigsaw$/)
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(navigation).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '成绩玩法', exact: true })).toBeVisible()
  await chooseRecordsVariant(page, '温度计数独')
  await expect(page).toHaveURL(/#\/records\?variant=thermo$/)
  await expect(page.getByRole('heading', { name: '温度计数独', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test('filters real completed records and keeps best times and daily statistics per type', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-11T01:00:00Z'))
  await seedCompletedRecords(page)
  await page.goto('/#/records?variant=arrow')
  const history = page.getByRole('heading', { name: '完成记录', exact: true }).locator('..')
  await expect(history.getByRole('listitem')).toHaveCount(3)
  await expect(history).not.toContainText('标准数独')
  const bests = page
    .getByRole('heading', { name: '自由游玩 · 最快成绩', exact: true })
    .locator('..')
  await expect(bests.getByRole('row', { name: '简单 02:05 03:05', exact: true })).toBeVisible()
  await expect(page.getByText('当前连续挑战', { exact: true }).locator('..')).toContainText('1 天')
  await expect(page.getByText('正式挑战完成', { exact: true }).locator('..')).toContainText('1 次')
  await expect(page.getByText('已完成 3 局', { exact: true })).toBeVisible()
  await chooseRecordsVariant(page, '标准数独')
  await expect(history.getByRole('listitem')).toHaveCount(1)
  await expect(history).toContainText('标准数独 · 自由游玩')
  await expect(history).not.toContainText('箭头数独')
  await expect(bests.getByRole('row', { name: '简单 01:01 —', exact: true })).toBeVisible()
  await expect(page.getByText('正式挑战完成', { exact: true }).locator('..')).toContainText('0 次')
  await expect(page.getByText('已完成 1 局', { exact: true })).toBeVisible()
  await page.reload()
  await expect(history.getByRole('listitem')).toHaveCount(1)
})

for (const query of ['variant=unknown', 'variant=arrow&variant=killer']) {
  test(`offers standard records recovery for invalid type query ${query}`, async ({ page }) => {
    await page.goto(`/#/records?${query}`)
    await expect(page.getByRole('alert').filter({ hasText: /无法识别.*玩法/ })).toBeVisible()
    await page.getByRole('link', { name: '查看标准成绩', exact: true }).click()
    await expect(page).toHaveURL(/#\/records$/)
    await expect(page.getByRole('alert').filter({ hasText: /无法识别.*玩法/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '标准数独', exact: true })).toBeVisible()
  })
}
