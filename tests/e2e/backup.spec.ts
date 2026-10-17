import type { Page } from '@playwright/test'
import { LESSONS } from '../support/lessons'
import { applySessionAction } from '../support/semantics'
import { readFile } from 'node:fs/promises'
import {
  test,
  expect,
  seedSession,
  readSessions,
  cellName,
  enterGameDigit,
  enterExerciseDigit,
} from './support'
import { makeSession } from '../support/gameFixtures'

import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import { lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'

async function openBackup(page: Page) {
  const dialog = page.getByRole('dialog', { name: '本地备份与恢复', exact: true })
  // A restore notice can precede the modal's exit animation; reopen only after it finishes.
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await expect(dialog).toBeVisible()
}

test('shows a pending file-read failure after the backup sheet is closed', async ({ page }) => {
  await page.addInitScript(() => {
    File.prototype.text = () =>
      new Promise<string>((_resolve, reject) => {
        window.addEventListener('reject-backup-read', () => reject(new Error('Read failed')), {
          once: true,
        })
      })
  })
  await page.goto('/#/records')
  await openBackup(page)
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({
    name: 'delayed.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  })
  await page.getByRole('button', { name: '关闭备份', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '本地备份与恢复', exact: true })).toBeHidden()

  await page.evaluate(() => window.dispatchEvent(new Event('reject-backup-read')))

  await expect(page.getByRole('alert').filter({ hasText: '备份文件读取失败' })).toBeVisible()
  await page.getByRole('button', { name: '查看并重试', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '本地备份与恢复', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '选择备份文件', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '关闭备份', exact: true }).click()
  await expect(page.getByRole('button', { name: '备份与恢复', exact: true })).toBeFocused()
})

test('rejects a pre-restore Worker result when reset broadcasting is unavailable', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BroadcastChannel', { configurable: true, value: undefined })
    const originalTimeout = window.setTimeout.bind(window)
    Object.defineProperty(window, 'setTimeout', {
      configurable: true,
      value(handler: TimerHandler, milliseconds?: number, ...arguments_: unknown[]) {
        // This fixture holds generation across a peer restore to test epoch fencing.
        // Normal three-second interruption is verified separately in generation-loading.spec.ts.
        const delay = milliseconds === 3000 ? 60000 : milliseconds
        return originalTimeout(handler, delay, ...arguments_)
      },
    })
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      postMessage(message: unknown) {
        if (
          typeof message === 'object' &&
          message !== null &&
          'kind' in message &&
          message.kind === 'generate'
        ) {
          window.addEventListener('deliver-backup-worker', () => super.postMessage(message), {
            once: true,
          })
        } else {
          super.postMessage(message)
        }
      }
    }
  })
  await page.goto('/#/play/free')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消出题', exact: true })).toBeVisible()
  const peer = await context.newPage()
  await peer.goto('/#/records')
  await openBackup(peer)
  await expect(peer.getByRole('button', { name: '选择备份文件', exact: true })).toBeEnabled()
  await peer.getByLabel('选择备份文件', { exact: true }).setInputFiles({
    name: 'restore.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText()),
  })
  await peer.getByRole('button', { name: '替换本机数据', exact: true }).click()
  await peer
    .getByRole('dialog', { name: '恢复备份并替换本机数据？', exact: true })
    .getByRole('button', { name: '确认恢复', exact: true })
    .click()
  await expect(peer.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible()

  await page.evaluate(() => window.dispatchEvent(new Event('deliver-backup-worker')))
  await expect(page.getByRole('alert').filter({ hasText: '本机数据已被替换' })).toBeVisible()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeHidden()
  expect((await readSessions(page)).map((record) => record.session.id)).toEqual([makeSession().id])
  await page
    .getByRole('radiogroup', { name: '界面主题' })
    .getByText('浅色', { exact: true })
    .click()
  await expect(page.getByRole('button', { name: '重新读取设置', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重新读取设置', exact: true }).click()
  await expect(page.getByRole('radio', { name: '深色主题', exact: true })).toBeChecked()
})

test('resets a mounted combined lesson to its restored cursor in a peer tab', async ({
  page,
  context,
}) => {
  await page.goto('/#/records')
  await openBackup(page)
  await expect(page.getByRole('button', { name: '选择备份文件', exact: true })).toBeEnabled()
  const cursorFile = JSON.parse(backupText())
  cursorFile.settings.lessonStages = { 'killer-combined': 2 }
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({
    name: 'cursor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(cursorFile)),
  })
  await page.getByRole('button', { name: '替换本机数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份并替换本机数据？', exact: true })
    .getByRole('button', { name: '确认恢复', exact: true })
    .click()
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible()
  const peer = await context.newPage()
  await peer.goto('/#/learn/killer-combined')
  await expect(peer.getByText(/练习阶段 3 \/ 6/)).toBeVisible()
  await expect(peer.getByText('正在准备或保存练习，请稍候…', { exact: true })).toBeHidden()

  await openBackup(page)
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({
    name: 'reset-cursor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText()),
  })
  await expect(page.getByRole('region', { name: '备份预览', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭备份', exact: true })).toBeInViewport({
    ratio: 1,
  })
  await page.getByRole('button', { name: '替换本机数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份并替换本机数据？', exact: true })
    .getByRole('button', { name: '确认恢复', exact: true })
    .click()
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible()
  await expect(peer.getByText(/练习阶段 1 \/ 6/)).toBeVisible()
  await expect(peer.getByRole('button', { name: '下一阶段', exact: true })).toBeHidden()
  const lesson = LESSONS.find((item) => item.id === 'killer-combined')
  if (!lesson) {
    throw new Error('Missing combined lesson')
  }
  const answer = stageAnswer(lessonStages(lesson)[0])
  if (answer.kind === 'placement') {
    await peer.getByRole('button', { name: cellName(answer.expected.cell) }).click()
    await enterExerciseDigit(peer, answer.expected.digit)
  } else {
    for (const { cell, digit } of answer.expected) {
      await peer.getByRole('button', { name: cellName(cell) }).click()
      await enterExerciseDigit(peer, digit, '排除')
    }
    await peer.getByRole('button', { name: '提交排除', exact: true }).click()
  }
  await expect(peer.getByRole('status')).toContainText('推理正确')
})

function backupText() {
  return JSON.stringify({
    backupVersion: 1,
    exportedAt: '2026-10-14T03:00:00.000Z',
    sessions: [{ formatVersion: 2, revision: 19, session: makeSession() }],
    results: [],
    lessons: [{ lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' }],
    settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
  })
}

test('downloads a committed backup and restores notes, history and learning progress after refresh', async ({
  page,
}) => {
  let session = makeSession({
    puzzle: { ...makeSession().puzzle, puzzleVersion: 'sudoku-v1' },
    elapsedMs: 98700,
  })
  session = applySessionAction(session, { kind: 'toggle-note', cell: 2, digit: 4 }).session
  session = applySessionAction(session, { kind: 'enter', cell: 3, digit: 6 }).session
  session = applySessionAction(session, { kind: 'undo' }).session
  await seedSession(page, session)
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('lessons', 'readwrite')
      transaction
        .objectStore('lessons')
        .put({ formatVersion: 1, lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' })
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  })
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.getByRole('link', { name: /数独足迹/ }).click()
  await openBackup(page)
  await expect(page.getByRole('button', { name: '选择备份文件', exact: true })).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份', exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) {
    throw new Error('Backup download is missing')
  }
  const text = await readFile(path, 'utf8')
  expect(JSON.parse(text)).toMatchObject({ backupVersion: 1, sessions: [{ session }] })
  expect(JSON.parse(text)).not.toHaveProperty('leases')
  expect(JSON.parse(text)).toMatchObject({ lessons: [{ lessonId: 'rules' }] })
  await page.getByRole('button', { name: '关闭备份', exact: true }).click()
  await page.getByRole('button', { name: '清空本机数据', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认清空', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '本机数据已清空' })).toBeVisible()
  await openBackup(page)
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({
    name: 'sudoku-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  const preview = page.getByRole('region', { name: '备份预览', exact: true })
  await expect(preview).toContainText('存档 1 个')
  await preview.getByRole('button', { name: '替换本机数据', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '恢复备份并替换本机数据？' })
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(preview.getByRole('button', { name: '替换本机数据', exact: true })).toBeFocused()
  expect(await readSessions(page)).toHaveLength(0)
  await preview.getByRole('button', { name: '替换本机数据', exact: true }).click()
  await dialog.getByRole('button', { name: '确认恢复', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible()
  expect((await readSessions(page))[0]).toMatchObject({ revision: 1, session })
  await page.reload()
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.getByRole('button', { name: '继续上次', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/已暂停/)
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/笔记4/)
  await page.goto('/#/learn')
  await expect(
    page.getByRole('list', { name: '课程路径' }).getByRole('link').first(),
  ).toContainText('已完成')
})

test('rejects incompatible and oversized files without losing current saves', async ({ page }) => {
  await seedSession(page, makeSession())
  await page.goto('/#/records')
  await openBackup(page)
  await expect(page.getByRole('button', { name: '选择备份文件', exact: true })).toBeEnabled()
  for (const buffer of [
    Buffer.from(backupText().replace('"backupVersion":1', '"backupVersion":2')),
    Buffer.from('{'),
    Buffer.alloc(25 * 1024 * 1024 + 1, ' '),
  ]) {
    await page
      .getByLabel('选择备份文件', { exact: true })
      .setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer })
    await expect(page.getByRole('alert').filter({ hasText: /备份文件/ })).toBeVisible()
    await expect(page.getByRole('region', { name: '备份预览', exact: true })).toBeHidden()
    expect(await readSessions(page)).toHaveLength(1)
  }
})

test('stops a hidden peer editor and preserves only the restored dataset', async ({
  page,
  context,
}) => {
  await page.goto('/#/records')
  await openBackup(page)
  await expect(page.getByRole('button', { name: '选择备份文件', exact: true })).toBeEnabled()
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({
    name: 'restore.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText()),
  })
  await expect(page.getByRole('region', { name: '备份预览', exact: true })).toBeVisible()
  const peer = await context.newPage()
  await seedSession(peer, makeSession({ id: 'peer-old' }))
  await peer.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await peer.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(peer, 4)
  await peer.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(peer.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/已暂停/)
  await page.getByRole('button', { name: '替换本机数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份并替换本机数据？', exact: true })
    .getByRole('button', { name: '确认恢复', exact: true })
    .click()
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible()
  await expect(peer.getByRole('group', { name: '数独棋盘' })).toBeHidden()
  await expect(peer.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(async () => (await readSessions(peer)).map((record) => record.session.id))
    .toEqual([makeSession().id])
  await peer.reload()
  expect((await readSessions(peer))[0].session.entries[2]).toBe(0)
})

test('retains current data on restore transaction failure and supports retry', async ({ page }) => {
  await seedSession(page, makeSession({ id: 'keep-on-failure' }))
  await page.goto('/#/records')
  await openBackup(page)
  await expect(page.getByRole('button', { name: '选择备份文件', exact: true })).toBeEnabled()
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({
    name: 'restore.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText()),
  })
  await expect(page.getByRole('region', { name: '备份预览', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = original.apply(this, args)
      if (
        args[1] === 'readwrite' &&
        transaction.objectStoreNames.contains('sessions') &&
        transaction.objectStoreNames.contains('lessons')
      ) {
        queueMicrotask(() => transaction.abort())
      }
      return transaction
    }
    window.addEventListener(
      'restore-backup-storage',
      () => {
        IDBDatabase.prototype.transaction = original
      },
      { once: true },
    )
  })
  await page.getByRole('button', { name: '替换本机数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份并替换本机数据？', exact: true })
    .getByRole('button', { name: '确认恢复', exact: true })
    .click()
  await expect(page.getByRole('alert').filter({ hasText: '恢复失败' })).toBeVisible()
  expect((await readSessions(page))[0].session.id).toBe('keep-on-failure')
  await page.evaluate(() => window.dispatchEvent(new Event('restore-backup-storage')))
  await page.getByRole('button', { name: '替换本机数据', exact: true }).click()
  await page
    .getByRole('dialog', { name: '恢复备份并替换本机数据？', exact: true })
    .getByRole('button', { name: '确认恢复', exact: true })
    .click()
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible()
  expect((await readSessions(page))[0].session.id).toBe(makeSession().id)
})
