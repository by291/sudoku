import { test, expect, cellName, enterExerciseDigit, selectLessonMode } from './support'

test('keeps mobile answer feedback above the fixed actions without moving the board', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/#/learn/rules')
  await selectLessonMode(page, '动手练习')
  const board = page.getByRole('group', { name: '数独棋盘', exact: true })
  const actions = page.getByRole('group', { name: '练习操作', exact: true })
  const initialBoard = await board.boundingBox()
  await page.getByRole('button', { name: cellName(40) }).click()
  await enterExerciseDigit(page, 1)
  await page.getByRole('button', { name: '提交答案', exact: true }).click()

  const feedback = page.getByRole('status')
  await expect(feedback).toContainText('还差一点')
  const feedbackBounds = await feedback.boundingBox()
  const actionBounds = await actions.boundingBox()
  expect(feedbackBounds).not.toBeNull()
  expect(actionBounds).not.toBeNull()
  if (!feedbackBounds || !actionBounds) {
    throw new Error('Feedback and actions must have visible bounds')
  }
  expect(feedbackBounds.y + feedbackBounds.height).toBeLessThanOrEqual(actionBounds.y)
  expect(await board.boundingBox()).toEqual(initialBoard)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await enterExerciseDigit(page, 5)
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(feedback).toContainText('推理正确')
  expect(await board.boundingBox()).toEqual(initialBoard)
})

test('keeps mobile mode controls available and preserves scroll after reading a long explanation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('/#/learn/x-wing')
  const guide = page.getByRole('radio', { name: '学习讲解', exact: true })
  const exercise = page.getByRole('radio', { name: '动手练习', exact: true })
  await expect(guide).toBeChecked()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const scroll = await page.evaluate(() => window.scrollY)
  expect(scroll).toBeGreaterThan(0)
  await expect(guide).toBeInViewport({ ratio: 1 })
  await expect(exercise).toBeInViewport({ ratio: 1 })

  await selectLessonMode(page, '动手练习')

  await expect(exercise).toBeChecked()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll)
  await expect(page.getByRole('button', { name: '提交排除', exact: true })).toBeInViewport({
    ratio: 1,
  })
  await selectLessonMode(page, '学习讲解')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll)
})

test('keeps the board and primary action stable while preserving a draft between lesson modes', async ({
  page,
}, testInfo) => {
  await page.goto('/#/learn/rules')
  const board = page.getByRole('group', { name: '数独棋盘', exact: true })
  const actions = page.getByRole('group', { name: '练习操作', exact: true })
  await expect(page.getByRole('radio', { name: '学习讲解', exact: true })).toBeChecked()
  const guideBoard = await board.boundingBox()
  const guideActions = await actions.boundingBox()

  await selectLessonMode(page, '动手练习')
  await page.getByRole('button', { name: cellName(40) }).click()
  await enterExerciseDigit(page, 5)

  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: cellName(40) })).toHaveAttribute(
    'aria-label',
    /数字5/,
  )
  await expect(page.getByRole('heading', { name: '这一步，怎么想', exact: true })).toBeHidden()
  expect(await board.boundingBox()).toEqual(guideBoard)
  expect(await actions.boundingBox()).toEqual(guideActions)

  await selectLessonMode(page, '学习讲解')
  await expect(page.getByRole('heading', { name: '这一步，怎么想', exact: true })).toBeVisible()
  await selectLessonMode(page, '动手练习')
  await expect(page.getByRole('button', { name: cellName(40) })).toHaveAttribute(
    'aria-label',
    /数字5/,
  )
  await expect(page.getByRole('button', { name: '提交答案', exact: true })).toBeInViewport({
    ratio: 1,
  })
  await page.getByRole('button', { name: '提交答案', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('推理正确')
  await expect(page.getByRole('button', { name: '下一阶段', exact: true })).toBeInViewport({
    ratio: 1,
  })
  expect(await board.boundingBox()).toEqual(guideBoard)
  expect(await actions.boundingBox()).toEqual(guideActions)
  await expect(page.getByText(/练习阶段 1 \/ 2/)).toBeVisible()
  await page.screenshot({
    path: `test-results/visual/web-parity/lesson-modes-${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })

  await page.getByRole('button', { name: '下一阶段', exact: true }).click()
  await expect(page.getByText(/练习阶段 2 \/ 2/)).toBeVisible()
  await page.getByRole('link', { name: '返回课程列表', exact: true }).click()
  await expect(
    page.getByRole('list', { name: '课程路径' }).getByRole('link', { name: /认识数独/ }),
  ).toContainText('学习中')
  await expect(page.getByText('第 2 / 2 阶段', { exact: true })).toBeVisible()
})
