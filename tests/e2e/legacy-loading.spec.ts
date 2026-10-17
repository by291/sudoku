import { test, expect } from './support'
import { makeSession } from '../support/gameFixtures'

test('keeps legacy save presence unknown until explicit validation completes', async ({ page }) => {
  const session = makeSession({ id: 'legacy-classic-save', elapsedMs: 42000 })
  const legacy = {
    formatVersion: 1,
    revision: 1,
    session: {
      ...session,
      puzzle: {
        givens: session.puzzle.givens,
        solution: session.puzzle.solution,
        difficulty: session.puzzle.difficulty,
        seed: session.puzzle.seed,
        puzzleVersion: session.puzzle.puzzleVersion,
      },
    },
  }
  await page.route('**/legacy-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Legacy fixture</title>',
    }),
  )
  await page.goto('/legacy-fixture')
  await page.evaluate(async (record) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onupgradeneeded = () => {
        const database = request.result
        const sessions = database.createObjectStore('sessions', { keyPath: 'session.id' })
        sessions.createIndex('by-mode', 'session.mode')
        sessions.createIndex('by-date', 'session.metadata.challengeDate')
        sessions.createIndex('by-lesson', 'session.metadata.lessonId')
        database.createObjectStore('results', { keyPath: 'session.id' })
        database.createObjectStore('lessons', { keyPath: 'lessonId' })
        for (const store of ['settings', 'quarantine', 'leases', 'meta']) {
          database.createObjectStore(store)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['sessions', 'meta'], 'readwrite')
      transaction.objectStore('meta').put(1, 'epoch')
      transaction.objectStore('sessions').put(record)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  }, legacy)
  let downloads = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.wasm')) {
      downloads++
    }
  })

  await page.goto('/#/')
  await expect(page.getByRole('alert').filter({ hasText: '旧存档需要整理' })).toBeVisible()
  await page.getByRole('button', { name: /开始一局数独/ }).click()
  const dialog = page.getByRole('dialog', { name: '开始一局数独', exact: true })
  await expect(dialog.getByRole('button', { name: '开始游戏', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '继续存档', exact: true })).toHaveCount(0)
  expect(downloads).toBe(0)

  await dialog.getByRole('button', { name: '重试读取', exact: true }).click()

  await expect(dialog.getByText(/有未完成的存档/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: '继续存档', exact: true })).toBeEnabled()
  expect(downloads).toBe(1)
  await dialog.getByRole('button', { name: '继续存档', exact: true }).click()
  await expect(page).toHaveURL(/session=legacy-classic-save/)
  await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeVisible()
})
