import {
  test,
  expect,
  seedSession,
  cellName,
  enterExerciseDigit,
  makeVariantHintSession,
} from './support'
import { makeSession } from '../support/gameFixtures'

const desktopViewports = [
  { width: 1280, height: 720, visibleLessons: 2 },
  { width: 1440, height: 780, visibleLessons: 2 },
  { width: 1920, height: 936, visibleLessons: 3 },
]

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'Desktop viewport density')
})

for (const viewport of desktopViewports) {
  test.describe(`${viewport.width} by ${viewport.height} desktop viewport`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('keeps lesson operations and stage information together in the first screen', async ({
      page,
    }) => {
      await page.goto('/#/learn/locked-candidate')

      await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeInViewport({
        ratio: 1,
      })
      await expect(page.getByRole('group', { name: '练习操作', exact: true })).toBeInViewport({
        ratio: 1,
      })
      await expect(page.getByText(/练习阶段 1 \/ 2/)).toBeInViewport({ ratio: 1 })
      await expect(page.getByText(/固定教学片段/)).toBeInViewport({ ratio: 1 })
    })

    test('shows the opening course steps without scrolling past a large overview', async ({
      page,
    }) => {
      await page.goto('/#/learn')
      const lessons = page.getByRole('list', { name: '课程路径' }).getByRole('link')

      await expect(lessons.nth(viewport.visibleLessons - 1)).toBeInViewport({ ratio: 1 })
    })

    test('keeps the answer feedback and next stage action inside the first screen', async ({
      page,
    }) => {
      await page.goto('/#/learn/rules')
      await page.getByRole('button', { name: cellName(40) }).click()
      await enterExerciseDigit(page, 5)

      await expect(page.getByRole('status')).toContainText('推理正确')
      await expect(page.getByRole('status')).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: '下一阶段', exact: true })).toBeInViewport({
        ratio: 1,
      })
      await expect(page.getByText(/练习阶段 1 \/ 2/)).toBeInViewport({ ratio: 1 })
    })

    test('keeps the board tools and keyboard instructions in the first screen', async ({
      page,
    }) => {
      await seedSession(page, makeSession())
      await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()

      await expect(page.getByRole('group', { name: '数独棋盘', exact: true })).toBeInViewport({
        ratio: 1,
      })
      await expect(page.getByRole('group', { name: '棋盘工具', exact: true })).toBeInViewport({
        ratio: 1,
      })
      await expect(page.getByText(/1–9 填写/)).toBeInViewport({ ratio: 1 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
        .toBeLessThanOrEqual(viewport.height)

      await expect
        .poll(async () => {
          const board = await page
            .getByRole('group', { name: '数独棋盘', exact: true })
            .boundingBox()
          const title = await page.getByRole('heading', { level: 1 }).boundingBox()
          const pause = await page.getByRole('button', { name: '暂停', exact: true }).boundingBox()

          if (!board || !title || !pause) {
            return Infinity
          }

          return Math.max(
            Math.abs(title.x - board.x),
            Math.abs(pause.x + pause.width - board.x - board.width),
          )
        })
        .toBeLessThan(2)
    })
  })
}

test('keeps the site title typography consistent when navigating from home to inner pages', async ({
  page,
}) => {
  await page.goto('/#/')
  const brand = page.getByRole('link', { name: '一格一念，返回首页', exact: true })
  const homeTypography = await brand.evaluate((element) => {
    const style = getComputedStyle(element)

    return { fontSize: style.fontSize, lineHeight: style.lineHeight }
  })

  await page.getByRole('link', { name: /让每一步有理由 学习数独/ }).click()

  await expect(brand).toHaveCSS('font-size', homeTypography.fontSize)
  await expect(brand).toHaveCSS('line-height', homeTypography.lineHeight)
})

test('resizes the board with the window while keeping the whole game in view', async ({ page }) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const board = page.getByRole('group', { name: '数独棋盘', exact: true })
  const widths: number[] = []

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 780 },
    { width: 1920, height: 992 },
    { width: 1920, height: 1100 },
  ]) {
    await page.setViewportSize(viewport)

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
      .toBeLessThanOrEqual(viewport.height)
    await expect(board).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeInViewport({
      ratio: 1,
    })
    if (widths.length > 0 && widths.length < 3) {
      const previousWidth = widths[widths.length - 1] ?? 0
      await expect
        .poll(async () => (await board.boundingBox())?.width ?? 0)
        .toBeGreaterThan(previousWidth)
    }
    const box = await board.boundingBox()
    if (!box) {
      throw new Error('Missing board bounds')
    }

    expect(box.width).toBeGreaterThanOrEqual(320)
    expect(Math.abs(box.width - box.height)).toBeLessThan(1)
    widths.push(box.width)
  }

  expect(widths[1]).toBeGreaterThan(widths[0] ?? 0)
  expect(widths[2]).toBeGreaterThan(widths[1] ?? 0)

  await page.setViewportSize({ width: 1280, height: 500 })
  await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '对局设置', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
})

test('keeps selected variant rules clear of the board tools in a fitted game', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await seedSession(page, makeVariantHintSession('arrow'))
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(40) }).click()
  const rules = page.getByRole('list', { name: '所选格子的规则', exact: true })
  const tools = page.getByRole('group', { name: '棋盘工具', exact: true })

  await expect(rules).toBeInViewport({ ratio: 1 })
  await expect
    .poll(async () => {
      const ruleBox = await rules.boundingBox()
      const toolBox = await tools.boundingBox()
      const boardBox = await page
        .getByRole('group', { name: '数独棋盘', exact: true })
        .boundingBox()

      return Boolean(
        ruleBox &&
        toolBox &&
        boardBox &&
        (ruleBox.x >= boardBox.x + boardBox.width ||
          ruleBox.y >= toolBox.y + toolBox.height ||
          ruleBox.y + ruleBox.height <= boardBox.y),
      )
    })
    .toBe(true)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeLessThanOrEqual(720)
  await expect(page.getByRole('button', { name: '更多操作', exact: true })).toBeInViewport({
    ratio: 1,
  })
})
