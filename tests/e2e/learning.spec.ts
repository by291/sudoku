import { test, expect, cellName, readSessions } from './support'
import { LESSONS } from '@/features/learning/model/lessons'
test('completes the rules exercise using only keyboard navigation', async ({ page }) => {
  await page.goto('/#/learn/rules')
  const first = page.getByRole('button', { name: cellName(0) })
  for (
    let tabs = 0;
    tabs < 20 && !(await first.evaluate((element) => element === document.activeElement));
    tabs++
  ) {
    await page.keyboard.press('Tab')
  }
  await expect(first).toBeFocused()
  for (let row = 0; row < 4; row++) await page.keyboard.press('ArrowDown')
  for (let column = 0; column < 4; column++) await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: cellName(40) })).toBeFocused()
  for (let digit = 1; digit <= 5; digit++) await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '填写数字5', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText('推理正确')
})
test('teaches all six exercises with retry and durable progress', async ({ page }) => {
  for (const lesson of LESSONS) {
    await page.goto(`/#/learn/${lesson.id}`)
    await expect(page.getByRole('heading', { name: lesson.title, exact: true })).toBeVisible()
    if (lesson.exercise.kind === 'placement') {
      const { cell, digit } = lesson.exercise.expected
      await page.getByRole('button', { name: cellName(cell) }).click()
      await page
        .getByRole('button', { name: `填写数字${digit === 9 ? 8 : 9}`, exact: true })
        .click()
      await expect(page.getByRole('status')).toContainText('还差一点')
      await page.getByRole('button', { name: `填写数字${digit}`, exact: true }).click()
    } else {
      for (const { cell, digit } of lesson.exercise.expected) {
        await page.getByRole('button', { name: cellName(cell) }).click()
        await page.getByRole('button', { name: `排除数字${digit}`, exact: true }).click()
      }
      await page.getByRole('button', { name: '提交排除', exact: true }).click()
    }
    await expect(page.getByRole('status')).toContainText('推理正确')
    await page.getByRole('link', { name: /学习列表/ }).click()
    await expect(
      page.getByRole('link').filter({ hasText: lesson.title }).filter({ hasText: '已完成' }),
    ).toBeVisible()
  }
  await page.reload()
  await expect(page.getByRole('link').filter({ hasText: '已完成' })).toHaveCount(6)
})
test('starts learning practice and confirms replacing a different lesson game', async ({
  page,
}) => {
  await page.goto('/#/learn/rules?practice=1')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await page.getByRole('link', { name: '返回本节课程', exact: true }).click()
  await page.getByRole('link', { name: /学习列表/ }).click()
  await page.getByRole('link').filter({ hasText: '显性数对' }).click()
  await page.getByRole('link', { name: /进入完整棋盘练习/ }).click()
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  expect((await readSessions(page))[0].session.metadata).toEqual({
    kind: 'learning',
    lessonId: 'rules',
  })
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认开始', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await expect
    .poll(async () => (await readSessions(page))[0].session.metadata)
    .toEqual({ kind: 'learning', lessonId: 'naked-pair' })
})
