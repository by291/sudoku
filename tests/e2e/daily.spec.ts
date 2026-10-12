import { test, expect, seedSession, readSessions, countResults, cellName } from './support'
import { makeSession } from '../support/gameFixtures'
test('starts a real daily challenge and preserves time and assistance on restart', async ({
  page,
}) => {
  await page.goto('/#/play/daily')
  await page.getByRole('button', { name: '选择今日挑战', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '开始今日挑战', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await page.getByRole('button', { name: '生成候选数', exact: true }).click()
  await expect
    .poll(async () => (await readSessions(page))[0].session.assistance.candidateCount)
    .toBe(1)
  const before = (await readSessions(page))[0].session
  await page.getByRole('button', { name: '重新开始本题', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('保留累计用时')
  await page.getByRole('dialog').getByRole('button', { name: '确认开始', exact: true }).click()
  await expect
    .poll(async () => (await readSessions(page))[0].session.notes.every((mask) => mask === 0))
    .toBe(true)
  const after = (await readSessions(page))[0].session
  expect(after.id).toBe(before.id)
  expect(after.assistance).toEqual(before.assistance)
  expect(after.elapsedMs).toBeGreaterThanOrEqual(before.elapsedMs)
})
test('saves one formal result and starts replay with a new identity', async ({ page }) => {
  const session = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] === 0 && cell !== 2 ? digit : 0,
  )
  // Fix the browser date before bootstrap so this is today's challenge in every locale.
  await page.clock.setFixedTime(new Date('2026-10-11T01:00:00Z'))
  await seedSession(page, session, '/play/daily')
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(2) }).click()
  await page.getByRole('button', { name: '输入数字4', exact: true }).click()
  await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '选择其他挑战', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '再次练习', exact: true }).click()
  await expect.poll(async () => (await readSessions(page)).length).toBe(2)
  const records = await readSessions(page)
  expect(
    records.filter(
      ({ session }) => session.metadata.kind === 'daily' && session.metadata.formalAttempt,
    ),
  ).toHaveLength(1)
  expect(
    records.filter(
      ({ session }) => session.metadata.kind === 'daily' && !session.metadata.formalAttempt,
    ),
  ).toHaveLength(1)
  expect(await countResults(page)).toBe(1)
})
