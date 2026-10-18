import type { Page } from '@playwright/test'
import { test, expect, seedRecords } from './support'
import { makeSession } from '../support/gameFixtures'
import { VARIANT_FIXTURES } from '../fixtures/variants'
import { VARIANT_PUZZLE_VERSION } from '@reference/core/sudoku/generation/types'
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
  await seedRecords(page, 'results', results)

  return results
}

test('keeps statistics and completion history readable in a short desktop window', async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, 'Desktop records columns')
  await page.setViewportSize({ width: 1100, height: 720 })
  await seedCompletedRecords(page)

  await page.goto('/#/records?variant=arrow')
  await expect(page.getByRole('table')).toBeInViewport({ ratio: 1 })
  const navigation = page.getByRole('navigation', { name: '成绩玩法', exact: true })
  await expect(navigation.getByRole('link', { name: '标准数独 1 局', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: '箭头数独 3 局', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: /0 局$/ })).toHaveCount(4)
  await page.screenshot({
    path: `test-results/visual/records-inline/counts-${testInfo.project.name}.png`,
    animations: 'disabled',
  })
  await page.getByRole('tab', { name: '完成历史', exact: true }).click()
  const history = page.getByRole('list').filter({ hasText: '箭头数独' })

  await expect(history.getByRole('listitem')).toHaveCount(3)
  await expect(navigation.getByRole('link', { name: '标准数独 1 局', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: '箭头数独 3 局', exact: true })).toBeVisible()
  await expect(history).toBeInViewport({ ratio: 1 })
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
    path: `test-results/visual/navigation-refinement/records-${testInfo.project.name}.png`,
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
  const history = page.getByRole('region', { name: '完成历史', exact: true })
  const bests = page
    .getByRole('heading', { name: '自由游玩 · 最快成绩', exact: true })
    .locator('..')
  await expect(bests.getByRole('row', { name: '简单 02:05 03:05', exact: true })).toBeVisible()
  await expect(page.getByText('当前连续挑战', { exact: true }).locator('..')).toContainText('1 天')
  await expect(page.getByText('正式挑战完成', { exact: true }).locator('..')).toContainText('1 次')
  await expect(page.getByText('已完成 3 局', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '完成历史', exact: true }).click()
  await expect(history.getByRole('listitem')).toHaveCount(3)
  await expect(history).not.toContainText('标准数独')
  await chooseRecordsVariant(page, '标准数独')
  await expect(history.getByRole('listitem')).toHaveCount(1)
  await expect(history).toContainText('标准数独 · 自由游玩')
  await expect(history).not.toContainText('箭头数独')
  await page.getByRole('tab', { name: '总览', exact: true }).click()
  await expect(bests.getByRole('row', { name: '简单 01:01 —', exact: true })).toBeVisible()
  await expect(page.getByText('正式挑战完成', { exact: true }).locator('..')).toContainText('0 次')
  await expect(page.getByText('已完成 1 局', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '完成历史', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('tab', { name: '完成历史', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(history.getByRole('listitem')).toHaveCount(1)
})

test('opens the original completed board with variant clues and returns to the selected history', async ({
  page,
}, testInfo) => {
  await seedCompletedRecords(page)
  await page.goto('/#/records?variant=arrow&tab=history')
  const history = page.getByRole('region', { name: '完成历史', exact: true })
  await history.getByRole('link').filter({ hasText: '03:05' }).click()

  await expect(page).toHaveURL(/#\/records\/records-arrow-assisted\?variant=arrow$/)
  await expect(page.getByRole('heading', { name: '已完成的棋局', exact: true })).toBeVisible()
  const board = page.getByRole('group', { name: '数独棋盘', exact: true })
  await expect(board.getByRole('button')).toHaveCount(81)
  await expect(board.getByRole('button').first()).toBeDisabled()
  await expect(board.locator('[data-clue="arrow"]').first()).toBeVisible()
  await expect(page.getByRole('region', { name: '完成成绩', exact: true })).toContainText('03:05')
  await expect(page.getByRole('region', { name: '完成成绩', exact: true })).toContainText(
    '辅助完成',
  )
  await expect(page.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(0)
  await page.keyboard.press('1')
  await page.reload()
  await expect(page.getByRole('region', { name: '完成成绩', exact: true })).toContainText('03:05')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: `test-results/visual/web-parity/result-${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })

  await page
    .getByRole('navigation', { name: '页面导航', exact: true })
    .getByRole('link', { name: '返回完成历史', exact: true })
    .click()

  await expect(page).toHaveURL(/#\/records\?variant=arrow&tab=history$/)
  await expect(page.getByRole('tab', { name: '完成历史', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(history.getByRole('listitem')).toHaveCount(3)
})

test('retains all local saves, highlights the latest unfinished session and resumes its original board', async ({
  page,
}) => {
  const results = await seedCompletedRecords(page)
  const older = makeSession({ id: 'saved-older', startedAt: '2026-10-10T01:00:00.000Z' })
  const newest = makeSession({
    id: 'saved-newest',
    startedAt: '2026-10-12T01:00:00.000Z',
    elapsedMs: 12000,
  })
  const completed = results.find(({ session }) => session.id === 'records-classic-free')?.session
  if (!completed) {
    throw new Error('Missing completed fixture')
  }
  await seedRecords(
    page,
    'sessions',
    [older, completed, newest].map((session) => ({ session })),
  )
  await page.goto('/#/records?variant=classic&tab=saves')
  const saves = page.getByRole('region', { name: '本地存档', exact: true })
  await expect(saves.getByRole('link', { name: '继续存档', exact: true })).toHaveCount(2)
  await expect(saves.getByRole('link', { name: '查看存档', exact: true })).toHaveCount(1)
  await expect(saves.getByRole('link').first()).toHaveAttribute('href', /session=saved-newest$/)
  await expect(saves.getByRole('article')).toContainText('00:12')
  await saves.getByRole('link').first().click()

  await expect(page).toHaveURL(/session=saved-newest$/)
  await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeVisible()
})

test('changes record tabs with arrow keys and recovers from an absent completion', async ({
  page,
}) => {
  await page.goto('/#/records')
  await page.getByRole('tab', { name: '总览', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: '本地存档', exact: true })).toBeFocused()
  await expect(page.getByRole('tab', { name: '本地存档', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: '完成历史', exact: true })).toBeFocused()
  await page.goto('/#/records/missing?variant=killer')
  await expect(page.getByRole('alert')).toContainText('找不到这条完成记录')
  await page.getByRole('link', { name: '查看完成历史', exact: true }).click()
  await expect(page).toHaveURL(/#\/records\?variant=killer&tab=history$/)
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
