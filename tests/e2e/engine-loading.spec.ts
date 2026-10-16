import { expect, test } from '@playwright/test'

for (const root of ['http://127.0.0.1:4173/', 'http://127.0.0.1:4174/sudoku/']) {
  test(`retries unavailable engine assets before opening storage at ${root}`, async ({ page }) => {
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
    await page.addInitScript(() => {
      Reflect.set(window, 'engineTestDatabaseOpens', 0)
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
        Reflect.set(
          window,
          'engineTestDatabaseOpens',
          Number(Reflect.get(window, 'engineTestDatabaseOpens')) + 1,
        )
        return open.call(this, name, version)
      }
    })

    await page.goto(root)
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(page.getByText('数独引擎加载失败，请重试。')).toBeVisible({ timeout: 3000 })
      expect(await page.evaluate(() => Reflect.get(window, 'engineTestDatabaseOpens'))).toBe(0)
      await page.getByRole('button', { name: '重试', exact: true }).focus()
      await page.keyboard.press('Enter')
    }

    await expect(page.getByRole('main', { name: '数独游戏', exact: true })).toBeVisible()
    expect(downloads).toBe(3)
    expect(
      await page.evaluate(() => Reflect.get(window, 'engineTestDatabaseOpens')),
    ).toBeGreaterThan(0)
  })

  test(`rejects mismatched engine identities and retries fresh code at ${root}`, async ({
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
      const original = Buffer.from('sudoku-v11')
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
    await expect(page.getByText('数独引擎加载失败，请重试。')).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('main', { name: '数独游戏', exact: true })).toHaveCount(0)
    mismatch = false
    await page.getByRole('button', { name: '重试', exact: true }).click()

    await expect(page.getByRole('main', { name: '数独游戏', exact: true })).toBeVisible()
  })
}
