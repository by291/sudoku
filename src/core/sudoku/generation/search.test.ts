import { createAssessmentInput } from '@/core/sudoku/rating/input'
import * as variantGeneration from '@/core/sudoku/generation/variant'
import { givenMask } from '@/core/sudoku/generation/candidates'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
import type { PuzzleRules } from '@/core/sudoku/rules/types'
import { afterEach, expect, it, vi } from 'vitest'
import * as layouts from '@/core/sudoku/generation/layouts'
import * as rating from '@/core/sudoku/rating/assessment'
import * as search from '@/core/sudoku/search/exact'
import { createGenerationInput, DEFAULT_GENERATION_LIMITS } from '@/core/sudoku/generation/input'
import { generatePuzzle } from '@/core/sudoku/generation/generate'
import { consumeWork, withWorkStage } from '@/core/sudoku/budget'
import type { Board } from '@/core/sudoku/types'
import type { TargetScreenResult } from '@/core/sudoku/rating/types'
import { solvedBoard } from '../../../../tests/fixtures/sudoku'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../../tests/fixtures/classicPuzzles'
import { referenceCountSolutions } from '../../../../tests/support/referenceVariants'

const hard = CLASSIC_PUZZLE_FIXTURES.find((fixture) => fixture.difficulty === 'hard')
if (!hard) {
  throw new Error('Missing independently verified Hard fixture')
}
const complete = rating.assessPuzzle(createAssessmentInput(hard.givens, { kind: 'classic' }))
if (complete.status !== 'rated') {
  throw new Error('Missing fixed Hard assessment')
}
const hardAssessment = complete

afterEach(() => vi.restoreAllMocks())

function scriptedSearch(
  screenOverride?: (board: Board, call: number) => TargetScreenResult | null,
  rules: PuzzleRules = { kind: 'classic' },
  terminal: Board = solvedBoard,
) {
  let screens = 0
  const construction = vi
    .spyOn(layouts, 'constructGenerationLayout')
    .mockImplementation((_input, _random, budget) => {
      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }
      return { status: 'ready', terminal: [...terminal], rules }
    })
  const finish = vi.fn(() => ({
    ...hardAssessment,
    summary: { ...hardAssessment.summary, variant: rules.kind },
  }))
  vi.spyOn(rating, 'prepareAssessmentWithComputation').mockImplementation(() => ({
    assess: () => hardAssessment,
    screen: () => ({ status: 'rated', difficulty: 'hard', complete: finish }),
    screenTarget(board, _target, budget) {
      if (!withWorkStage(budget, 'logic', () => consumeWork(budget))) {
        return { status: 'budget-exhausted', cause: 'work-limit' }
      }
      const special = screenOverride?.(board, ++screens)
      if (special) {
        return special
      }
      const clues = board.filter(Boolean).length
      return {
        status: clues <= 31 ? 'matching-target' : 'below-target',
        difficulty: clues <= 31 ? 'hard' : 'easy',
        feedback: { remainingCells: 0, deductions: 81 - clues },
        complete: finish,
      }
    },
  }))
  const count = vi.fn<search.PreparedExactValidator['count']>((_board, budget) => {
    if (!withWorkStage(budget, 'exact', () => consumeWork(budget))) {
      return { status: 'budget-exhausted', nodesVisited: 0, workUsed: 0 }
    }
    return {
      status: 'complete',
      count: 1,
      solution: [...terminal],
      nodesVisited: 1,
      workUsed: 1,
    }
  })
  vi.spyOn(search, 'prepareExactValidator').mockReturnValue({ count })

  return { construction, count, finish }
}

it('keeps matching grades above the clue cap as checkpoints and still exact-counts delivery', () => {
  let saw31 = false
  const mocks = scriptedSearch((board) => {
    saw31 ||= board.filter(Boolean).length === 31
    return null
  })
  const result = generatePuzzle(createGenerationInput('classic', 'hard', 'shared-matching-cap'))

  expect(result.status).toBe('ready')
  expect(saw31).toBe(true)
  expect(mocks.finish).toHaveBeenCalledTimes(1)
  if (result.status !== 'ready') {
    throw new Error('Expected a completed target')
  }
  expect(result.puzzle.givens.filter(Boolean).length).toBeLessThanOrEqual(30)
  expect(mocks.count.mock.lastCall?.[0]).toEqual(result.puzzle.givens)
  expect(Object.values(result.metrics.workByStage).reduce((a, b) => a + b, 0)).toBe(
    result.metrics.constructionWork,
  )
})

