// Own clue-space exploration only. Logical state and rule geometry belong to the layout's evaluators.
import { parseBoard } from '@/core/sudoku/board'
import { consumeWork, withWorkStage } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import type { TargetFeedback } from '@/core/sudoku/rating'
import { shuffle } from '@/core/sudoku/random'
import { BOARD_SIZE } from '@/core/sudoku/types'
import type { Board, Difficulty } from '@/core/sudoku/types'

export type GivenMask = bigint

const FULL_GIVEN_MASK = (1n << BigInt(BOARD_SIZE)) - 1n
const CELLS = Array.from({ length: BOARD_SIZE }, (_, cell) => cell)
const CELL_BITS = CELLS.map((cell) => 1n << BigInt(cell))
const TIER_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 } as const

export const GENERATION_SEARCH_BOUNDS = Object.freeze({
  activeLayouts: 2,
  checkpoints: 8,
  seenMasks: 4096,
  proposals: 32,
  stagnation: 8,
})

type CheckpointIdentity = { layoutId: number; mask: GivenMask; feedback: TargetFeedback }

export type CandidateCheckpoint = CheckpointIdentity &
  (
    | { kind: 'solved'; difficulty: Difficulty; exact: 'unchecked' | 'unique' }
    | { kind: 'stalled'; exact: 'unknown' | 'unique' }
  )

export type CandidateProposal = {
  kind: 'remove' | 'restore' | 'exchange'
  mask: GivenMask
  intermediates: readonly GivenMask[]
}

export type CandidateFrontier = {
  retain(checkpoint: CandidateCheckpoint): boolean
  next(random: () => number, budget: WorkBudget): CandidateProposal | null
  recordEvaluation(improved: boolean): void
  readonly seenCount: number
  readonly checkpointCount: number
  readonly stagnant: boolean
  readonly exhausted: boolean
}

type FrontierEntry = {
  checkpoint: CandidateCheckpoint
  cursor: number
  order: readonly number[] | null
  present: readonly number[] | null
  missing: readonly number[] | null
  sweepCursor: number
}

function validateMask(mask: GivenMask): void {
  if (mask < 0n || mask > FULL_GIVEN_MASK) {
    throw new RangeError('Given mask must contain only cells 0 through 80')
  }
}

export function givenMask(board: Board): GivenMask {
  if (!parseBoard(board).valid) {
    throw new TypeError('Invalid candidate board')
  }

  return board.reduce((mask, digit, cell) => (digit === 0 ? mask : mask | CELL_BITS[cell]), 0n)
}

export function materializeCandidate(terminal: Board, mask: GivenMask): Board {
  validateMask(mask)
  if (!parseBoard(terminal).valid || terminal.some((digit) => digit === 0)) {
    throw new TypeError('Candidate terminal must be complete')
  }

  return terminal.map((digit, cell) => ((mask & CELL_BITS[cell]) === 0n ? 0 : digit))
}

function clueCount(mask: GivenMask): number {
  let count = 0
  for (let remaining = mask; remaining !== 0n; remaining &= remaining - 1n) {
    count++
  }

  return count
}

function compareCheckpoints(
  left: CandidateCheckpoint,
  right: CandidateCheckpoint,
  target: Difficulty,
): number {
  if (left.kind === 'solved' && right.kind === 'solved') {
    const leftDistance = Math.abs(TIER_ORDER[target] - TIER_ORDER[left.difficulty])
    const rightDistance = Math.abs(TIER_ORDER[target] - TIER_ORDER[right.difficulty])
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }
    // Both derivations are complete: extra deductions are workload, not further progress.
    // After tier/completion ties, prefer the deeper clue search even if its trace got shorter.
    return (
      left.feedback.remainingCells - right.feedback.remainingCells ||
      clueCount(left.mask) - clueCount(right.mask) ||
      right.feedback.deductions - left.feedback.deductions
    )
  }
  if (
    left.kind === 'stalled' &&
    right.kind === 'stalled' &&
    left.feedback.remainingCells !== right.feedback.remainingCells
  ) {
    return left.feedback.remainingCells - right.feedback.remainingCells
  }
  if (left.feedback.deductions !== right.feedback.deductions) {
    return right.feedback.deductions - left.feedback.deductions
  }

  return clueCount(left.mask) - clueCount(right.mask)
}

