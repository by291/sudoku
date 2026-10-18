import {
  test,
  expect,
  seedSession,
  cellName,
  enterGameDigit,
  readSessions,
  countResults,
  selectGameMenuAction,
} from './support'
import { makeSession, HISTORICAL_CLASSIC_VERSION } from '../support/gameFixtures'
import { CLASSIC_PUZZLE_FIXTURES } from '../fixtures/classicPuzzles'
import { generationInput } from '../support/generation'
import type { Board } from '@/sudoku/contracts'
import { runWorker, parseWorkerResponse, validateHintEvidence } from './workerHarness'

// Frozen independently before removing the TypeScript solver: the authored Expert puzzle
// after its basic techniques stall. Keep browser hint setup independent of the Rust solver.
const stalledBoard: Board = [
  4, 8, 1, 3, 5, 2, 7, 9, 6, 7, 2, 5, 0, 8, 0, 0, 0, 3, 6, 3, 9, 1, 0, 0, 5, 8, 2, 0, 0, 2, 0, 0, 5,
  0, 0, 9, 5, 0, 0, 0, 0, 0, 0, 0, 4, 3, 9, 4, 7, 0, 0, 0, 5, 0, 0, 0, 3, 5, 9, 0, 0, 2, 0, 2, 5, 0,
  0, 0, 3, 9, 0, 7, 9, 0, 0, 2, 0, 0, 0, 3, 5,
]

const authored = CLASSIC_PUZZLE_FIXTURES.find((template) => template.difficulty === 'expert')
if (!authored) {
  throw new Error('Missing Expert fixture')
}
const puzzle = {
  ...authored,
  seed: 'expert-fixture',
  puzzleVersion: HISTORICAL_CLASSIC_VERSION,
  rules: { kind: 'classic' } as const,
}

test('recovers a variant Expert URL without generating an unrelated tier', async ({ page }) => {
  await page.goto('/#/play/free?variant=diagonal&difficulty=expert&start=1')
  await expect(page.getByRole('alert')).toContainText('专家难度仅适用于标准数独')
  await expect(page.getByRole('group', { name: '数独棋盘' })).toHaveCount(0)
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('专家', { exact: true })).toHaveCount(0)
  await dialog.getByText('中等', { exact: true }).click()
  await dialog.getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  expect((await readSessions(page))[0].session.puzzle).toMatchObject({
    difficulty: 'medium',
    rules: { kind: 'diagonal' },
  })
})

for (const base of ['/', '/sudoku/'] as const) {
  test(`delivers Expert assessment, generation and advanced hint proofs at ${base}`, async ({
    page,
  }) => {
    await page.goto(base === '/' ? '/#/' : 'http://127.0.0.1:4174/sudoku/#/')
    const generation = parseWorkerResponse(
      await runWorker(
        page,
        {
          kind: 'generate',
          requestId: 'expert-generation',
          input: generationInput('classic', 'expert', 'production-expert'),
        },
        base,
      ),
    )
    expect(generation).toMatchObject({
      valid: true,
      value: {
        kind: 'generate',
        outcome: {
          status: 'completed',
          value: { difficulty: 'expert' },
          assessment: { status: 'rated', summary: { difficulty: 'expert' } },
        },
      },
    })
    const response = parseWorkerResponse(
      await runWorker(
        page,
        {
          kind: 'hint',
          requestId: 'expert-hint',
          board: stalledBoard,
          solution: puzzle.solution,
          rules: puzzle.rules,
        },
        base,
      ),
    )
    if (
      !response.valid ||
      response.value.kind !== 'hint' ||
      response.value.outcome.status !== 'completed'
    ) {
      throw new Error('Expected Expert hint')
    }
    const hint = response.value.outcome.value
    expect(validateHintEvidence(hint, puzzle.rules, stalledBoard).valid).toBe(true)
    expect(hint).toMatchObject({
      kind: 'deduction',
      steps: expect.arrayContaining([expect.objectContaining({ technique: 'simple-coloring' })]),
    })
  })
}

test('preserves Expert notes, hint assistance, history, pause and restart', async ({ page }) => {
  const entries = stalledBoard.map((digit, cell) => (puzzle.givens[cell] === 0 ? digit : 0))
  const target = stalledBoard.findIndex((digit) => digit === 0)
  await seedSession(page, makeSession({ id: 'expert-history', puzzle, entries }))
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  const cell = page.getByRole('button', { name: cellName(target) })
  await cell.click()
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  await enterGameDigit(page, 1)
  await expect(cell).toHaveAccessibleName(/笔记.*1/)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(cell).not.toHaveAccessibleName(/笔记.*1/)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(cell).toHaveAccessibleName(/笔记.*1/)
  await page.getByRole('button', { name: '逻辑提示', exact: true }).click()
  const panel = page.getByRole('region', { name: '逻辑提示说明' })
  await expect(panel).toBeVisible()
  let sawColoring = (await panel.innerText()).includes('简单着色')
  while (await panel.getByRole('button', { name: '下一步', exact: true }).isVisible()) {
    await panel.getByRole('button', { name: '下一步', exact: true }).click()
    sawColoring ||= (await panel.innerText()).includes('简单着色')
  }
  expect(sawColoring).toBe(true)
  await panel.getByRole('button', { name: '应用提示', exact: true }).click()
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.getByRole('button', { name: /已暂停/ })).toHaveCount(81)
  await expect.poll(async () => (await readSessions(page))[0].session.assistance.hintCount).toBe(1)
  await page.reload()
  await expect(page.getByText(/专家/).first()).toBeVisible()
  await expect(async () => {
    await page
      .getByRole('button', { name: /^(继续游戏|尝试接管)$/ })
      .first()
      .click()
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({
      timeout: 300,
    })
  }).toPass({ timeout: 10000 })
  await selectGameMenuAction(page, '重新开始本题')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /重新开始|确认/ })
    .click()
  await expect
    .poll(async () => (await readSessions(page))[0].session.entries.every((digit) => digit === 0))
    .toBe(true)
  expect((await readSessions(page))[0].session.puzzle).toEqual(puzzle)
})

test('records Expert completion separately and hides Expert for variants', async ({ page }) => {
  const target = puzzle.givens.findIndex((digit) => digit === 0)
  const entries = puzzle.solution.map((digit, cell) =>
    puzzle.givens[cell] === 0 && cell !== target ? digit : 0,
  )
  await seedSession(page, makeSession({ id: 'expert-completion', puzzle, entries }))
  await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
  await page.getByRole('button', { name: cellName(target) }).click()
  await enterGameDigit(page, puzzle.solution[target])
  await expect(page.getByText('成绩已保存到本机。', { exact: true })).toBeVisible()
  expect(await countResults(page)).toBe(1)
  await page.goto('/#/records')
  await expect(page.getByRole('row').filter({ hasText: '专家' })).toHaveCount(1)
  await page.goto('/#/play/free')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('对角数独', { exact: true }).click()
  await expect(dialog.getByText('专家', { exact: true })).toHaveCount(0)
})
