import {
  test,
  expect,
  seedSession,
  cellName,
  enterGameDigit,
  readSessions,
  openGameSettings,
} from './support'
import { makeSession } from '../support/gameFixtures'

for (const action of ['toolbar', 'browser-back', 'lesson-return'] as const) {
  test(`keeps failed writes on the game page when leaving through ${action}`, async ({ page }) => {
    const lessonPractice = action === 'lesson-return'
    const session = lessonPractice
      ? makeSession({ mode: 'learning', metadata: { kind: 'learning', lessonId: 'rules' } })
      : makeSession()
    await seedSession(page, session, lessonPractice ? '/learn/rules?practice=1' : '/play/free')
    if (action === 'browser-back') {
      // Establish an in-app history entry; direct test navigation may replace the initial entry.
      await page.getByRole('link', { name: '返回首页', exact: true }).click()
      await page.getByRole('button', { name: '继续上次', exact: true }).click()
    }
    const gameUrl = page.url()
    const parentLabel = lessonPractice ? '返回本节课程' : '返回首页'
    await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = original.apply(this, args)
        if (
          args[1] === 'readwrite' &&
          transaction.objectStoreNames.contains('sessions') &&
          transaction.objectStoreNames.contains('results')
        ) {
          queueMicrotask(() => transaction.abort())
        }
        return transaction
      }
      window.addEventListener(
        'restore-departure-storage',
        () => {
          IDBDatabase.prototype.transaction = original
        },
        { once: true },
      )
    })
    await page.getByRole('button', { name: cellName(2) }).click()
    await enterGameDigit(page, 4)
    await expect(page.getByRole('alert').filter({ hasText: '保存失败' }).first()).toBeVisible()

    if (action === 'browser-back') {
      await page.goBack()
    } else {
      await page.getByRole('link', { name: parentLabel, exact: true }).click()
    }

    await expect(page.getByRole('button', { name: '重试保存', exact: true })).toBeVisible()
    await expect(page).toHaveURL(gameUrl)
    await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
    expect((await readSessions(page))[0]?.session.entries[2]).toBe(0)

    await page.evaluate(() => window.dispatchEvent(new Event('restore-departure-storage')))
    await page.getByRole('button', { name: '重试保存', exact: true }).click()
    await expect.poll(async () => (await readSessions(page))[0]?.session.entries[2]).toBe(4)
    await page.getByRole('link', { name: parentLabel, exact: true }).click()
    await expect(page).toHaveURL(lessonPractice ? /#\/learn\/rules$/ : /\/#\/$/)
    if (lessonPractice) {
      await page.goto('/#/')
    }
    await page.getByRole('button', { name: '继续上次', exact: true }).click()
    await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
    await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/数字4/)
  })
}

test('holds board geometry and blocks input while the outgoing save is delayed', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.getByRole('button', { name: '继续上次', exact: true }).click()
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(page, 4)
  await expect.poll(async () => (await readSessions(page))[0]?.session.entries[2]).toBe(4)
  const board = page.getByRole('group', { name: '数独棋盘', includeHidden: true })
  const settings = await openGameSettings(page)
  await expect(settings).toBeVisible()
  // Browser history can restore scroll before the async guard; compare document geometry.
  const boardGeometry = () =>
    board.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        x: bounds.x + window.scrollX,
        y: bounds.y + window.scrollY,
        width: bounds.width,
        height: bounds.height,
      }
    })
  const before = await boardGeometry()
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    // Hold the real store lock without replacing the app's queue or save contract.
    const transaction = database.transaction('sessions', 'readwrite')
    let holding = true
    window.addEventListener(
      'release-departure-save',
      () => {
        holding = false
      },
      { once: true },
    )
    const keepAlive = () => {
      const request = transaction.objectStore('sessions').get('departure-lock')
      request.onsuccess = () => {
        if (holding) keepAlive()
      }
    }
    transaction.oncomplete = () => database.close()
    keepAlive()
  })

  try {
    await page.goBack()
    await expect(page.locator('.game-page')).toHaveAttribute('inert', '')
    await expect(settings).not.toBeVisible()
    await expect(board).toBeVisible()
    await expect(page.getByText('稍作停留', { exact: true })).toHaveCount(0)
    expect(await boardGeometry()).toEqual(before)
    await page.keyboard.press('5')
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event('release-departure-save')))
  }

  await expect(page).toHaveURL(/\/#\/$/)
  expect((await readSessions(page))[0]?.session.entries[2]).toBe(4)
})
