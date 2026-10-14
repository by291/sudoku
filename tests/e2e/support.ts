import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { GameSession } from '@/features/game/model/session'
import { parseSessionRecord } from '@/storage/records'
import { makeSession } from '../support/gameFixtures'
import { VARIANT_FIXTURES } from '../fixtures/variants'
import { VARIANT_EXAMPLES } from '@/features/learning/model/variantExamples'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import { VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation'
import type { NewSudokuVariant } from '@/core/sudoku/rules'

export { expect }

export async function useNextGenerationSeed(page: Page, seed: string) {
  await page.evaluate((seed) => {
    const original = crypto.randomUUID.bind(crypto)
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value() {
        // Fix only the next UI seed; later request and session identities remain independent.
        Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: original })
        return seed
      },
    })
  }, seed)
}

export async function enterGameDigit(page: Page, digit: number) {
  const touchDigit = page.getByRole('button', { name: `输入数字${digit}`, exact: true })
  if (await touchDigit.isVisible()) {
    await touchDigit.click()
  } else {
    await page.keyboard.press(String(digit))
  }
}

export async function enterExerciseDigit(page: Page, digit: number, action = '填写') {
  await expect(page.getByText('正在准备或保存练习，请稍候…', { exact: true })).toBeHidden()
  const touchDigit = page.getByRole('button', { name: `${action}数字${digit}`, exact: true })
  if (await touchDigit.isVisible()) {
    await touchDigit.click()
  } else {
    await page.keyboard.press(String(digit))
  }
}

export async function selectGameMenuAction(
  page: Page,
  action: '检查填写' | '生成候选数' | '新开一局' | '重新开始本题' | '选择其他挑战' | '对局设置',
) {
  await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}

export async function openGameSettings(page: Page) {
  await selectGameMenuAction(page, '对局设置')

  return page.getByRole('dialog', { name: '对局设置', exact: true })
}

export async function closeGameSettings(page: Page) {
  const dialog = page.getByRole('dialog', { name: '对局设置', exact: true })
  await dialog.getByRole('button', { name: '关闭设置', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

export function makeVariantHintSession(variant: NewSudokuVariant): GameSession {
  const example = VARIANT_EXAMPLES[variant]
  const solution =
    variant === 'thermo' || variant === 'arrow'
      ? VARIANT_FIXTURES[variant].solution
      : VARIANT_TEMPLATES[variant].easy[0].solution

  return makeSession({
    id: `${variant}-hint-fixture`,
    puzzle: {
      givens: example.board,
      solution,
      rules: example.rules,
      difficulty: 'easy',
      seed: `${variant}-known-rule-facts`,
      puzzleVersion: VARIANT_PUZZLE_VERSION,
    },
  })
}

export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [
    async ({ context }, use) => {
      const errors: string[] = []
      const observe = (page: Page) => {
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (message.type() === 'error') {
            errors.push(message.text())
          }
        })
      }
      context.on('page', observe)

      for (const page of context.pages()) {
        observe(page)
      }

      await use()

      expect(errors, 'Browser console and application errors').toEqual([])
    },
    { auto: true },
  ],
})

export function cellName(cell: number): RegExp {
  return new RegExp(`^第${Math.floor(cell / 9) + 1}行第${(cell % 9) + 1}列，`)
}

export async function seedSession(page: Page, session: GameSession, route = '/play/free') {
  await page.goto('/#/')
  await expect(page.getByRole('button', { name: /开始一局数独/ })).toBeVisible()
  await page.evaluate(async (session) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite')
      transaction.objectStore('sessions').put({ formatVersion: 2, revision: 1, session })
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  }, session)
  await page.goto(
    `/#${route}${route.includes('?') ? '&' : '?'}session=${encodeURIComponent(session.id)}`,
  )
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
}

export async function readSessions(page: Page) {
  const raw = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const value = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('sessions').objectStore('sessions').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()

    return value
  })

  return raw.map((value) => {
    const record = parseSessionRecord(value)
    if (!record.valid) {
      throw new Error(record.issues.join('; '))
    }

    return record.value
  })
}

export async function countResults(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const count = await new Promise<number>((resolve, reject) => {
      const request = database.transaction('results').objectStore('results').count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()

    return count
  })
}