it('continues retained work after 40 attempts even if the later terminals fail', () => {
  const mocks = scriptedSearch((_board, call) =>
    call <= 8 ? { status: 'budget-exhausted', cause: 'logical-step-limit' } : null,
  )
  mocks.construction.mockImplementation((_input, _random, budget) => {
    consumeWork(budget)
    return mocks.construction.mock.calls.length === 1
      ? { status: 'ready', terminal: [...solvedBoard], rules: { kind: 'classic' } }
      : { status: 'attempt-exhausted' }
  })
  const result = generatePuzzle(createGenerationInput('classic', 'hard', 'retained-layout-forty'))

  expect(result).toMatchObject({ status: 'ready', metrics: { layouts: 40, completedLayouts: 1 } })
  expect(result.metrics.candidateVisits).toBeGreaterThan(8)
})

it('treats a step-limited candidate and rejected uniqueness as local outcomes', () => {
  const mocks = scriptedSearch((_board, call) =>
    call === 1 ? { status: 'budget-exhausted', cause: 'logical-step-limit' } : null,
  )
  mocks.count.mockImplementationOnce(() => ({
    status: 'complete',
    count: 2,
    solution: [...solvedBoard],
    nodesVisited: 1,
    workUsed: 0,
  }))
  const result = generatePuzzle(createGenerationInput('classic', 'hard', 'local-inconclusive'))

  expect(result.status).toBe('ready')
  expect(mocks.count.mock.calls.length).toBeGreaterThan(1)
})

it.each([0, 1, 20])('never publishes an incomplete repair with %i work units', (maxWork) => {
  scriptedSearch()
  const result = generatePuzzle(
    createGenerationInput('classic', 'hard', 'bounded-common-refinement'),
    { ...DEFAULT_GENERATION_LIMITS, maxWork },
  )

  expect(result).toMatchObject({ status: 'budget-exhausted', cause: 'work-limit' })
  expect(result).not.toHaveProperty('puzzle')
  expect(result).not.toHaveProperty('assessment')
  expect(result.metrics.constructionWork).toBe(maxWork)
  expect(Object.values(result.metrics.workByStage).reduce((a, b) => a + b, 0)).toBe(maxWork)
  expect(solvedBoard[0]).toBe(5)
})

it('distinguishes blocked creation from step exhaustion and lost known solutions', () => {
  const mocks = scriptedSearch(() => ({ status: 'budget-exhausted', cause: 'logical-step-limit' }))
  expect(
    generatePuzzle(createGenerationInput('classic', 'hard', 'no-layouts'), {
      ...DEFAULT_GENERATION_LIMITS,
      maxLayouts: 0,
    }),
  ).toMatchObject({ status: 'budget-exhausted', cause: 'layout-limit', metrics: { layouts: 0 } })
  expect(
    generatePuzzle(createGenerationInput('classic', 'hard', 'step-limited'), {
      ...DEFAULT_GENERATION_LIMITS,
      maxLayouts: 1,
    }),
  ).toMatchObject({ status: 'budget-exhausted', cause: 'logical-step-limit' })
  mocks.count.mockImplementation(() => ({
    status: 'complete',
    count: 0,
    solution: null,
    nodesVisited: 1,
    workUsed: 0,
  }))
  expect(
    generatePuzzle(createGenerationInput('classic', 'hard', 'lost-known-solution')),
  ).toMatchObject({ status: 'failed', reason: expect.stringContaining('known solution') })
})

it('independently verifies a real shared-engine result', () => {
  const result = generatePuzzle(createGenerationInput('classic', 'hard', 'shared-real-contract'))

  expect(result.status).toBe('ready')
  if (result.status !== 'ready') {
    throw new Error('Expected fixed-seed real generation')
  }
  expect(referenceCountSolutions(result.puzzle.givens, result.puzzle.rules)).toEqual({
    count: 1,
    solution: result.puzzle.solution,
  })
  expect(
    rating.assessPuzzle(createAssessmentInput(result.puzzle.givens, result.puzzle.rules)),
  ).toMatchObject({ status: 'rated', summary: result.assessment })
})

