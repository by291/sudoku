import { test, expect, seedSession } from './support'
import { makeSession } from '../support/gameFixtures'

test('places records in a home card and gives both resume actions the same distinct color', async ({
  page,
}, testInfo) => {
  await seedSession(page, makeSession())
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  const records = page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: '数独足迹', exact: true }) })
  await expect(records).toBeVisible()
  await expect(
    page.getByText('每一局，都是一次专注的练习。数据保存在当前浏览器。', { exact: true }),
  ).toHaveCount(0)
  const resume = page.getByRole('button', { name: '继续上次', exact: true })
  const start = page.getByRole('button', { name: '开始一局数独', exact: true })
  const resumeColor = await resume.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(resumeColor).not.toBe(
    await start.evaluate((element) => getComputedStyle(element).backgroundColor),
  )
  await start.click()
  const continueSave = page
    .getByRole('dialog')
    .getByRole('button', { name: '继续存档', exact: true })
  await expect(continueSave).toBeVisible()
  await expect(continueSave).toHaveCSS('background-color', resumeColor)
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  for (const [theme, color] of [
    ['深色', 'rgb(130, 159, 170)'],
    ['浅色', 'rgb(82, 109, 122)'],
  ]) {
    await page
      .getByRole('radiogroup', { name: '界面主题' })
      .getByText(theme, { exact: true })
      .click()
    await expect(resume).toHaveCSS('background-color', color)
    expect(color).not.toBe(
      await start.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    await start.click()
    await expect(continueSave).toHaveCSS('background-color', color)
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  }
  if (testInfo.project.name === 'desktop')
    await page.screenshot({
      path: '.superpowers/compact-play/home-desktop.png',
      fullPage: true,
      animations: 'disabled',
    })
  await records.click()
  await expect(page).toHaveURL(/#\/records$/)
})