function neighboringProposal(entry: FrontierEntry, budget: WorkBudget): CandidateProposal | null {
  const { checkpoint, cursor, order, present, missing } = entry
  if (!order || !present || !missing) {
    throw new Error('Missing seeded candidate edit order')
  }
  const intermediateMasks: GivenMask[] = []
  let mask = checkpoint.mask

  function edit(cell: number, restore: boolean): boolean {
    if (!consumeWork(budget)) {
      return false
    }
    intermediateMasks.push(mask)
    mask = restore ? mask | CELL_BITS[cell] : mask & ~CELL_BITS[cell]
    return true
  }

  let sweepCell: number | undefined
  if (checkpoint.kind === 'solved' && (cursor < 24 || missing.length === 0)) {
    while (entry.sweepCursor < order.length) {
      const cell = order[entry.sweepCursor++]
      if ((checkpoint.mask & CELL_BITS[cell]) !== 0n) {
        sweepCell = cell
        break
      }
    }
  }
  let kind: CandidateProposal['kind']
  if (sweepCell !== undefined) {
    kind = 'remove'
    if (!edit(sweepCell, false)) {
      return null
    }
  } else if (
    missing.length > 0 &&
    ((checkpoint.kind === 'stalled' && cursor % 3 !== 2) || present.length === 0)
  ) {
    kind = 'restore'
    if (!edit(missing[cursor % missing.length], true)) {
      return null
    }
  } else if (missing.length > 0 && present.length > 0) {
    kind = 'exchange'
    const restores = cursor % 2 === 0 && missing.length > 1 ? 2 : 1
    for (let index = 0; index < restores; index++) {
      if (!edit(missing[(cursor + index) % missing.length], true)) {
        return null
      }
    }
    const removals =
      checkpoint.kind === 'stalled'
        ? Math.max(1, restores - 1)
        : Math.min(present.length, restores + 1)
    for (let index = 0; index < removals; index++) {
      if (!edit(present[(cursor + index) % present.length], false)) {
        return null
      }
    }
  } else {
    return null
  }

  // Intermediate masks describe executed edits, not logical proofs. The scheduler chooses screens.
  return { kind, mask, intermediates: intermediateMasks.slice(1) }
}

