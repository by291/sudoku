import { expect, it } from 'vitest'
import {
  createCandidateFrontier,
  givenMask,
  materializeCandidate,
  GENERATION_SEARCH_BOUNDS,
} from '@/core/sudoku/generationCandidates'
import type { CandidateCheckpoint } from '@/core/sudoku/generationCandidates'
import { createWorkBudget } from '@/core/sudoku/budget'
import { seededRandom } from '@/core/sudoku/random'
import { solvedBoard } from '../../../tests/fixtures/sudoku'

const full = (1n << 81n) - 1n

function checkpoint(
  mask: bigint,
  kind: 'solved' | 'stalled' = 'solved',
  layoutId = 0,
): CandidateCheckpoint {
  const shared = {
    layoutId,
    mask,
    feedback: {
      remainingCells: kind === 'solved' ? 0 : 10,
      deductions: 81 - materializeCandidate(solvedBoard, mask).filter(Boolean).length,
    },
  }

  return kind === 'solved'
    ? { ...shared, kind, difficulty: 'medium', exact: 'unchecked' }
    : { ...shared, kind, exact: 'unknown' }
}

it('owns 81-bit masks and materializes terminal-consistent cells at both ends', () => {
  const source = [...solvedBoard]
  const board = materializeCandidate(source, 1n | (1n << 80n))
  const mask = givenMask(board)
  source.fill(0)

  expect(mask).toBe(1n | (1n << 80n))
  expect(board[0]).toBe(5)
  expect(board[80]).toBe(9)
  expect(board.filter(Boolean)).toHaveLength(2)
  expect(() => materializeCandidate(solvedBoard, -1n)).toThrow(RangeError)
  expect(() => materializeCandidate(solvedBoard, 1n << 81n)).toThrow(RangeError)
})

it('never revisits proposals or transfers a checkpoint across layout ownership', () => {
  const owner = createCandidateFrontier(0, solvedBoard, 'hard')
  const random = seededRandom('novel-candidates')
  owner.retain(checkpoint(full))
  expect(() => owner.retain(checkpoint(full, 'solved', 1))).toThrow(TypeError)
  const seen = new Set([full])

  for (let index = 0; index < 32; index++) {
    const proposal = owner.next(random, createWorkBudget(1000))
    expect(proposal).not.toBeNull()
    if (!proposal) {
      throw new Error('Expected one novel neighboring proposal')
    }
    expect(seen.has(proposal.mask)).toBe(false)
    seen.add(proposal.mask)
    for (const mask of [...proposal.intermediates, proposal.mask]) {
      expect(
        materializeCandidate(solvedBoard, mask).every(
          (digit, cell) => digit === 0 || digit === solvedBoard[cell],
        ),
      ).toBe(true)
    }
  }
  expect(owner.next(random, createWorkBudget(1000))).toBeNull()
  expect(owner.exhausted).toBe(true)
})

it('retains eight owned checkpoints with space for both solved and stalled states', () => {
  const owner = createCandidateFrontier(0, solvedBoard, 'expert')
  for (let index = 0; index < 16; index++) {
    owner.retain(checkpoint(BigInt(index + 1), index < 8 ? 'solved' : 'stalled'))
  }

  expect(owner.checkpointCount).toBe(8)
  expect(owner.seenCount).toBe(16)
  expect(GENERATION_SEARCH_BOUNDS).toEqual({
    activeLayouts: 2,
    checkpoints: 8,
    seenMasks: 4096,
    proposals: 32,
    stagnation: 8,
  })
  const random = seededRandom('both-frontier-kinds')
  const kinds = new Set<string>()
  for (let index = 0; index < 256; index++) {
    const proposal = owner.next(random, createWorkBudget(1000))
    if (!proposal) {
      break
    }
    kinds.add(proposal.kind)
  }
  expect(kinds.has('remove')).toBe(true)
  expect(kinds.has('restore')).toBe(true)
})

it('uses tier and logical progress before clue-count tie breaks', () => {
  const owner = createCandidateFrontier(0, solvedBoard, 'expert')
  const low = checkpoint(1n)
  const high = { ...checkpoint(full), difficulty: 'hard' as const }
  owner.retain(low)
  expect(owner.retain(high)).toBe(true)
  const proposal = owner.next(seededRandom('ranked-hard'), createWorkBudget(1000))

  expect(proposal?.kind).toBe('remove')
  expect(proposal && materializeCandidate(solvedBoard, proposal.mask).filter(Boolean)).toHaveLength(
    80,
  )
})

it('retires novelty at 4096 masks without evicting and revisiting old identities', () => {
  const owner = createCandidateFrontier(0, solvedBoard, 'hard')
  for (let index = 0; index < 4096; index++) {
    owner.retain(checkpoint(BigInt(index), 'stalled'))
  }

  expect(owner.seenCount).toBe(4096)
  expect(owner.exhausted).toBe(true)
  expect(owner.next(seededRandom('retired'), createWorkBudget(1000))).toBeNull()
  expect(owner.seenCount).toBe(4096)
})

it('counts evaluated stagnation and never publishes edits after failed charging', () => {
  const owner = createCandidateFrontier(0, solvedBoard, 'hard')
  owner.retain(checkpoint(full))
  for (let index = 0; index < 7; index++) {
    owner.recordEvaluation(false)
  }
  expect(owner.stagnant).toBe(false)
  owner.recordEvaluation(false)
  expect(owner.stagnant).toBe(true)
  owner.recordEvaluation(true)
  expect(owner.stagnant).toBe(false)

  expect(owner.next(seededRandom('no-work'), createWorkBudget(0))).toBeNull()
  expect(owner.seenCount).toBe(1)
  expect(materializeCandidate(solvedBoard, full)).toEqual(solvedBoard)
})

it('lends unused pool capacity without allowing an evicted mask to become novel again', () => {
  const owner = createCandidateFrontier(0, solvedBoard, 'hard')
  for (let index = 1; index <= 7; index++) {
    owner.retain(checkpoint(BigInt(index)))
  }
  owner.retain(checkpoint(8n, 'stalled'))

  expect(owner.checkpointCount).toBe(8)
  owner.retain(checkpoint(9n, 'stalled'))
  expect(owner.retain(checkpoint(1n))).toBe(false)
  expect(owner.seenCount).toBe(9)
})

it('ranks stalled checkpoints by remaining cells before total deductions', () => {
  const owner = createCandidateFrontier(0, solvedBoard, 'hard')
  owner.retain({
    ...checkpoint(full & ~31n, 'stalled'),
    feedback: { remainingCells: 3, deductions: 1 },
  })
  owner.retain({
    ...checkpoint(full & ~((1n << 30n) - 1n), 'stalled'),
    feedback: { remainingCells: 10, deductions: 50 },
  })
  const proposal = owner.next(seededRandom('stalled-progress'), createWorkBudget(1000))

  expect(proposal?.kind).toBe('restore')
  expect(proposal && materializeCandidate(solvedBoard, proposal.mask).filter(Boolean)).toHaveLength(
    77,
  )
})
