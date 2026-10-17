import {
  test,
  expect,
  seedSession,
  cellName,
  makeVariantHintSession,
  selectGameMenuAction,
  enterGameDigit,
} from './support'
import { makeSession } from '../support/gameFixtures'

test('shows conflicts through cell backgrounds and preserves sparse notes in both themes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 850 })
  const notes = Array<number>(81).fill(0)
  notes[3] = 511
  notes[5] = 273 // Digits 1, 5, and 9 occupy the diagonal of the three-by-three note grid.
  await seedSession(page, makeSession({ notes }))
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(page, 5)
  const conflict = page.getByRole('button', { name: cellName(0) })
  const sparse = page.getByRole('button', { name: cellName(5) })
  // Entering 5 removes that peer note; the remaining 1 and 9 must keep their original positions.
  await expect(sparse).toHaveAccessibleName(/笔记1、9/)
  const positions = await sparse.locator('.notes span').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element)
      return [element.textContent?.trim(), style.gridRowStart, style.gridColumnStart]
    }),
  )
  expect(positions).toEqual([
    ['1', '1', '1'],
    ['9', '3', '3'],
  ])

  for (const theme of ['浅色', '深色']) {
    await page
      .getByRole('radiogroup', { name: '界面主题' })
      .getByText(theme, { exact: true })
      .click()
    await expect(conflict).toHaveAccessibleName(/冲突/)
    await expect(conflict.locator('.marker')).toHaveCount(0)
    await expect(
      page.getByText('同一行、列、宫、区域、对角线或笼中的数字不能重复。', { exact: true }),
    ).toHaveCount(0)
    await expect(conflict).toHaveCSS(
      'background-color',
      theme === '浅色' ? 'rgb(250, 228, 223)' : 'rgb(99, 62, 54)',
    )
    if (testInfo.project.name === 'desktop') {
      await page.getByRole('group', { name: '数独棋盘' }).screenshot({
        path: `.superpowers/board-feedback/conflict-${theme === '浅色' ? 'light' : 'dark'}.png`,
      })
    }
  }
})

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
    if (isMobile) {
      await cell.tap()
    } else {
      await cell.click()
    }

    await expect(cell).toHaveAttribute('aria-pressed', 'true')
    await cell.press('ArrowRight')
    await expect(page.getByRole('button', { name: cellName(target + 1) })).toBeFocused()
    await cell.click()
    const board = page.getByRole('group', { name: '数独棋盘' })
    const overlay = page.locator('.sudoku-clues')
    const boardBox = await board.boundingBox()
    const overlayBox = await overlay.boundingBox()
    if (!boardBox || !overlayBox) {
      throw new Error('Missing visible board geometry')
    }

    expect(Math.abs(boardBox.width - boardBox.height)).toBeLessThan(2)
    expect(Math.abs(overlayBox.width - (boardBox.width - 4))).toBeLessThan(2)
    expect(Math.abs(overlayBox.x - boardBox.x - 2)).toBeLessThan(1)
    await expect(overlay).toHaveCSS('pointer-events', 'none')

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (variant === 'killer') {
      const sum = await page.locator('.sudoku-clues .sum').first().boundingBox()
      const notes = await cell.locator('.notes span').first().boundingBox()
      if (!sum || !notes) {
        throw new Error('Missing sum or candidate geometry')
      }

      expect(sum.y + sum.height).toBeLessThanOrEqual(notes.y + 1)
      const lastNote = await cell.locator('.notes span').last().boundingBox()
      const cellBox = await cell.boundingBox()
      if (!lastNote || !cellBox) {
        throw new Error('Missing candidate layout')
      }

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
      if (testInfo.project.name === 'desktop') {
        await board.screenshot({
          path: `.superpowers/sdd/2026-10-11-sudoku-variants/${variant}-${theme === '深色' ? 'dark' : 'light'}-360.png`,
        })
      }
    }
  })
}
test('keeps boards square and focus visible at 360, 390 and desktop widths', async ({
  page,
}, testInfo) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const hoverCell = page.getByRole('button', { name: cellName(9) })
  const gridLines = await hoverCell.evaluate((element) => {
    const style = getComputedStyle(element)
    return { right: style.borderRightColor, bottom: style.borderBottomColor }
  })
  await hoverCell.hover()
  await expect(hoverCell).toHaveCSS('border-right-color', gridLines.right)
  await expect(hoverCell).toHaveCSS('border-bottom-color', gridLines.bottom)
  await selectGameMenuAction(page, '生成候选数')
  await page.getByRole('button', { name: cellName(2) }).click()
  await page.getByRole('button', { name: cellName(2) }).press('ArrowRight')
  await expect(page.getByRole('button', { name: cellName(3) })).toBeFocused()

  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })

    // A closing menu is teleported and may still be leaving when the viewport changes.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await expect(async () => {
      // Read one layout snapshot while the resize observer settles the board size.
      const geometry = await page.getByRole('group', { name: '数独棋盘' }).evaluate((element) => {
        const cells = element.querySelectorAll('button')
        const board = element.getBoundingClientRect()
        const firstCell = cells[0]?.getBoundingClientRect()
        const lastCell = cells[80]?.getBoundingClientRect()
        if (!firstCell || !lastCell) {
          throw new Error('The board and corner cells must be visible')
        }

        return {
          visible: [element, cells[0], cells[80]].every(
            (target) =>
              target instanceof HTMLElement &&
              getComputedStyle(target).visibility === 'visible' &&
              target.getClientRects().length > 0,
          ),
          boardWidth: board.width,
          boardHeight: board.height,
          boardBottom: board.bottom,
          firstCellWidth: firstCell.width,
          firstCellHeight: firstCell.height,
          lastCellWidth: lastCell.width,
          lastCellHeight: lastCell.height,
          lastCellBottom: lastCell.bottom,
        }
      })

      expect(geometry.visible).toBe(true)
      expect(geometry.boardWidth).toBeGreaterThan(0)
      expect(geometry.boardHeight).toBeGreaterThan(0)
      expect(geometry.firstCellWidth).toBeGreaterThan(0)
      expect(geometry.firstCellHeight).toBeGreaterThan(0)
      expect(geometry.lastCellWidth).toBeGreaterThan(0)
      expect(geometry.lastCellHeight).toBeGreaterThan(0)
      expect(Math.abs(geometry.boardWidth - geometry.boardHeight)).toBeLessThan(2)
      expect(Math.abs(geometry.firstCellHeight - geometry.lastCellHeight)).toBeLessThan(1)
      expect(geometry.lastCellBottom).toBeLessThanOrEqual(geometry.boardBottom)
    }).toPass({ timeout: 10_000 })
    if (testInfo.project.name === 'desktop') {
      await page.screenshot({
        path: `.superpowers/sdd/2026-10-11-sudoku-variants/game-${width}.png`,
        fullPage: true,
      })
    }
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
  if (testInfo.project.name === 'desktop') {
    await page.screenshot({
      path: '.superpowers/sdd/2026-10-11-sudoku-variants/home-desktop.png',
      fullPage: true,
    })
  }
})
