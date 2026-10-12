import { test, expect, seedSession, readSessions, cellName } from './support'
import { makeSession } from '../support/gameFixtures'

test.use({ actionTimeout: 10000 })

test('chooses the free puzzle in a home dialog before creating a session', async ({
  page,
}, testInfo) => {
  await page.goto('/#/')
  const trigger = page.getByRole('button', { name: /开始一局数独/ })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '开始一局数独', exact: true })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
  await dialog.getByText('箭头数独', { exact: true }).click()
  await dialog.getByText('中等', { exact: true }).click()
  await expect(dialog.getByRole('radio', { name: '箭头数独', exact: true })).toBeChecked()
  await expect(dialog.getByRole('button', { name: '开始游戏', exact: true })).toBeEnabled()
  if (testInfo.project.name === 'desktop') {
    await page.screenshot({
      path: '.superpowers/ux-refinement/setup-desktop.png',
      animations: 'disabled',
    })
  }
  expect(await readSessions(page)).toHaveLength(0)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(trigger).toBeFocused()
  expect(await readSessions(page)).toHaveLength(0)
  await trigger.click()
  await dialog.getByText('箭头数独', { exact: true }).click()
  await dialog.getByText('中等', { exact: true }).click()
  await dialog.getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible({ timeout: 20000 })
  await expect
    .poll(async () => (await readSessions(page))[0]?.session.puzzle.rules.kind)
    .toBe('arrow')
  expect((await readSessions(page))[0].session.puzzle.difficulty).toBe('medium')
  await expect(page.getByRole('radiogroup', { name: '难度', exact: true })).toHaveCount(0)
})

test('keeps edits when a new-game dialog is cancelled and yields game shortcuts', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const cell = page.getByRole('button', { name: cellName(2) })
  await cell.click()
  await page.keyboard.press('4')
  await page.getByRole('button', { name: '新开一局', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '开始一局数独', exact: true })
  await dialog.getByText('温度计数独', { exact: true }).click()
  await page.keyboard.press('n')
  await page.keyboard.press('9')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(cell).toHaveAccessibleName(/数字4/)
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 标准数独', exact: true }),
  ).toBeVisible()
  expect((await readSessions(page))[0].session.id).toBe('fixture-free-session')
})

test('selects the daily type in a dialog without starting on selection', async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('link', { name: /每日挑战/ }).click()
  const dialog = page.getByRole('dialog', { name: '选择每日挑战', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByText('箭头数独', { exact: true }).click()
  await expect(dialog).toContainText('中等难度')
  expect(await readSessions(page)).toHaveLength(0)
  await dialog.getByRole('button', { name: '开始今日挑战', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible({ timeout: 20000 })
  await expect
    .poll(async () => (await readSessions(page))[0]?.session.puzzle.rules.kind)
    .toBe('arrow')
  expect((await readSessions(page))[0].session.metadata.kind).toBe('daily')
})

test('resumes from a standalone home action', async ({ page }, testInfo) => {
  await seedSession(page, makeSession())
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await expect(page.getByRole('button', { name: '继续上次', exact: true })).toBeVisible()
  if (testInfo.project.name === 'desktop') {
    await page.screenshot({
      path: '.superpowers/ux-refinement/home-desktop.png',
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.getByRole('button', { name: '继续上次', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  expect((await readSessions(page))[0].session.id).toBe('fixture-free-session')
})

test('groups learning by type and provides a consistent parent navigation', async ({ page }) => {
  await page.goto('/#/learn')
  await expect(page.getByRole('list', { name: '课程路径' }).getByRole('link')).toHaveCount(6)
  await page
    .getByRole('navigation', { name: '学习玩法' })
    .getByRole('link', { name: /对角数独/ })
    .click()
  await expect(page.getByRole('list', { name: '课程路径' }).getByRole('link')).toHaveCount(1)
  await page.getByRole('link', { name: /认识对角数独/ }).click()
  await page
    .getByRole('navigation', { name: '页面导航' })
    .getByRole('link', { name: '返回课程列表', exact: true })
    .click()
  await expect(page).toHaveURL(/#\/learn\?variant=diagonal$/)
  await page
    .getByRole('navigation', { name: '页面导航' })
    .getByRole('link', { name: '返回首页', exact: true })
    .click()
  await expect(page).toHaveURL(/#\/$/)
})

test('opens a lesson at the top and restores the course position on browser back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 600 })
  await page.goto('/#/learn')
  const lesson = page.getByRole('link', { name: /隐性数对/ })
  await lesson.scrollIntoViewIfNeeded()
  const courseScroll = await page.evaluate(() => window.scrollY)
  expect(courseScroll).toBeGreaterThan(300)
  await lesson.click()
  await expect(page).toHaveURL(/#\/learn\/hidden-pair$/)
  await expect(page.getByRole('link', { name: '返回课程列表', exact: true })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.goBack()
  await expect(page).toHaveURL(/#\/learn$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(courseScroll)
})

test('resets scroll between a lesson and its saved full-board practice', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 600 })
  await seedSession(
    page,
    makeSession({ mode: 'learning', metadata: { kind: 'learning', lessonId: 'rules' } }),
    '/learn/rules?practice=1',
  )
  await page.getByRole('link', { name: '返回本节课程', exact: true }).click()
  const practice = page.getByRole('link', { name: /进入完整棋盘练习/ })
  await practice.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await practice.click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.getByRole('link', { name: '返回本节课程', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('uses persistent labelled switches for game preferences', async ({ page }) => {
  await seedSession(page, makeSession())
  await page.getByRole('switch', { name: '显示计时', exact: true }).uncheck()
  await page.getByRole('switch', { name: '高亮冲突', exact: true }).uncheck()
  // Settings writes are asynchronous; reload after the last transaction commits.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sudoku-local', 1)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const settings = await new Promise<unknown>((resolve, reject) => {
          const request = database
            .transaction('settings')
            .objectStore('settings')
            .get('preferences')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        database.close()
        return settings
      }),
    )
    .toMatchObject({ showTimer: false, highlightConflicts: false })
  await page.reload()
  await expect(page.getByRole('switch', { name: '显示计时', exact: true })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: '高亮冲突', exact: true })).not.toBeChecked()
})

test('distinguishes the selected theme in light and dark appearances', async ({ page }) => {
  await page.goto('/#/')
  for (const name of ['浅色主题', '深色主题']) {
    const choice = page.getByRole('radio', { name, exact: true })
    await page
      .getByRole('radiogroup', { name: '界面主题', exact: true })
      .getByText(name === '浅色主题' ? '浅色' : '深色', { exact: true })
      .click()
    await expect
      .poll(() =>
        choice.evaluate((element) => {
          const button = element.closest('.n-radio-button')
          if (!button) throw new Error('Missing theme choice surface')
          const selected = getComputedStyle(button)
          const other = button.parentElement?.querySelector(
            '.n-radio-button:not(.n-radio-button--checked)',
          )
          if (!other) throw new Error('Missing alternate theme choice')
          return (
            button.classList.contains('n-radio-button--checked') &&
            selected.backgroundColor !== getComputedStyle(other).backgroundColor
          )
        }),
      )
      .toBe(true)
    await expect(choice).toBeChecked()
  }
})
