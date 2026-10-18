import { test, expect, seedSession, cellName, readSessions } from './support'
import { makeSession } from '../support/gameFixtures'

test('uses physical keyboard input on desktop without showing a number pad', async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, 'Desktop input layout')
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await expect(page.getByRole('group', { name: '数字输入' })).not.toBeVisible()
  await expect(page.getByRole('group', { name: '快速笔记' })).not.toBeVisible()
  const cell = page.getByRole('button', { name: cellName(2) })
  await cell.click()
  await page.keyboard.press('4')
  await expect(cell).toHaveAccessibleName(/数字4/)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(cell).toHaveAccessibleName(/空格/)
  await expect(page.getByRole('button', { name: '更多操作', exact: true })).toBeInViewport()
  await page.screenshot({
    path: `test-results/visual/compact-play/desktop-${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
})

test('keeps tools, digits and independent quick notes in aligned phone rows', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const tools = page.getByRole('group', { name: '棋盘工具', exact: true }).getByRole('button')
  const digits = page.getByRole('group', { name: '数字输入', exact: true }).getByRole('button')
  const notes = page.getByRole('group', { name: '快速笔记', exact: true }).getByRole('button')
  await expect(tools).toHaveCount(6)
  await expect(digits).toHaveCount(9)
  await expect(notes).toHaveCount(9)

  for (const row of [tools, digits, notes]) {
    const boxes = await row.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()

        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          height: box.height,
        }
      }),
    )

    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1)

    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(360)
      expect(box.bottom).toBeLessThanOrEqual(800)
    }
  }

  await page.getByRole('button', { name: cellName(2) }).click()
  await page.getByRole('button', { name: '输入数字4', exact: true }).click()
  await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/数字4/)
  await page.getByRole('button', { name: cellName(3) }).click()
  const quickNote = page.getByRole('button', { name: '快捷笔记数字5', exact: true })
  await quickNote.click()
  await expect(quickNote).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '笔记', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByRole('button', { name: cellName(3) })).toHaveAccessibleName(/笔记5/)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(quickNote).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(quickNote).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({
    path: `test-results/visual/compact-play/phone-${testInfo.project.name}.png`,
    animations: 'disabled',
  })
})

test('keeps settings and secondary actions in More without leaking keyboard input', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const cell = page.getByRole('button', { name: cellName(2) })
  const boardBeforeSettings = await page
    .getByRole('group', { name: '数独棋盘', exact: true })
    .boundingBox()
  await cell.click()
  const more = page.getByRole('button', { name: '更多操作', exact: true })
  await more.focus()
  await more.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: '检查填写', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: '生成候选数', exact: true })).toBeFocused()
  await page.keyboard.press('4')
  await expect(cell).toHaveAccessibleName(/空格/)
  await page.keyboard.press('Home')
  await expect(page.getByRole('menuitem', { name: '检查填写', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: '对局设置', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  const settings = page.getByRole('dialog', { name: '对局设置', exact: true })
  await expect(settings).toBeVisible()
  await settings.getByRole('switch', { name: '显示计时', exact: true }).uncheck()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  await expect(page.getByLabel('游戏用时', { exact: true })).toBeHidden()
  expect(await page.getByRole('group', { name: '数独棋盘', exact: true }).boundingBox()).toEqual(
    boardBeforeSettings,
  )
  await more.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: '重新开始本题', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  await more.click()
  await page.getByRole('menuitem', { name: '对局设置', exact: true }).click()
  await expect(settings.getByRole('switch', { name: '显示计时', exact: true })).not.toBeChecked()
  await page.keyboard.press('Escape')
  await more.click()
  await page.getByRole('menuitem', { name: '新开一局', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()

  expect((await readSessions(page))[0].session.id).toBe('fixture-free-session')
})

test('shows only the daily session context while playing and keeps rules in settings', async ({
  page,
}) => {
  await seedSession(
    page,
    makeSession({
      id: 'daily:2026-10-11:formal',
      mode: 'daily',
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    }),
    '/play/daily',
  )
  await expect(page.getByText('2026-10-11 · 正式挑战', { exact: true })).toBeVisible()
  await expect(page.getByText(/每天北京时间零点更新/)).not.toBeVisible()
  await expect(page.getByRole('button', { name: '选择其他挑战', exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '对局设置', exact: true }).click()
  await expect(page.getByText(/每天北京时间零点更新/)).toBeVisible()
})

test('keeps a usable board and digit row on a landscape touch screen', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await seedSession(page, makeSession())
  const board = page.getByRole('group', { name: '数独棋盘', exact: true })
  const box = await board.boundingBox()

  expect(box?.width).toBeGreaterThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844)
  if (isMobile) {
    await expect(page.getByRole('group', { name: '数字输入' }).getByRole('button')).toHaveCount(9)
  }
})

test('offers other daily challenges while the current save belongs to another editor', async ({
  page,
  context,
}) => {
  await seedSession(
    page,
    makeSession({
      id: 'daily:2026-10-11:formal',
      mode: 'daily',
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    }),
    '/play/daily',
  )
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const peer = await context.newPage()
  await peer.goto(page.url())
  await expect(peer.getByText(/本局正在其他标签页编辑/)).toBeVisible()
  await peer.getByRole('button', { name: '更多操作', exact: true }).click()
  const choose = peer.getByRole('menuitem', { name: '选择其他挑战', exact: true })
  await expect(choose).toHaveAttribute('aria-disabled', 'false')
  await choose.click()
  await expect(peer.getByRole('dialog', { name: '选择每日挑战', exact: true })).toBeVisible()
  await peer.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()

  expect((await readSessions(page))[0].session.id).toBe('daily:2026-10-11:formal')
})
