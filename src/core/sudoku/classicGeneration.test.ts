import { expect, it } from 'vitest'
import { constructClassicTerminal } from '@/core/sudoku/classicGeneration'
import { createWorkBudget } from '@/core/sudoku/budget'
import { seededRandom } from '@/core/sudoku/random'
import { countIntercalates } from '../../../tests/support/terminalDiversity'
import { referenceCountSolutions } from '../../../tests/support/referenceVariants'
import { solvedBoard } from '../../../tests/fixtures/sudoku'
import { createGenerationInput, DEFAULT_GENERATION_LIMITS } from '@/core/sudoku/generation/input'
import { generatePuzzle } from '@/core/sudoku/generation/generate'

it('finds a unique Expert in a nearby clue mask within a three-terminal allowance', () => {
  const input = createGenerationInput('classic', 'expert', 'local-product-corpus-v1:seed:005')

  const result = generatePuzzle(input, { ...DEFAULT_GENERATION_LIMITS, maxLayouts: 3 })

  expect(result).toMatchObject({
    status: 'ready',
    assessment: { difficulty: 'expert' },
  })
  if (result.status !== 'ready') {
    throw new Error('Missing shared Expert exploration')
  }
  expect(result.metrics.layouts).toBeLessThanOrEqual(3)
  expect(referenceCountSolutions(result.puzzle.givens, result.puzzle.rules)).toEqual({
    count: 1,
    solution: result.puzzle.solution,
  })
  expect(result.puzzle.givens.filter(Boolean).length).toBeLessThanOrEqual(28)
})

it('constructs independently valid deterministic terminals across transformation classes', () => {
  const counts = new Set<number>()
  for (let index = 1; index <= 16; index++) {
    const seed = `classic-terminal-v2-${String(index).padStart(2, '0')}`
    const budget = createWorkBudget(1000000)
    const result = constructClassicTerminal(seededRandom(seed), budget)

    expect(result.status).toBe('ready')
    expect(constructClassicTerminal(seededRandom(seed), createWorkBudget(1000000))).toEqual(result)
    if (result.status !== 'ready') {
      throw new Error(seed)
    }
    expect(referenceCountSolutions(result.solution, { kind: 'classic' })).toEqual({
      count: 1,
      solution: result.solution,
    })
    expect(budget.used).toBeGreaterThanOrEqual(82)
    expect(budget.used).toBeLessThanOrEqual(budget.limit)
    counts.add(countIntercalates(result.solution))
  }

  expect(counts.size).toBeGreaterThan(1)
  expect([...counts].some((count) => count !== countIntercalates(solvedBoard))).toBe(true)
})

it.each([0, 1, 20])('does not return a partial terminal when allowance is %i', (limit) => {
  const budget = createWorkBudget(limit)

  expect(constructClassicTerminal(seededRandom('bounded-terminal'), budget)).toEqual({
    status: 'budget-exhausted',
  })
  expect(budget.used).toBe(limit)
})

it('independently preserves rectangle counts under allowed transformations', () => {
  const total = countIntercalates(solvedBoard)
  const rows = [1, 0, 2, 6, 7, 8, 3, 4, 5]
  const columns = [0, 2, 1, 3, 4, 5, 8, 6, 7]
  const mapped = solvedBoard.map(
    (_, cell) => solvedBoard[rows[Math.floor(cell / 9)] * 9 + columns[cell % 9]],
  )
  const transposed = solvedBoard.map(
    (_, cell) => solvedBoard[(cell % 9) * 9 + Math.floor(cell / 9)],
  )
  const relabeled = solvedBoard.map((digit) => (digit === 1 ? 2 : digit === 2 ? 1 : digit))

  expect(countIntercalates(mapped)).toBe(total)
  expect(countIntercalates(transposed)).toBe(total)
  expect(countIntercalates(relabeled)).toBe(total)
})
