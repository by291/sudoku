import {
  test,
  expect,
  seedSession,
  cellName,
  selectGameMenuAction,
  openGameSettings,
  closeGameSettings,
} from './support'
import { makeSession } from '../support/gameFixtures'

test('reserves the theme focus ring for keyboard navigation', async ({ page }, testInfo) => {
  await page.goto('/')
  const themes = page.getByRole('radiogroup', { name: '界面主题', exact: true })

  for (const theme of ['浅色', '深色']) {
    const choice = themes.getByText(theme, { exact: true })
    const radio = themes.getByRole('radio', { name: `${theme}主题`, exact: true })
    const label = themes.locator('label').filter({ has: page.getByText(theme, { exact: true }) })
    await choice.click()

    await expect(radio).toBeChecked()
    await expect(label).toHaveCSS('outline-style', 'none')
    await expect(label.locator('.n-radio-button__state-border')).toHaveCSS(
      'box-shadow',
      /^(none|rgba\(0, 0, 0, 0\).*)$/,
    )
    await themes.screenshot({
      path: `test-results/visual/board-feedback/theme-${theme === '浅色' ? 'light' : 'dark'}-${testInfo.project.name}.png`,
      animations: 'disabled',
    })

    // Mobile WebKit skips radios in Tab order; establish keyboard modality before focusing one.
    await page.keyboard.press('Tab')
    await radio.focus()
    await radio.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await expect(radio).toBeFocused()
    await expect(label).toHaveCSS('outline-style', 'solid')
    await expect(label).toHaveCSS('outline-width', '2px')
  }
})

test('explains protected selections while keeping whole-board helpers available', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const digit = page.getByRole('button', { name: '输入数字4', exact: true })
  await expect(digit).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: '先选择一个空格' })).toBeVisible()
  await page.getByRole('button', { name: cellName(0) }).click()
  await expect(digit).toBeDisabled()
  await expect(page.getByRole('button', { name: '擦除', exact: true })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: '题目给定' })).toBeVisible()
  await expect(page.getByRole('button', { name: '逻辑提示', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: cellName(2) }).click()
  await expect(digit).toBeEnabled()
  await digit.click()
  await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/数字4/)
})

test('restores focus after a confirmation and isolates its keys from the board', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const cell = page.getByRole('button', { name: cellName(2) })
  await cell.click()
  const trigger = page.getByRole('button', { name: '更多操作', exact: true })
  await selectGameMenuAction(page, '重新开始本题')
  const dialog = page.getByRole('dialog')
  const cancel = dialog.getByRole('button', { name: '取消', exact: true })
  await expect(cancel).toBeFocused()
  await page.keyboard.press('4')
  await expect(cell).toHaveAccessibleName(/空格/)
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '确认开始', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('chooses the next difficulty with keys without editing the current game', async ({ page }) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const cell = page.getByRole('button', { name: cellName(2) })
  await cell.click()
  await selectGameMenuAction(page, '新开一局')
  const difficulty = page.getByRole('radiogroup', { name: '难度', exact: true })
  const easy = difficulty.getByRole('radio', { name: '简单', exact: true })
  await expect(easy).toBeEnabled()
  await easy.focus()
  await expect(easy).toBeFocused()
  await easy.press('ArrowRight')
  await expect(difficulty.getByRole('radio', { name: '中等', exact: true })).toBeChecked()
  await page.keyboard.press('4')
  await expect(cell).toHaveAccessibleName(/空格/)
  await expect(cell).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
})

test('offers touch-sized digits and a visible resume entry on small screens', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await seedSession(page, makeSession())
  const size = await page.getByRole('button', { name: '输入数字1', exact: true }).boundingBox()

  expect(size?.width).toBeGreaterThanOrEqual(30)
  expect(size?.height).toBeGreaterThanOrEqual(44)
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  const continueButton = page.getByRole('button', { name: '继续上次', exact: true })
  const resume = await continueButton.boundingBox()

  expect(resume && resume.y + resume.height).toBeLessThan(800)
  await expect(continueButton).toBeInViewport()
})

test('skips to the main content without changing a game hash route', async ({ page }) => {
  await seedSession(page, makeSession())
  const skip = page.getByRole('link', { name: '跳到主要内容', exact: true })
  await skip.focus()
  await skip.press('Enter')
  await expect(page).toHaveURL(/#\/play\/free/)
  await expect(page.getByRole('main')).toBeFocused()
})

test('toggles a touch-sized setting from its label without editing the board', async ({ page }) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const cell = page.getByRole('button', { name: cellName(2) })
  await cell.click()
  await openGameSettings(page)
  const timerSetting = page
    .getByRole('checkbox', { name: '显示计时', exact: true })
    .or(page.getByRole('switch', { name: '显示计时', exact: true }))
  const target = await timerSetting.boundingBox()

  expect(target?.width).toBeGreaterThanOrEqual(44)
  expect(target?.height).toBeGreaterThanOrEqual(44)
  await page.getByText('显示计时', { exact: true }).click()
  await expect(timerSetting).not.toBeChecked()
  await timerSetting.focus()
  await timerSetting.press('4')
  await expect(cell).toHaveAccessibleName(/空格/)
  await timerSetting.press('Space')
  await expect(timerSetting).toBeChecked()
  await closeGameSettings(page)
})

test('updates existing controls to the active palette when changing themes', async ({ page }) => {
  await seedSession(page, makeSession())
  const themes = page.getByRole('radiogroup', { name: '界面主题', exact: true })
  await themes.getByText('深色', { exact: true }).click()
  await openGameSettings(page)
  await expect(page.getByText('显示计时', { exact: true })).toHaveCSS('color', 'rgb(228, 236, 227)')
  await expect(page.getByRole('button', { name: '关闭设置', exact: true })).toHaveCSS(
    'background-color',
    'rgb(32, 51, 46)',
  )
  await closeGameSettings(page)
  await selectGameMenuAction(page, '重新开始本题')
  const confirm = page.getByRole('dialog').getByRole('button', { name: '确认开始', exact: true })
  await confirm.focus()
  await expect(confirm).toHaveCSS('color', 'rgb(22, 37, 33)')
  await confirm.press('Escape')
  await themes.getByText('浅色', { exact: true }).click()
  await openGameSettings(page)
  await expect(page.getByText('显示计时', { exact: true })).toHaveCSS('color', 'rgb(35, 58, 54)')
  await expect(page.getByRole('button', { name: '关闭设置', exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 254, 249)',
  )
  await closeGameSettings(page)
})