export function createCandidateFrontier(
  layoutId: number,
  terminal: Board,
  target: Difficulty,
): CandidateFrontier {
  materializeCandidate(terminal, FULL_GIVEN_MASK)
  const seen = new Set<GivenMask>()
  let entries: FrontierEntry[] = []
  let sweepEntry: FrontierEntry | null = null
  let pendingMask: GivenMask | null = null
  let pendingParent: FrontierEntry | null = null
  let pendingKind: CandidateProposal['kind'] | null = null
  let nonImproving = 0
  let selections = 0

  return {
    retain(checkpoint) {
      validateMask(checkpoint.mask)
      if (checkpoint.layoutId !== layoutId) {
        throw new TypeError('Checkpoint belongs to a different layout')
      }
      if (
        seen.size >= GENERATION_SEARCH_BOUNDS.seenMasks ||
        (seen.has(checkpoint.mask) && checkpoint.mask !== pendingMask) ||
        entries.some((entry) => entry.checkpoint.mask === checkpoint.mask)
      ) {
        return false
      }
      // Continue a removal lineage's remaining sweep. Restores/exchanges start another
      // order because adding clues can make earlier rejected removals useful again.
      const inherited =
        checkpoint.mask === pendingMask && pendingKind === 'remove' ? pendingParent : null
      pendingMask = null
      pendingParent = null
      pendingKind = null
      seen.add(checkpoint.mask)
      // Closed checkpoints cannot propose again; novelty lives separately in `seen`.
      // Keeping them in the bounded pool would crowd out viable lower-ranked children.
      entries = entries.filter((entry) => entry.cursor < GENERATION_SEARCH_BOUNDS.proposals)
      const previousBest = entries
        .filter((entry) => entry.checkpoint.kind === checkpoint.kind)
        .sort((a, b) => compareCheckpoints(a.checkpoint, b.checkpoint, target))[0]
      const improved =
        !previousBest || compareCheckpoints(checkpoint, previousBest.checkpoint, target) < 0
      const retained: FrontierEntry = {
        checkpoint: { ...checkpoint, feedback: { ...checkpoint.feedback } },
        cursor: 0,
        order: inherited?.order ?? null,
        sweepCursor: inherited?.sweepCursor ?? 0,
        present: null,
        missing: null,
      }
      entries.push(retained)
      const continuingSweep = inherited !== null && checkpoint.kind === 'solved'
      if (continuingSweep) {
        sweepEntry = retained
      }
      const solved = entries
        .filter((entry) => entry.checkpoint.kind === 'solved')
        .sort((a, b) => compareCheckpoints(a.checkpoint, b.checkpoint, target))
      const stalled = entries
        .filter((entry) => entry.checkpoint.kind === 'stalled')
        .sort((a, b) => compareCheckpoints(a.checkpoint, b.checkpoint, target))
      const reserved = GENERATION_SEARCH_BOUNDS.checkpoints / 2
      const solvedCapacity = Math.max(
        reserved,
        GENERATION_SEARCH_BOUNDS.checkpoints - stalled.length,
      )
      const stalledCapacity = Math.max(
        reserved,
        GENERATION_SEARCH_BOUNDS.checkpoints - solved.length,
      )
      const retainedSolved = solved.slice(0, solvedCapacity)
      // Human tiers are not monotonic under clue removal. Keep the ordinary solved
      // lineage in one existing slot so a temporary tier decrease cannot cut its sweep short.
      if (sweepEntry && !retainedSolved.includes(sweepEntry)) {
        retainedSolved[retainedSolved.length - 1] = sweepEntry
      }
      entries = [...retainedSolved, ...stalled.slice(0, stalledCapacity)]

      return improved || continuingSweep
    },
    next(random, budget) {
      return withWorkStage(budget, 'proposals', () => {
        while (seen.size < GENERATION_SEARCH_BOUNDS.seenMasks) {
          const eligible = entries.filter(
            (entry) => entry.cursor < GENERATION_SEARCH_BOUNDS.proposals,
          )
          if (eligible.length === 0 || !consumeWork(budget)) {
            return null
          }
          const desired = selections++ % 2 === 0 ? 'solved' : 'stalled'
          const pool = eligible.filter((entry) => entry.checkpoint.kind === desired)
          const ranked = (pool.length > 0 ? pool : eligible).sort((a, b) =>
            compareCheckpoints(a.checkpoint, b.checkpoint, target),
          )
          const best = ranked[0]
          if (!best) {
            throw new Error('Missing candidate checkpoint')
          }
          const tied = ranked.filter(
            (entry) => compareCheckpoints(entry.checkpoint, best.checkpoint, target) === 0,
          )
          if (
            sweepEntry &&
            (!eligible.includes(sweepEntry) || sweepEntry.sweepCursor >= BOARD_SIZE)
          ) {
            sweepEntry = null
          }
          const selected = sweepEntry ?? tied[Math.floor(random() * tied.length)]
          if (!selected.order) {
            selected.order = shuffle(CELLS, random)
          }
          if (!selected.present || !selected.missing) {
            selected.present = selected.order.filter(
              (cell) => (selected.checkpoint.mask & CELL_BITS[cell]) !== 0n,
            )
            selected.missing = selected.order.filter(
              (cell) => (selected.checkpoint.mask & CELL_BITS[cell]) === 0n,
            )
          }
          const proposal = neighboringProposal(selected, budget)
          selected.cursor++
          if (!proposal || seen.has(proposal.mask)) {
            if (budget.used >= budget.limit) {
              return null
            }
            continue
          }
          pendingMask = proposal.mask
          pendingParent = selected
          pendingKind = proposal.kind
          seen.add(proposal.mask)

          return proposal
        }

        return null
      })
    },
    recordEvaluation(improved) {
      nonImproving = improved ? 0 : nonImproving + 1
    },
    get seenCount() {
      return seen.size
    },
    get checkpointCount() {
      return entries.length
    },
    get stagnant() {
      return nonImproving >= GENERATION_SEARCH_BOUNDS.stagnation
    },
    get exhausted() {
      return (
        seen.size >= GENERATION_SEARCH_BOUNDS.seenMasks ||
        entries.every((entry) => entry.cursor >= GENERATION_SEARCH_BOUNDS.proposals)
      )
    },
  }
}
