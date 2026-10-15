import {
  test,
  expect,
  readSessions,
  seedSession,
  cellName,
  countResults,
  makeVariantHintSession,
  enterGameDigit,
  selectGameMenuAction,
} from './support'
import { makeSession } from '../support/gameFixtures'
import type { Page } from '@playwright/test'
import { VARIANT_FIXTURES } from '../fixtures/variants'
import { LESSONS } from '@/features/learning/model/lessons'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import { VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import type { Digit } from '@/core/sudoku/types'

async function chooseVariant(page: Page, field: string, name: string) {
  if (field !== '成绩玩法') {
    const dialog = page.getByRole('dialog')
    if (!(await dialog.isVisible())) {
      const entry = page.getByRole('button', {
        name: field === '每日玩法' ? '选择今日挑战' : '开始游戏',
        exact: true,
      })
      if (await entry.isVisible()) {
        await entry.click()
      } else {
        await selectGameMenuAction(page, field === '每日玩法' ? '选择其他挑战' : '新开一局')
      }
    }

    await dialog.getByText(name, { exact: true }).click()
    if (field === '每日玩法') {
      await dialog.getByRole('button', { name: /^(开始今日挑战|继续今日挑战|再次练习)$/ }).click()
    }

    return
  }

  const selector = page.getByRole('combobox', { name: field, exact: true })
  if (!(await selector.isVisible())) {
    await page
      .getByRole('navigation', { name: field, exact: true })
      .getByRole('link', { name: new RegExp(name) })
      .click()

    return
  }

  await selector.click()
  await page.getByRole('option', { name, exact: true }).click()
  await expect(page.getByRole('combobox', { name: field, exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(page.getByRole('listbox', { name: '玩法选项', exact: true })).toBeHidden()
}

const variants = [
  { kind: 'diagonal', name: '对角数独', clue: 'diagonal' },
  { kind: 'jigsaw', name: '不规则数独', clue: 'region' },
  { kind: 'killer', name: '杀手数独', clue: 'cage' },
  { kind: 'thermo', name: '温度计数独', clue: 'thermo' },
  { kind: 'arrow', name: '箭头数独', clue: 'arrow' },
] as const
for (const variant of variants) {
  test(`explains ${variant.kind} hints and preserves assisted history through refresh`, async ({
    page,
  }) => {
    const session = makeVariantHintSession(variant.kind)
    const target = variant.kind === 'arrow' ? 40 : 0
    const digit = variant.kind === 'arrow' ? 2 : 1
    await seedSession(page, session)
    await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
    await selectGameMenuAction(page, '生成候选数')
    const cell = page.getByRole('button', { name: cellName(target) })
    await cell.click()
    await expect(cell).toHaveAccessibleName(new RegExp(`笔记.*${digit}`))
    await page.getByRole('button', { name: '逻辑提示', exact: true }).click()
    const hint = page.getByRole('region', { name: '逻辑提示说明' })
    await expect(hint).toContainText(
      { diagonal: '对角线', jigsaw: '不规则区域', killer: '笼', thermo: '递增', arrow: '总和' }[
        variant.kind
      ],
    )
    const apply = hint.getByRole('button', { name: '应用提示', exact: true })

    for (let step = 0; step < 20 && !(await apply.isVisible()); step++) {
      await hint.getByRole('button', { name: '下一步', exact: true }).click()
    }

    await apply.click()
    await expect(cell).toHaveAccessibleName(new RegExp(`数字${digit}`))
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(cell).toHaveAccessibleName(/空格/)
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(cell).toHaveAccessibleName(new RegExp(`数字${digit}`))
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(page.locator('.sudoku-clues')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
    await expect.poll(async () => (await readSessions(page))[0].session.entries[target]).toBe(digit)
    await page.reload()
    await expect(async () => {
      await page
        .getByRole('button', { name: /^(继续游戏|尝试接管)$/ })
        .first()
        .click()
      await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({
        timeout: 300,
      })
    }).toPass({ timeout: 10000 })
    await expect(cell).toHaveAccessibleName(new RegExp(`数字${digit}`))

    expect((await readSessions(page))[0].session.assistance).toMatchObject({
      assisted: true,
      hintCount: 1,
      candidateCount: 1,
    })
  })

  test(`completes ${variant.kind} and saves its own result exactly once`, async ({ page }) => {
    const fixture = VARIANT_FIXTURES[variant.kind]
    await seedSession(
      page,
      makeSession({
        id: `${variant.kind}-completion`,
        puzzle: { ...makeSession().puzzle, ...fixture },
      }),
    )
    await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
    await page.getByRole('button', { name: cellName(0) }).click()
    await enterGameDigit(page, fixture.solution[0])
    await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()

    expect(await countResults(page)).toBe(1)
    await page.reload()
    await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()

    expect(await countResults(page)).toBe(1)
    expect((await readSessions(page))[0].session.puzzle.rules.kind).toBe(variant.kind)
  })

  test(`starts ${variant.kind} with its rules and preserves its clues through pause and refresh`, async ({
    page,
  }) => {
    await page.goto(`/#/play/free?variant=${variant.kind}`)
    await page.getByRole('button', { name: '开始游戏', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
    await expect(page.getByRole('heading', { name: new RegExp(variant.name) })).toBeVisible()
    const clue =
      variant.clue === 'region'
        ? page.locator('.sudoku-clues .region')
        : page.locator(`[data-clue="${variant.clue}"]`)
    await expect(page.locator('.sudoku-clues')).toBeVisible()

    expect(await clue.count()).toBeGreaterThan(0)
    expect((await readSessions(page))[0].session.puzzle.rules.kind).toBe(variant.kind)
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(clue).toHaveCount(0)
    await page.reload()
    await expect(async () => {
      await page
        .getByRole('button', { name: /^(继续游戏|尝试接管)$/ })
        .first()
        .click()
      await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({
        timeout: 300,
      })
    }).toPass({ timeout: 10000 })
    await expect(page.locator('.sudoku-clues')).toBeVisible()

    expect(await clue.count()).toBeGreaterThan(0)
  })
}
test('rejects an unknown variant and offers an actionable recovery', async ({ page }) => {
  await page.goto('/#/play/free?variant=unknown')
  await expect(page.getByText(/无法识别.*玩法/)).toBeVisible()
  await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: '返回标准数独', exact: true })).toBeVisible()
})

test('retains a type selected from the default free URL after refresh', async ({ page }) => {
  await page.goto('/#/play/free?source=home')
  await chooseVariant(page, '下一局玩法', '箭头数独')
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 箭头数独', exact: true }),
  ).toBeVisible()
  const saved = (await readSessions(page))[0].session
  await expect(page).toHaveURL(new RegExp(`variant=arrow.*session=${saved.id}`))
  await expect(page).toHaveURL(/source=home/)
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存到本机' })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 箭头数独', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
})

test('updates the explicit session URL after restarting a free puzzle', async ({ page }) => {
  const original = makeSession()
  await seedSession(page, original)
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await selectGameMenuAction(page, '重新开始本题')
  await page.getByRole('dialog').getByRole('button', { name: '确认开始', exact: true }).click()
  await expect.poll(async () => (await readSessions(page))[0].session.id).not.toBe(original.id)
  const restarted = (await readSessions(page))[0].session
  await expect(page).toHaveURL(new RegExp(`session=${restarted.id}`))
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  await expect(page.getByText('存档与当前模式不匹配，或已被清除。', { exact: true })).toHaveCount(0)
})

test('explains a fixed Arrow combination and highlights the displayed step', async ({ page }) => {
  // These nine entries and the expected removals are pinned facts from the authored Hard fixture.
  const entries = new Map<number, Digit>([
    [66, 1],
    [49, 6],
    [46, 1],
    [80, 2],
    [9, 1],
    [56, 5],
    [55, 2],
    [24, 1],
    [61, 1],
  ])
  await seedSession(
    page,
    makeSession({
      id: 'arrow-combination-fixture',
      puzzle: {
        ...VARIANT_TEMPLATES.arrow.hard[0],
        seed: 'fixed-arrow-proof',
        puzzleVersion: VARIANT_PUZZLE_VERSION,
      },
      entries: Array.from({ length: 81 }, (_, cell) => entries.get(cell) ?? 0),
    }),
  )
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: '逻辑提示', exact: true }).click()
  const hint = page.getByRole('region', { name: '逻辑提示说明' })
  await expect(hint).toContainText('步骤 1 / 4')
  await expect(page.getByRole('button', { name: /提示位置/ })).toHaveCount(3)
  await hint.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.getByRole('button', { name: /提示位置/ })).toHaveCount(2)
  await hint.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(hint).toContainText('箭头组合')

  for (const deduction of ['第1行第9列排除6', '第4行第6列排除8', '第5行第5列排除4']) {
    await expect(hint).toContainText(deduction)
  }

  await expect(hint).toContainText('圆圈第1行第9列：6、7、8、9')
  await expect(hint).toContainText('箭杆第4行第6列：3、4、8')
  await expect(page.getByRole('button', { name: /提示位置/ })).toHaveCount(5)

  for (const cell of [8, 16, 24, 32, 40]) {
    await expect(page.getByRole('button', { name: cellName(cell) })).toHaveAccessibleName(
      /提示位置/,
    )
  }

  await hint.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.getByRole('button', { name: /提示位置/ })).toHaveCount(1)
  await expect(page.getByRole('button', { name: cellName(1) })).toHaveAccessibleName(/提示位置/)
  await hint.getByRole('button', { name: '应用提示', exact: true }).click()
  await expect(page.getByRole('button', { name: cellName(1) })).toHaveAccessibleName(/数字6/)
})
test('keeps the current rules while choosing another type and offers target resume or replacement', async ({
  page,
}) => {
  await seedSession(page, makeSession())
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(2) }).click()
  await chooseVariant(page, '下一局玩法', '箭头数独')
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 标准数独', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: cellName(2) })).toHaveAccessibleName(/空格/)
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 箭头数独', exact: true }),
  ).toBeVisible()

  expect(
    (await readSessions(page)).map((record) => record.session.puzzle.rules.kind).sort(),
  ).toEqual(['arrow', 'classic'])
  await chooseVariant(page, '下一局玩法', '标准数独')
  await page.getByRole('button', { name: '继续存档', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 标准数独', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/variant=classic/)
  await expect(page).toHaveURL(new RegExp(`session=${makeSession().id}`))
  await selectGameMenuAction(page, '新开一局')
  await expect(page.getByRole('dialog')).toContainText('开始游戏将替换此玩法存档')
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()

  expect(
    (await readSessions(page)).find((record) => record.session.puzzle.rules.kind === 'classic')
      ?.session.id,
  ).toBe(makeSession().id)
})
test('switches independent daily types and restores the selected type after refresh', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-11T01:00:00Z'))
  await page.goto('/#/play/daily')
  await page.getByRole('button', { name: '选择今日挑战', exact: true }).click()
  await expect(
    page.getByRole('radiogroup', { name: '玩法', exact: true }).getByRole('radio'),
  ).toHaveCount(6)
  await page.getByRole('dialog').getByRole('button', { name: '开始今日挑战', exact: true }).click()
  await selectGameMenuAction(page, '生成候选数')
  await chooseVariant(page, '每日玩法', '箭头数独')
  await expect(
    page.getByRole('heading', { name: '每日挑战 · 箭头数独', exact: true }),
  ).toBeVisible()
  await expect.poll(async () => (await readSessions(page)).length).toBe(2)
  const records = await readSessions(page)

  expect(
    records.find((record) => record.session.puzzle.rules.kind === 'classic')?.session.assistance
      .candidateCount,
  ).toBe(1)
  await expect(page).toHaveURL(/variant=arrow/)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '每日挑战 · 箭头数独', exact: true }),
  ).toBeVisible()
})
test('restores an explicit saved type even when the query chooses Classic and filters its result', async ({
  page,
}) => {
  const fixture = VARIANT_FIXTURES.arrow
  const session = makeSession({
    id: 'arrow-saved',
    puzzle: { ...makeSession().puzzle, ...fixture },
  })
  await seedSession(page, session, '/play/free?variant=classic')
  await expect(
    page.getByRole('heading', { name: '自由游玩 · 箭头数独', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(0) }).click()
  await enterGameDigit(page, 5)
  await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '查看个人记录', exact: true }).click()
  await expect(page.getByText('这个玩法还没有完成记录', { exact: false })).toBeVisible()
  await chooseVariant(page, '成绩玩法', '箭头数独')
  await expect(
    page.getByRole('heading', { name: '完成记录', exact: true }).locator('..'),
  ).toContainText('箭头数独 · 自由游玩')
})
test('starts the supported practice tier for every course unit', async ({ page }) => {
  test.setTimeout(180000)
  for (const lesson of LESSONS) {
    await page.goto(`/#/learn/${lesson.id}?practice=1`)
    await page.getByRole('button', { name: '开始游戏', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.or(page.getByRole('group', { name: '数独棋盘' }))).toBeVisible()
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: '确认开始', exact: true }).click()
    }

    await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
    const practice = (await readSessions(page)).find((record) => record.session.mode === 'learning')

    expect(practice?.session.puzzle.rules.kind).toBe(lesson.practiceVariant)
    expect(practice?.session.puzzle.difficulty).toBe(lesson.practiceDifficulty)
  }
})
test('retains the daily board and selector after a failed save and switches after recovery', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-11T01:00:00Z'))
  const session = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
  })
  await seedSession(page, session, '/play/daily')
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = original.apply(this, args)
      if (
        args[1] === 'readwrite' &&
        transaction.objectStoreNames.contains('sessions') &&
        transaction.objectStoreNames.contains('results')
      ) {
        queueMicrotask(() => transaction.abort())
      }

      return transaction
    }
    const restore = () => {
      IDBDatabase.prototype.transaction = original
      window.removeEventListener('restore-test-storage', restore)
    }
    window.addEventListener('restore-test-storage', restore)
  })
  await page.getByRole('button', { name: cellName(2) }).click()
  await enterGameDigit(page, 4)
  await expect(page.getByRole('alert').filter({ hasText: '保存失败' })).toBeVisible()
  await chooseVariant(page, '每日玩法', '箭头数独')
  await expect(
    page.getByRole('heading', { name: '每日挑战 · 标准数独', exact: true }),
  ).toBeVisible()

  expect((await readSessions(page)).map((record) => record.session.id)).toEqual([session.id])
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')))
  await page.getByRole('button', { name: '重试保存', exact: true }).click()
  await expect.poll(async () => (await readSessions(page))[0].session.entries[2]).toBe(4)
  await chooseVariant(page, '每日玩法', '箭头数独')
  await expect(
    page.getByRole('heading', { name: '每日挑战 · 箭头数独', exact: true }),
  ).toBeVisible()

  expect(
    (await readSessions(page)).find((record) => record.session.id === session.id)?.session
      .entries[2],
  ).toBe(4)
})
