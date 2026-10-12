import { test, expect, seedSession, makeVariantHintSession } from './support'
import { makeSession } from '../support/gameFixtures'

test('keeps setup inside the phone viewport and restores keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/#/')
  const trigger = page.getByRole('button', { name: '开始一局数独', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '开始一局数独', exact: true })
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  if (!bounds) throw new Error('Missing visible setup dialog')
  expect(bounds.x).toBeGreaterThanOrEqual(15)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(345)
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await expect(dialog.getByRole('button', { name: '开始游戏', exact: true })).toBeEnabled()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '开始游戏', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('radio', { name: '标准数独', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '开始游戏', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('chooses among multiple saved games in an accessible resume dialog', async ({ page }) => {
  await seedSession(page, makeSession())
  await seedSession(page, makeVariantHintSession('arrow'))
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.getByRole('button', { name: '继续上次', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '继续上次', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: /数独 · 自由游玩/ })).toHaveCount(2)
  await dialog.getByRole('link', { name: /箭头数独 · 自由游玩/ }).click()
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 箭头数独', exact: true }),
  ).toBeVisible()
})
