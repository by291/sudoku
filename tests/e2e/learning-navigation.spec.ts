import { LESSONS } from '../support/lessons'
import { test, expect, cellName, enterExerciseDigit, selectLessonMode } from './support'
import { lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'

test('shows one course path and retains the selected type through refresh and parent navigation', async ({
  page,
}) => {
  await page.goto('/#/learn')
  const navigation = page.getByRole('navigation', { name: '学习玩法', exact: true })
  await expect(navigation.getByRole('link')).toHaveCount(6)
  await expect(navigation.getByRole('link', { name: /标准数独/ })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('list', { name: '课程路径' }).getByRole('link')).toHaveCount(12)
  await navigation.getByRole('link', { name: /箭头数独/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/learn\?variant=arrow$/)
  await expect(page.getByRole('list', { name: '课程路径' }).getByRole('link')).toHaveCount(4)
  await expect(page.getByRole('heading', { name: '标准数独', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(navigation.getByRole('link', { name: /箭头数独/ })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.getByRole('link', { name: '开始学习', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn\/arrow-rules$/)
  await page.getByRole('link', { name: '返回课程列表', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn\?variant=arrow$/)
  await expect(navigation.getByRole('link', { name: /箭头数独/ })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('recommends the next unfinished lesson and resumes the last visited lesson', async ({
  page,
}, testInfo) => {
  await page.goto('/#/learn/rules')
  await selectLessonMode(page, '动手练习')
  await page.getByRole('button', { name: cellName(40) }).click()
  await enterExerciseDigit(page, 5)
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('推理正确')
  await page.getByRole('button', { name: '下一阶段', exact: true }).click()
  const transfer = stageAnswer(lessonStages(LESSONS[0])[1])
  if (transfer.kind !== 'placement') throw new Error('Expected placement transfer')
  await page.getByRole('button', { name: cellName(transfer.expected.cell) }).click()
  await enterExerciseDigit(page, transfer.expected.digit)
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('本课全部练习已完成，进度已保存。')
  await page.getByRole('link', { name: '返回课程列表', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: '标准数独学习进度' })).toHaveAttribute(
    'aria-valuetext',
    '已完成 1 / 12 节',
  )
  await page.getByRole('link', { name: '学习下一节', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn\/naked-single$/)
  await page.getByRole('link', { name: '返回课程列表', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('link', { name: '继续学习', exact: true })).toHaveAttribute(
    'href',
    '#/learn/naked-single',
  )
  await expect(page.getByRole('list', { name: '课程路径' })).toContainText('已完成')
  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'mobile') {
    await page.screenshot({
      path: `.superpowers/ux-refinement/learning-${testInfo.project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    (await page.viewportSize())?.width ?? 0,
  )
  await page.getByRole('link', { name: '继续学习', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn\/naked-single$/)
})

test('recovers an unknown course type without losing access to the course navigation', async ({
  page,
}) => {
  await page.goto('/#/learn?variant=unknown')
  await expect(page.getByRole('alert')).toContainText('无法识别')
  await page.getByRole('link', { name: '查看标准课程', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn$/)
  await expect(page.getByRole('list', { name: '课程路径' }).getByRole('link')).toHaveCount(12)
})

test('opens a different course at the top and restores the previous path on browser back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto('/#/learn')
  await page.getByRole('link', { name: /隐性数对/ }).scrollIntoViewIfNeeded()
  const previousScroll = await page.evaluate(() => window.scrollY)

  expect(previousScroll).toBeGreaterThan(300)
  await page
    .getByRole('navigation', { name: '学习玩法' })
    .getByRole('link', { name: /箭头数独/ })
    .click()
  await expect(page).toHaveURL(/#\/learn\?variant=arrow$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.goBack()
  await expect(page).toHaveURL(/#\/learn$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(previousScroll)
})
