import { LESSONS } from '../support/lessons'
import { test, expect, cellName, readSessions, enterExerciseDigit } from './support'
import { lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'
import { VARIANT_OPTIONS } from '@/features/game/model/variants'

test('completes the rules exercise using only keyboard navigation', async ({ page }, testInfo) => {
  await page.goto('/#/learn/rules')
  await expect(page.getByText('正在准备或保存练习，请稍候…', { exact: true })).toBeHidden()
  const first = page.getByRole('button', { name: cellName(0) })

  for (
    let tabs = 0;
    tabs < 20 && !(await first.evaluate((element) => element === document.activeElement));
    tabs++
  ) {
    await page.keyboard.press('Tab')
  }

  await expect(first).toBeFocused()

  for (let row = 0; row < 4; row++) {
    await page.keyboard.press('ArrowDown')
  }

  for (let column = 0; column < 4; column++) {
    await page.keyboard.press('ArrowRight')
  }

  await expect(page.getByRole('button', { name: cellName(40) })).toBeFocused()
  await page.keyboard.press('9')
  await expect(page.getByRole('status')).toContainText('还差一点')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: cellName(41) })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('5')
  await expect(page.getByRole('status')).toContainText('推理正确')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: cellName(41) })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.screenshot({
    path: `.superpowers/navigation-refinement/lesson-${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
})
test('teaches all thirty-two units with every required stage, retry and durable progress', async ({
  page,
}) => {
  test.setTimeout(300000)
  for (const lesson of LESSONS) {
    await page.goto(`/#/learn/${lesson.id}`)
    await expect(page.getByRole('heading', { name: lesson.title, exact: true })).toBeVisible()
    const stages = lessonStages(lesson)
    for (const [index, stage] of stages.entries()) {
      const exercise = stageAnswer(stage)
      if (exercise.kind === 'placement') {
        const { cell, digit } = exercise.expected
        await page.getByRole('button', { name: cellName(cell) }).click()
        await enterExerciseDigit(page, digit === 9 ? 8 : 9)
        await expect(page.getByRole('status')).toContainText('还差一点')
        await enterExerciseDigit(page, digit)
      } else {
        await page.getByRole('button', { name: '提交排除', exact: true }).click()
        await expect(page.getByRole('status')).toContainText('还差一点')
        for (const { cell, digit } of exercise.expected) {
          await page.getByRole('button', { name: cellName(cell) }).click()
          await enterExerciseDigit(page, digit, '排除')
        }

        await page.getByRole('button', { name: '提交排除', exact: true }).click()
      }

      await expect(page.getByRole('status')).toContainText('推理正确')
      if (index < stages.length - 1) {
        await page.getByRole('button', { name: '下一阶段', exact: true }).click()
      }
    }
    await expect(page.getByText('本课全部练习已完成，进度已保存。')).toBeVisible()
    await page.getByRole('link', { name: /返回课程列表/ }).click()
    await expect(
      page.getByRole('link').filter({ hasText: lesson.title }).filter({ hasText: '已完成' }),
    ).toBeVisible()
  }

  await page.reload()
  await expect(page.getByRole('progressbar', { name: '全部课程学习进度' })).toHaveAttribute(
    'aria-valuetext',
    '已完成 32 / 32 节',
  )

  for (const variant of VARIANT_OPTIONS) {
    await page
      .getByRole('navigation', { name: '学习玩法' })
      .getByRole('link', { name: new RegExp(variant.label) })
      .click()
    await expect(
      page.getByRole('list', { name: '课程路径' }).getByRole('link').filter({ hasText: '已完成' }),
    ).toHaveCount(variant.value === 'classic' ? 12 : 4)
    await expect(page.getByRole('link', { name: '复习课程', exact: true })).toBeVisible()
  }
})
test('starts learning practice and confirms replacing a different lesson game', async ({
  page,
}) => {
  await page.goto('/#/learn/rules?practice=1')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await page.getByRole('link', { name: '返回本节课程', exact: true }).click()
  await page.getByRole('link', { name: /返回课程列表/ }).click()
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
