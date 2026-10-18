import { test, expect, seedSession, makeVariantHintSession, cellName } from './support'
import { makeSession } from '../support/gameFixtures'

test.use({ timezoneId: 'Asia/Shanghai' })

test('orders detailed saves by start time and opens the selected attempt', async ({ page }) => {
  const entries = [...makeSession().entries]
  entries[2] = 9
  entries[3] = 6
  const notes = [...makeSession().notes]
  notes[5] = 511
  const recent = makeSession({
    id: 'z-recent-daily-practice',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: false },
    entries,
    notes,
    elapsedMs: 65000,
    startedAt: '2026-10-11T10:25:00.000Z',
  })
  const older = makeSession({
    id: 'a-older-free',
    startedAt: '2025-12-31T15:05:00.000Z',
  })
  await seedSession(page, older)
  await seedSession(page, recent, '/play/daily')
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.getByRole('button', { name: '继续上次', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '继续上次', exact: true })
  const saves = dialog.getByRole('list', { name: '未完成的存档' }).getByRole('link')

  await expect(saves).toHaveCount(2)
  await expect(saves.first()).toContainText('2026-10-11 · 每日练习')
  await expect(saves.first()).toContainText('已填 2 / 51 格')
  await expect(saves.first()).toContainText('已用时 01:05')
  await expect(saves.first()).toContainText('2026/10/11 18:25')
  await expect(saves.last()).toContainText('2025/12/31 23:05')
  await saves.first().click()

  await expect(page).toHaveURL(/#\/play\/daily\?variant=classic&session=z-recent-daily-practice$/)
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/数字9/)
})

test('returns focus when dismissed and preserves the recent lesson action', async ({ page }) => {
  await seedSession(page, makeSession())
  await seedSession(page, makeVariantHintSession('arrow'))
  await page.goto('/#/learn/rules')
  await expect(page.getByRole('heading', { name: '认识数独', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '一格一念，返回首页', exact: true }).click()
  const trigger = page.getByRole('button', { name: '继续上次', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '继续上次', exact: true })
  await expect(dialog.getByRole('link', { name: '继续最近的课程 →', exact: true })).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  // Naive UI's scale entrance can begin after WebKit's first stable layout frames.
  await expect(dialog).toHaveCSS('transform', 'none')
  await dialog.getByRole('link', { name: '继续最近的课程 →', exact: true }).click()

  await expect(page).toHaveURL(/#\/learn\/rules$/)
})

test('keeps long daily metadata and full-row targets inside a narrow resume sheet', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const formal = makeSession({
    id: 'daily:2025-12-31:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2025-12-31', formalAttempt: true },
    elapsedMs: 123456789,
    startedAt: '2025-12-31T15:05:00.000Z',
  })
  const thermo = makeVariantHintSession('thermo')
  thermo.mode = 'daily'
  thermo.metadata = { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: false }
  await seedSession(page, formal, '/play/daily')
  await seedSession(page, thermo, '/play/daily?variant=thermo')
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.getByRole('button', { name: '继续上次', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '继续上次', exact: true })
  const saves = dialog.getByRole('list', { name: '未完成的存档' }).getByRole('link')

  await expect(saves).toHaveCount(2)
  await expect(saves.first()).toContainText('温度计数独')
  await expect(saves.first()).toContainText('2026-10-11 · 每日练习')
  await expect(saves.last()).toContainText('2025-12-31 · 每日正式挑战')
  await expect(saves.last()).toContainText('已用时 2057:36')
  for (const save of await saves.all()) {
    const geometry = await save.evaluate((element) => {
      const bounds = element.getBoundingClientRect()

      return {
        left: bounds.left,
        right: bounds.right,
        height: bounds.height,
        overflows: element.scrollWidth > element.clientWidth,
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(360)
    expect(geometry.height).toBeGreaterThanOrEqual(44)
    expect(geometry.overflows).toBe(false)
  }
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  await page.screenshot({
    path: `test-results/visual/web-parity/resume-${testInfo.project.name}.png`,
    animations: 'disabled',
  })
})

test('shares spare phone height above and below the home content while short screens scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1400 })
  await page.goto('/#/')
  await expect(page.getByRole('button', { name: '开始一局数独', exact: true })).toBeEnabled()
  const spacing = await page.getByRole('main').evaluate((main) => {
    const intro = main.querySelector('.home-intro')?.getBoundingClientRect()
    const cards = main.querySelector('.mode-grid')?.getBoundingClientRect()
    if (!intro || !cards) {
      throw new Error('Missing Home content')
    }
    const bounds = main.getBoundingClientRect()

    return { above: intro.top - bounds.top, below: bounds.bottom - cards.bottom }
  })

  expect(spacing.above).toBeGreaterThan(0)
  expect(spacing.below).toBeGreaterThan(spacing.above)
  expect(spacing.above / (spacing.above + spacing.below)).toBeCloseTo(0.4, 2)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1400)

  await page.setViewportSize({ width: 360, height: 640 })
  const records = page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: '数独足迹', exact: true }) })
  await records.scrollIntoViewIfNeeded()

  await expect(records).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(640)
})
