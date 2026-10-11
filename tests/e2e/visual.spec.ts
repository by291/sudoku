import { test, expect, seedSession, cellName } from './support'
import { makeSession } from '../support/gameFixtures'
test('keeps boards square and focus visible at 360, 390 and desktop widths', async ({
  page,
}, testInfo) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: '生成候选数', exact: true }).click()
  await page.getByRole('button', { name: cellName(2) }).click()
  await page.getByRole('button', { name: cellName(2) }).press('ArrowRight')
  await expect(page.getByRole('button', { name: cellName(3) })).toBeFocused()
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const board = await page.getByRole('group', { name: '数独棋盘' }).boundingBox()
    expect(board && Math.abs(board.width - board.height)).toBeLessThan(2)
    if (testInfo.project.name === 'desktop')
      await page.screenshot({
        path: `.superpowers/sdd/2026-10-11-sudoku-implementation/game-${width}.png`,
        fullPage: true,
      })
  }
  await page.getByRole('button', { name: '深色主题', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('button', { name: '跟随系统主题', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page
    .getByRole('button', { name: '返回首页', exact: true })
    .or(page.getByRole('link', { name: '返回首页', exact: true }))
    .click()
  if (testInfo.project.name === 'desktop')
    await page.screenshot({
      path: '.superpowers/sdd/2026-10-11-sudoku-implementation/home-desktop.png',
      fullPage: true,
    })
})
