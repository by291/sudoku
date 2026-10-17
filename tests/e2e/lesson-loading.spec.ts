import { expect, test } from './support'
import { test as browserTest } from '@playwright/test'
import { deferred } from '../support/deferred'

for (const root of ['http://127.0.0.1:4173/', 'http://127.0.0.1:4174/sudoku/']) {
  // The expected 503 emits a console error, so this case bypasses the error-free fixture.
  browserTest(
    `retries a failed lesson content request without losing keyboard focus at ${root}`,
    async ({ page }) => {
      let requests = 0
      await page.route(/\/assets\/rules-[^/]+\.js$/, async (route) => {
        requests += 1
        if (requests === 1) {
          await route.fulfill({ status: 503, contentType: 'text/javascript', body: '' })
          return
        }
        await route.continue()
      })

      await page.goto(`${root}#/learn/rules`)
      const retry = page.getByRole('button', { name: '重试', exact: true })
      await expect(retry).toBeVisible()
      await retry.focus()
      await page.keyboard.press('Enter')

      await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeVisible()
      await expect(page.getByRole('radio', { name: '学习讲解', exact: true })).toBeFocused()
      expect(requests).toBe(2)
    },
  )

  test(`keeps lesson board and guide regions stable while selected content loads at ${root}`, async ({
    page,
  }, testInfo) => {
    const gate = deferred<void>()
    await page.route(/\/assets\/rules-[^/]+\.js$/, async (route) => {
      await gate.promise
      await route.continue()
    })

    try {
      await page.goto(`${root}#/learn/rules`)
      await expect(page.getByRole('heading', { name: '认识数独', exact: true })).toBeVisible()
      await expect(page.getByRole('status')).toContainText('正在读取课程内容')
      await expect(page.getByRole('radio', { name: '动手练习', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: '开始练习', exact: true })).toBeDisabled()
      const pendingBoard = await page.locator('.lesson-board').boundingBox()
      const pendingGuide = await page
        .getByRole('complementary', { name: '学习讲解', exact: true })
        .boundingBox()
      if (!pendingBoard || !pendingGuide) {
        throw new Error('Missing pending lesson regions')
      }

      await page.screenshot({ path: testInfo.outputPath('pending.png'), animations: 'disabled' })
      gate.resolve()
      await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '开始练习', exact: true })).toBeEnabled()
      const readyBoard = await page.locator('.lesson-board').boundingBox()
      const readyGuide = await page
        .getByRole('complementary', { name: '学习讲解', exact: true })
        .boundingBox()
      if (!readyBoard || !readyGuide) {
        throw new Error('Missing ready lesson regions')
      }

      await page.screenshot({ path: testInfo.outputPath('ready.png'), animations: 'disabled' })
      expect(readyBoard.y).toBeCloseTo(pendingBoard.y, 1)
      expect(readyBoard.height).toBeCloseTo(pendingBoard.height, 1)
      expect(readyGuide.y).toBeCloseTo(pendingGuide.y, 1)
      expect(readyGuide.x).toBeCloseTo(pendingGuide.x, 1)
    } finally {
      gate.resolve()
    }
  })
}
