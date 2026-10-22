import { expect, test } from '@playwright/test'
import { useNextGenerationSeed } from './support'

for (const root of ['http://127.0.0.1:4173/', 'http://127.0.0.1:4174/sudoku/']) {
  test(`browses without WASM and retries unavailable computation locally at ${root}`, async ({
    page,
  }) => {
    let failures = 2
    let downloads = 0
    await page.route('**/*.wasm', async (route) => {
      downloads++
      if (failures > 0) {
        failures--
        await route.fulfill({ status: 503, body: 'Temporarily unavailable' })
        return
      }
      await route.continue()
    })

    await page.goto(root)
    await expect(page.getByRole('button', { name: /开始一局数独/ })).toBeEnabled()
    await page.goto(`${root}#/learn/rules`)
    await expect(page.getByRole('heading', { name: '认识数独', exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeVisible()
    await page.goto(`${root}#/records`)
    await expect(page.getByText('已完成 0 局', { exact: true })).toBeVisible()
    await page.goto(`${root}#/play/daily`)
    await expect(page.getByText('今日已完成 0 / 6 种玩法', { exact: true })).toBeVisible()
    expect(downloads).toBe(0)

    await useNextGenerationSeed(page, 'lazy-browsing-retry')
    await page.goto(`${root}#/play/free?start=1&difficulty=easy`)
    for (let attempt = 0; attempt < 2; attempt++) {
      // Wait for this attempt rather than pressing the prior failure's still-rendered retry.
      await expect.poll(() => downloads).toBe(attempt + 1)
      await expect(page.getByRole('alert').filter({ hasText: '出题失败，请重试。' })).toBeVisible()
      await expect(page.getByRole('main', { name: '数独游戏', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '重试出题', exact: true }).focus()
      await page.keyboard.press('Enter')
    }

    await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeVisible()
    expect(downloads).toBe(3)
  })

  test(`rejects mismatched computation identities while browsing remains available at ${root}`, async ({
    page,
  }) => {
    let mismatch = true
    await page.route('**/*.wasm', async (route) => {
      const response = await route.fetch()
      if (!mismatch) {
        await route.fulfill({ response })
        return
      }
      const bytes = Buffer.from(await response.body())
      const original = Buffer.from('sudoku-v12')
      const replacement = Buffer.from('sudoku-x11')
      let changed = 0
      for (
        let index = bytes.indexOf(original);
        index >= 0;
        index = bytes.indexOf(original, index + original.length)
      ) {
        replacement.copy(bytes, index)
        changed++
      }
      expect(changed).toBeGreaterThan(0)
      await route.fulfill({ response, body: bytes })
    })

    await page.goto(root)
    await expect(page.getByRole('button', { name: /开始一局数独/ })).toBeEnabled()
    await useNextGenerationSeed(page, 'lazy-engine-retry')
    await page.getByRole('button', { name: /开始一局数独/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: '出题失败，请重试。' })).toBeVisible()
    await expect(page.getByRole('main', { name: '数独游戏', exact: true })).toBeVisible()

    mismatch = false
    await page.getByRole('button', { name: '重试出题', exact: true }).click()

    await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeVisible()
  })
}
