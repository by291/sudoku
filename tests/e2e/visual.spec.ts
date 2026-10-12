import {
  test,
  expect,
  seedSession,
  cellName,
  makeVariantHintSession,
  selectGameMenuAction,
} from './support'
import { makeSession } from '../support/gameFixtures'
for (const variant of ['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
  test(`keeps ${variant} clues aligned and tappable with notes at 360px in both themes`, async ({
    page,
    isMobile,
  }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 850 })
    await seedSession(page, makeVariantHintSession(variant))
    await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
    await selectGameMenuAction(page, '生成候选数')
    const target = variant === 'arrow' ? 40 : 0
    const cell = page.getByRole('button', { name: cellName(target) })
    if (isMobile) await cell.tap()
    else await cell.click()
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
    await cell.press('ArrowRight')
    await expect(page.getByRole('button', { name: cellName(target + 1) })).toBeFocused()
    await cell.click()
    const board = page.getByRole('group', { name: '数独棋盘' })
    const overlay = page.locator('.sudoku-clues')
    const boardBox = await board.boundingBox(),
      overlayBox = await overlay.boundingBox()
    if (!boardBox || !overlayBox) throw new Error('Missing visible board geometry')
    expect(Math.abs(boardBox.width - boardBox.height)).toBeLessThan(2)
    expect(Math.abs(overlayBox.width - (boardBox.width - 4))).toBeLessThan(2)
    expect(Math.abs(overlayBox.x - boardBox.x - 2)).toBeLessThan(1)
    await expect(overlay).toHaveCSS('pointer-events', 'none')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (variant === 'killer') {
      const sum = await page.locator('.sudoku-clues .sum').first().boundingBox()
      const notes = await cell.locator('.notes span').first().boundingBox()
      if (!sum || !notes) throw new Error('Missing sum or candidate geometry')
      expect(sum.y + sum.height).toBeLessThanOrEqual(notes.y + 1)
      const lastNote = await cell.locator('.notes span').last().boundingBox()
      const cellBox = await cell.boundingBox()
      if (!lastNote || !cellBox) throw new Error('Missing candidate layout')
      const noteLayout = await cell.locator('.notes').evaluate((element) => {
        const style = getComputedStyle(element)
        return { height: style.height, paddingTop: style.paddingTop, rows: style.gridTemplateRows }
      })
      expect(
        lastNote.y + lastNote.height,
        JSON.stringify({ cellBox, lastNote, noteLayout }),
      ).toBeLessThanOrEqual(cellBox.y + cellBox.height)
    }
    for (const theme of ['浅色', '深色']) {
      await page
        .getByRole('radiogroup', { name: '界面主题', exact: true })
        .getByText(theme, { exact: true })
        .click()
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === '深色' ? 'dark' : 'light',
      )
      if (testInfo.project.name === 'desktop')
        await board.screenshot({
          path: `.superpowers/sdd/2026-10-11-sudoku-variants/${variant}-${theme === '深色' ? 'dark' : 'light'}-360.png`,
        })
    }
  })
}
test('keeps boards square and focus visible at 360, 390 and desktop widths', async ({
  page,
}, testInfo) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await selectGameMenuAction(page, '生成候选数')
  await page.getByRole('button', { name: cellName(2) }).click()
  await page.getByRole('button', { name: cellName(2) }).press('ArrowRight')
  await expect(page.getByRole('button', { name: cellName(3) })).toBeFocused()
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const board = await page.getByRole('group', { name: '数独棋盘' }).boundingBox()
    const firstCell = await page.getByRole('button', { name: cellName(0) }).boundingBox()
    const lastCell = await page.getByRole('button', { name: cellName(80) }).boundingBox()
    if (!board || !firstCell || !lastCell)
      throw new Error('The board and corner cells must be visible')
    expect(Math.abs(board.width - board.height)).toBeLessThan(2)
    expect(Math.abs(firstCell.height - lastCell.height)).toBeLessThan(1)
    expect(lastCell.y + lastCell.height).toBeLessThanOrEqual(board.y + board.height)
    if (testInfo.project.name === 'desktop')
      await page.screenshot({
        path: `.superpowers/sdd/2026-10-11-sudoku-variants/game-${width}.png`,
        fullPage: true,
      })
  }
  await page
    .getByRole('radiogroup', { name: '界面主题', exact: true })
    .getByText('深色', { exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await page
    .getByRole('radiogroup', { name: '界面主题', exact: true })
    .getByText('系统', { exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page
    .getByRole('button', { name: '返回首页', exact: true })
    .or(page.getByRole('link', { name: '返回首页', exact: true }))
    .click()
  if (testInfo.project.name === 'desktop')
    await page.screenshot({
      path: '.superpowers/sdd/2026-10-11-sudoku-variants/home-desktop.png',
      fullPage: true,
    })
})
