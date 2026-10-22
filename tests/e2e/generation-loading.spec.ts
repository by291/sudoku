import { test, expect, seedSession, selectGameMenuAction, readSessions } from './support'
import { makeSession } from '../support/gameFixtures'

async function holdGeneration(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    Worker.prototype.postMessage = () => {
      // Hold prepared and newly constructed workers in this isolated browser context.
    }
  })
}

test('shows one accessible loading notice and cancels without replacing the paused save', async ({
  page,
}, testInfo) => {
  await seedSession(page, makeSession())
  await holdGeneration(page)
  await selectGameMenuAction(page, '新开一局')
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
  const status = page.getByRole('status').filter({ hasText: '正在生成题目…' })

  await expect(status).toHaveCount(1)
  await expect(status).toBeVisible()
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page
    .locator('.generation-status')
    .screenshot({ path: `test-results/visual/generation-loading-${testInfo.project.name}.png` })
  await page.getByRole('button', { name: '取消出题', exact: true }).click()

  await expect(status).toBeHidden()
  await expect(page.getByRole('alert').filter({ hasText: '已取消出题' })).toBeVisible()
  expect((await readSessions(page))[0]?.session.id).toBe('fixture-free-session')
})

test('shows generation loading when starting the first daily challenge', async ({ page }) => {
  await page.goto('/#/play/daily')
  await holdGeneration(page)
  await page.getByRole('button', { name: '选择今日挑战', exact: true }).click()
  const start = page.getByRole('dialog').getByRole('button', { name: '开始今日挑战', exact: true })
  await expect(start).toBeEnabled()
  await start.click()

  await expect(page.getByRole('status').filter({ hasText: '正在生成题目…' })).toBeVisible()
  await page.getByRole('button', { name: '取消出题', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '正在生成题目…' })).toBeHidden()
})

test('times out a stalled request and offers retry while retaining the current save', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await holdGeneration(page)
  await selectGameMenuAction(page, '新开一局')
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()

  await expect(page.getByRole('status').filter({ hasText: '正在生成题目…' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: '出题超时，请重试。' })).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByRole('button', { name: '重试出题', exact: true })).toBeVisible()
  expect((await readSessions(page))[0]?.session.id).toBe('fixture-free-session')
})

test('reports exhausted generation without replacing a save or offering an identical retry', async ({
  page,
}) => {
  const original = makeSession()
  await seedSession(page, original)
  await selectGameMenuAction(page, '新开一局')
  const variantChoices = page.getByRole('radiogroup', { name: '玩法', exact: true })
  await variantChoices.getByText('标准数独', { exact: true }).click()
  await expect(variantChoices.getByRole('radio', { name: '标准数独', exact: true })).toBeChecked()
  await page
    .getByRole('radiogroup', { name: '难度', exact: true })
    .getByText('困难', { exact: true })
    .click()
  // The former failing seed is now a recovery test; inject the valid transport outcome here.
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (this: Worker, message: unknown) {
      if (
        typeof message === 'object' &&
        message !== null &&
        'kind' in message &&
        message.kind === 'initialize'
      ) {
        Reflect.apply(original, this, [message])
        return
      }
      if (
        typeof message !== 'object' ||
        message === null ||
        !('kind' in message) ||
        message.kind !== 'generate' ||
        !('requestId' in message)
      ) {
        throw new Error('Expected an isolated generation request')
      }
      queueMicrotask(() =>
        this.dispatchEvent(
          new MessageEvent('message', {
            data: {
              kind: 'generate',
              requestId: message.requestId,
              outcome: {
                status: 'incomplete',
                message: 'No qualifying puzzle found within the generation limits',
              },
            },
          }),
        ),
      )
    }
  })
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()

  await expect(
    page.getByRole('alert').filter({ hasText: '未能生成符合要求的题目，请重新选择。' }),
  ).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '正在生成题目…' })).toBeHidden()
  await expect(page.getByRole('button', { name: '重试出题', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
  const saved = await readSessions(page)

  expect(saved).toHaveLength(1)
  expect(saved[0]?.session.id).toBe(original.id)
  expect(saved[0]?.session.puzzle).toEqual(original.puzzle)
  await selectGameMenuAction(page, '新开一局')
  await expect(page.getByRole('dialog')).toBeVisible()
})
