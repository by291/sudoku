import {
  test,
  expect,
  seedSession,
  cellName,
  readSessions,
  countResults,
  enterGameDigit,
  selectGameMenuAction,
  openGameSettings,
  closeGameSettings,
} from './support'
import { makeSession } from '../support/gameFixtures'

for (const [value, name] of [
  ['easy', '简单'],
  ['medium', '中等'],
  ['hard', '困难'],
  ['expert', '专家'],
] as const) {
  test(`generates a real ${value} puzzle and accepts touch controls`, async ({
    page,
    isMobile,
  }) => {
    await page.goto('/#/play/free')
    await page.getByRole('button', { name: '开始游戏', exact: true }).click()
    await page
      .getByRole('radiogroup', { name: '难度', exact: true })
      .getByText(name, { exact: true })
      .click()
    await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
    const board = page.getByRole('group', { name: '数独棋盘' })
    await expect(board.getByRole('button')).toHaveCount(81)
    const empty = board.getByRole('button', { name: /空格/ }).first()
    if (isMobile) {
      await empty.tap()
    } else {
      await empty.click()
    }

    await enterGameDigit(page, 1)
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()

    expect((await readSessions(page))[0].session.puzzle.difficulty).toBe(value)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const size = await board.boundingBox()

    expect(size && Math.abs(size.width - size.height)).toBeLessThan(2)
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(board.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
    await expect(page.getByRole('button', { name: '擦除', exact: true })).toBeDisabled()
    await expect(page.getByText(`${name} 独立思考`, { exact: true })).toBeVisible()
  })
}
test('unifies notes, keyboard history, hints, confirmation and refresh restoration', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const cell = page.getByRole('button', { name: cellName(2) })
  await cell.click()
  await page.keyboard.press('n')
  await page.keyboard.press('4')
  await expect(cell).toHaveAccessibleName(/笔记4/)
  await page.keyboard.press('Control+z')
  await expect(cell).not.toHaveAccessibleName(/笔记4/)
  await page.keyboard.press('Control+Shift+z')
  await expect(cell).toHaveAccessibleName(/笔记4/)
  await page.keyboard.press('n')
  await page.keyboard.press('4')
  await expect(cell).toHaveAccessibleName(/数字4/)
  await page.getByRole('button', { name: '逻辑提示', exact: true }).click()
  const hint = page.getByRole('region', { name: '逻辑提示说明' })
  await expect(hint).toBeVisible()
  await hint.getByRole('button', { name: '应用提示', exact: true }).click()
  await expect(hint).not.toBeVisible()
  await selectGameMenuAction(page, '重新开始本题')
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(cell).toHaveAccessibleName(/数字4/)
  await selectGameMenuAction(page, '新开一局')
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await openGameSettings(page)
  await page.getByRole('switch', { name: '显示计时', exact: true }).uncheck()
  await closeGameSettings(page)
  await page
    .getByRole('radiogroup', { name: '界面主题', exact: true })
    .getByText('深色', { exact: true })
    .click()
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
  await openGameSettings(page)
  await expect(page.getByRole('switch', { name: '显示计时', exact: true })).not.toBeChecked()
  await closeGameSettings(page)
  await expect(page.getByRole('radio', { name: '深色主题' })).toBeChecked()
  await expect(async () => {
    await page
      .getByRole('button', { name: /^(继续游戏|尝试接管)$/ })
      .first()
      .click()
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  }).toPass({ timeout: 15000 })
  await expect(cell).toHaveAccessibleName(/数字4/)
})
test('completes once and displays the saved result', async ({ page }) => {
  const session = makeSession()
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] === 0 && cell !== 2 ? digit : 0,
  )
  await seedSession(page, session)
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(page, 4)
  await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()

  expect(await countResults(page)).toBe(1)
  await page.getByRole('link', { name: '查看个人记录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '完成记录' })).toBeVisible()
  await expect(page.getByText('无辅助完成', { exact: true })).toBeVisible()
})
test('preserves edge selections when global arrows are used outside the board', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const notes = page.getByRole('button', { name: /^笔记/ })
  const top = page.getByRole('button', { name: cellName(4) })
  await top.click()
  await notes.click()
  await page.keyboard.press('ArrowUp')
  await expect(top).toHaveAttribute('aria-pressed', 'true')
  await expect(notes).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: cellName(13) })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const bottom = page.getByRole('button', { name: cellName(76) })
  await bottom.click()
  await notes.click()
  await page.keyboard.press('ArrowDown')
  await expect(bottom).toHaveAttribute('aria-pressed', 'true')
  await expect(notes).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('button', { name: cellName(67) })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
test('pauses on hiding and never resumes just because the page becomes visible', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-11T01:00:00Z') })
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.clock.runFor(5000)
  await expect(page.getByLabel('游戏用时')).toHaveText('00:05')
  await openGameSettings(page)
  await page.getByRole('switch', { name: '显示计时', exact: true }).uncheck()
  await closeGameSettings(page)
  await page.clock.runFor(2000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
  // The paused board renders before its asynchronous save finishes.
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  const pausedDuration = (await readSessions(page))[0].session.elapsedMs
  // The installed clock also advances while the settings menu and dialog are used.
  const pausedSeconds = Math.floor(pausedDuration / 1000)
  const pausedTime = `${String(Math.floor(pausedSeconds / 60)).padStart(2, '0')}:${String(pausedSeconds % 60).padStart(2, '0')}`
  await page.clock.runFor(3000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
  await openGameSettings(page)
  await page.getByRole('switch', { name: '显示计时', exact: true }).check()
  await closeGameSettings(page)
  await expect(page.getByLabel('游戏用时')).toHaveText(pausedTime)
  await expect
    .poll(async () => (await readSessions(page))[0].session.elapsedMs)
    .toBe(pausedDuration)

  expect(pausedDuration).toBeGreaterThanOrEqual(7000)
})
test('cancels a delayed generation without replacing the old save', async ({ page }) => {
  await seedSession(page, makeSession())
  await page.evaluate(() => {
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      override postMessage() {
        /* Deliberately leave the job awaiting input in this isolated test. */
      }
    }
  })
  await selectGameMenuAction(page, '新开一局')
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('button', { name: '取消出题', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '已取消出题' })).toBeVisible()

  expect((await readSessions(page))[0].session.id).toBe('fixture-free-session')
})
