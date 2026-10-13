import {
  test,
  expect,
  seedSession,
  cellName,
  readSessions,
  countResults,
  enterGameDigit,
} from './support'
import { makeSession } from '../support/gameFixtures'

test('confirms explicit reload after a save conflict and resumes the latest record', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const current = (await readSessions(page))[0]
  const latest = {
    ...current,
    revision: current.revision + 1,
    session: {
      ...current.session,
      entries: current.session.entries.map((digit, cell) => (cell === 3 ? 6 : digit)),
    },
  }
  await page.evaluate(async (record) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite')
      transaction.objectStore('sessions').put(record)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  }, latest)
  await page.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(page, 4)
  await expect(page.getByRole('alert').filter({ hasText: '请重新载入' })).toBeVisible()
  await page.getByRole('button', { name: '重新载入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '重新载入最新存档？' })
  await expect(dialog).toContainText('未保存的填写和笔记会丢失')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: '擦除', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重新载入', exact: true }).click()
  await dialog.getByRole('button', { name: '确认重新载入', exact: true }).click()
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/空格/)
  await expect(page.getByRole('button', { name: cellName(3) })).toHaveAccessibleName(/数字6/)
  await page.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(page, 4)
  await expect.poll(async () => (await readSessions(page))[0].session.entries[2]).toBe(4)

  expect((await readSessions(page))[0].session.entries[3]).toBe(6)
})
test('keeps a second editor read-only, permits takeover, and resets every tab', async ({
  page,
  context,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const peer = await context.newPage()
  await peer.goto(page.url())
  await expect(peer.getByText(/本局正在其他标签页编辑/)).toBeVisible()
  await expect(peer.getByRole('button', { name: '擦除', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await peer.getByRole('button', { name: '尝试接管', exact: true }).first().click()
  await expect(peer.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await peer.getByRole('button', { name: cellName(2) }).click()
  await expect(peer.getByRole('button', { name: '擦除', exact: true })).toBeEnabled()
  await enterGameDigit(peer, 4)
  await expect.poll(async () => (await readSessions(peer))[0].session.entries[2]).toBe(4)
  await page.getByRole('link', { name: /数独足迹/ }).click()
  await page.getByRole('button', { name: '清空本机数据', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()

  expect(await readSessions(page)).toHaveLength(1)
  await page.getByRole('button', { name: '清空本机数据', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认清空', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '本机数据已清空' })).toBeVisible()
  await expect(peer.getByRole('group', { name: '数独棋盘' })).not.toBeVisible()

  expect(await readSessions(peer)).toHaveLength(0)
  expect(await countResults(peer)).toBe(0)
})
test('shows failed completion save and retries exactly once without a public debug endpoint', async ({
  page,
}) => {
  const session = makeSession()
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] === 0 && cell !== 2 ? digit : 0,
  )
  await seedSession(page, session)
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  // This browser-only fault affects session writes, leaving leases, reads and other stores intact.
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
    const restore = () => {
      IDBDatabase.prototype.transaction = original
      window.removeEventListener('restore-test-storage', restore)
    }
    window.addEventListener('restore-test-storage', restore)
  })
  await page.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(page, 4)
  await expect(page.getByRole('alert').filter({ hasText: '保存失败' })).toBeVisible()
  await expect(page.getByText('本局已完成，成绩仍待保存。', { exact: true })).toBeVisible()

  expect(await countResults(page)).toBe(0)
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
  await page.getByRole('button', { name: '重试保存', exact: true }).click()
  await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()

  expect(await countResults(page)).toBe(1)
  await page.reload()
  await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()

  expect(await countResults(page)).toBe(1)
})
test('allows memory-only play when IndexedDB cannot open and saves after recovery', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open
    IDBFactory.prototype.open = function () {
      throw new DOMException('Injected storage failure', 'InvalidStateError')
    }
    const restore = () => {
      IDBFactory.prototype.open = original
      window.removeEventListener('restore-test-storage', restore)
    }
    window.addEventListener('restore-test-storage', restore)
  })
  await page.goto('/#/play/free')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: '仅在内存中' })
      .or(page.getByRole('alert').filter({ hasText: '暂存在内存中' }))
      .first(),
  ).toBeVisible()
  await page.getByRole('button', { name: /空格/ }).first().click()
  await enterGameDigit(page, 1)
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
  await page.getByRole('button', { name: '重试保存', exact: true }).click()
  await expect.poll(async () => (await readSessions(page)).length).toBe(1)
})