it('lets a progressing second layout finish its sweep before replacement', () => {
  const mocks = scriptedSearch()
  const screensByLayout = new Map<object, number>()
  const original = vi.mocked(rating.prepareAssessmentWithComputation).getMockImplementation()
  if (!original) {
    throw new Error('Missing typed screening fixture')
  }
  vi.mocked(rating.prepareAssessmentWithComputation).mockImplementation((computation, limits) => {
    const owner = original(computation, limits)
    const index = mocks.construction.mock.calls.length
    return {
      ...owner,
      screenTarget(board, target, budget) {
        const seen = (screensByLayout.get(owner) ?? 0) + 1
        screensByLayout.set(owner, seen)
        if (index === 1) {
          consumeWork(budget)
          return { status: 'budget-exhausted', cause: 'logical-step-limit' }
        }
        return owner.screenTarget(board, target, budget)
      },
    }
  })
  const result = generatePuzzle(
    createGenerationInput('classic', 'hard', 'progressing-second-layout'),
  )

  expect(result.status).toBe('ready')
  expect(result.metrics.layouts).toBe(2)
  expect(mocks.finish).toHaveBeenCalledTimes(1)
})

it('uses a stalled checkpoint to restore clues before finding the target', () => {
  let stalledMask: bigint | null = null
  let restored = false
  scriptedSearch((board) => {
    const clues = board.filter(Boolean).length
    if (!restored && clues === 30) {
      stalledMask = givenMask(board)
      return { status: 'target-stalled', feedback: { remainingCells: 5, deductions: 46 } }
    }
    if (stalledMask !== null && clues === 31 && (givenMask(board) & stalledMask) === stalledMask) {
      restored = true
    }
    return null
  })
  const result = generatePuzzle(
    createGenerationInput('classic', 'hard', 'restore-stalled-frontier'),
  )

  expect(result.status).toBe('ready')
  expect(restored).toBe(true)
})

it('feeds unnecessary variant rules back into exploration before publishing', () => {
  const fixture = VARIANT_FIXTURES.thermo
  scriptedSearch(undefined, fixture.rules, fixture.solution)
  const necessity = vi
    .spyOn(variantGeneration, 'variantRulesMatter')
    .mockReturnValueOnce({ status: 'complete', matters: false })
    .mockReturnValue({ status: 'complete', matters: true })
  const result = generatePuzzle(
    createGenerationInput('thermo', 'hard', 'necessity-before-delivery'),
  )

  expect(result.status).toBe('ready')
  expect(necessity.mock.calls.length).toBeGreaterThan(1)
  if (result.status !== 'ready') {
    throw new Error('Expected a rule-dependent completed candidate')
  }
  expect(necessity.mock.lastCall?.[0].givens).toEqual(result.puzzle.givens)
})

it('keeps an incomplete final necessity gate inconclusive without inventing consumed work', () => {
  const fixture = VARIANT_FIXTURES.thermo
  scriptedSearch(undefined, fixture.rules, fixture.solution)
  vi.spyOn(variantGeneration, 'variantRulesMatter').mockReturnValue({ status: 'budget-exhausted' })
  const result = generatePuzzle(createGenerationInput('thermo', 'hard', 'incomplete-final-gate'))

  expect(result).toMatchObject({ status: 'budget-exhausted', cause: 'work-limit' })
  expect(result).not.toHaveProperty('puzzle')
  expect(result.metrics.constructionWork).toBeLessThan(4000000)
})

it('finishes a costly progressing sweep before spending work on another layout', () => {
  const mocks = scriptedSearch()
  const original = vi.mocked(rating.prepareAssessmentWithComputation).getMockImplementation()
  if (!original) {
    throw new Error('Missing typed screening fixture')
  }
  vi.mocked(rating.prepareAssessmentWithComputation).mockImplementation((computation, limits) => {
    const owner = original(computation, limits)
    return {
      ...owner,
      screenTarget(board, target, budget) {
        if (!consumeWork(budget, 20000)) {
          return { status: 'budget-exhausted', cause: 'work-limit' }
        }
        return owner.screenTarget(board, target, budget)
      },
    }
  })
  const result = generatePuzzle(createGenerationInput('classic', 'hard', 'costly-progress'))

  expect(result.status).toBe('ready')
  expect(result.metrics.layouts).toBe(1)
  expect(mocks.finish).toHaveBeenCalledTimes(1)
})
