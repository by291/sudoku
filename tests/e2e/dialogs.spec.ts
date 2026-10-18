import { test, expect, seedSession, seedRecords, makeVariantHintSession } from './support'
import { makeSession } from '../support/gameFixtures'

test('keeps setup inside the phone viewport and restores keyboard focus', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/#/')
  const trigger = page.getByRole('button', { name: '开始一局数独', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '开始一局数独', exact: true })
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  if (!bounds) {
    throw new Error('Missing visible setup dialog')
  }

  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360)
  expect(Math.abs(bounds.y + bounds.height - 800)).toBeLessThan(2)
  await page.screenshot({
    path: `test-results/visual/web-parity/setup-${testInfo.project.name}.png`,
    animations: 'disabled',
  })
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
  await expect(dialog.getByRole('list', { name: '未完成的存档' }).getByRole('link')).toHaveCount(2)
  await dialog.getByRole('link', { name: /箭头数独.*自由游玩/ }).click()
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 箭头数独', exact: true }),
  ).toBeVisible()
})

test('keeps ready dialog content close to its heading and actions', async ({ page }, testInfo) => {
  await page.goto('/#/')
  await expect(page.getByRole('button', { name: '开始一局数独', exact: true })).toBeEnabled()
  const daily = makeVariantHintSession('killer')
  daily.id = 'daily-killer-resume'
  daily.mode = 'daily'
  daily.metadata = { kind: 'daily', challengeDate: '2026-10-15', formalAttempt: true }
  daily.startedAt = '2026-10-15T00:53:00.000Z'
  daily.elapsedMs = 65000
  await seedRecords(page, 'sessions', [
    { session: daily },
    { session: makeSession() },
    { session: makeVariantHintSession('thermo') },
  ])
  await page.reload()
  await page.getByRole('button', { name: '开始一局数独', exact: true }).click()
  const setup = page.getByRole('dialog', { name: '开始一局数独', exact: true })
  const start = setup.getByRole('button', { name: '开始游戏', exact: true })
  const warning = setup.getByText(/标准数独有未完成的存档/)
  await expect(start).toBeEnabled()
  await expect(warning).toBeVisible()
  await expect(setup).toHaveCSS('transform', 'none')
  await warning.scrollIntoViewIfNeeded()
  const warningBounds = await warning.boundingBox()
  const startBounds = await start.boundingBox()
  if (!warningBounds || !startBounds) {
    throw new Error('Missing setup content')
  }

  // A completed read must not leave an empty loading panel between the warning and actions.
  expect.soft(startBounds.y - warningBounds.y - warningBounds.height).toBeLessThanOrEqual(48)
  await page.screenshot({
    path: `test-results/visual/dialog-redesign/setup-${testInfo.project.name}.png`,
    animations: 'disabled',
  })
  await setup.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '继续上次', exact: true }).click()
  const resume = page.getByRole('dialog', { name: '继续上次', exact: true })
  await expect(resume.getByRole('list', { name: '未完成的存档' }).getByRole('link')).toHaveCount(3)
  await expect(resume).toHaveCSS('transform', 'none')
  const heading = resume.getByText('继续上次', { exact: true })
  const headingBounds = await heading.boundingBox()
  const introBounds = await resume.locator('.resume-intro').boundingBox()
  if (!headingBounds || !introBounds) {
    throw new Error('Missing resume introduction')
  }

  expect.soft(introBounds.y - headingBounds.y - headingBounds.height).toBeLessThanOrEqual(32)
  await page.screenshot({
    path: `test-results/visual/dialog-redesign/resume-${testInfo.project.name}.png`,
    animations: 'disabled',
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({
    path: `test-results/visual/dialog-redesign/resume-dark-${testInfo.project.name}.png`,
    animations: 'disabled',
  })
})
