import { applyLogicalStep, createLogicalWorkspace } from '@/core/sudoku/logic/workspace'
import { isAdvancedEvidence } from '@/core/sudoku/logic/techniques'
import type { LogicalStep, Technique } from '@/core/sudoku/logic/types'
import { RATING_POLICIES, TECHNIQUE_TIERS } from '@/core/sudoku/rating/policies'
import type { Board, ParseResult } from '@/core/sudoku/types'
import type { RuleContext } from '@/core/sudoku/rules/types'
import { isCellIndex, maskOf } from '@/core/sudoku/board'
import type { ReasoningWorkload } from '@/core/sudoku/rating/types'

export function emptyTechniqueCounts(): Record<Technique, number> {
  return {
    'naked-single': 0,
    'hidden-single': 0,
    'locked-candidate': 0,
    'naked-pair': 0,
    'hidden-pair': 0,
    'naked-triple': 0,
    'hidden-triple': 0,
    'x-wing': 0,
    swordfish: 0,
    'xy-wing': 0,
    'simple-coloring': 0,
    'cage-distinct': 0,
    'cage-remainder': 0,
    'cage-combination': 0,
    'thermo-bound': 0,
    'arrow-equation': 0,
    'arrow-combination': 0,
  }
}

function hasVariantEvidence(step: LogicalStep): boolean {
  const evidence = step.evidence
  if (isAdvancedEvidence(evidence)) {
    return false
  }
  if (evidence.kind !== 'unit') {
    return true
  }

  return (
    evidence.premises.length > 0 ||
    evidence.unit.kind === 'region' ||
    evidence.unit.kind === 'diagonal' ||
    (evidence.units?.some((unit) => unit.kind === 'region' || unit.kind === 'diagonal') ?? false)
  )
}

/** Replay effective actions; deduction soundness remains the detector's separate responsibility. */
export function summarizeLogicalTrace(
  board: Board,
  context: RuleContext,
  steps: readonly LogicalStep[],
): ParseResult<ReasoningWorkload> {
  const state = createLogicalWorkspace(board, context)
  const techniqueCounts = emptyTechniqueCounts()
  const order = RATING_POLICIES[context.rules.kind].expert
  let placements = 0
  let eliminations = 0
  let candidateRemovals = 0
  let variantSteps = 0
  let highestTechnique: Technique | null = null

  for (const step of steps) {
    if (!order.includes(step.technique)) {
      return { valid: false, issues: ['Trace uses an inapplicable technique'] }
    }

    if (step.kind === 'placement') {
      if (
        !isCellIndex(step.cell) ||
        state.board[step.cell] !== 0 ||
        (state.candidates[step.cell] & maskOf(step.digit)) === 0
      ) {
        return { valid: false, issues: ['Trace placement does not change a supported empty cell'] }
      }

      placements++
    } else {
      const removed = new Set<string>()
      if (!step.removals.length) {
        return { valid: false, issues: ['Trace contains an empty elimination'] }
      }

      for (const { cell, digit } of step.removals) {
        const key = `${cell}:${digit}`
        if (
          !isCellIndex(cell) ||
          state.board[cell] !== 0 ||
          removed.has(key) ||
          (state.candidates[cell] & maskOf(digit)) === 0
        ) {
          return { valid: false, issues: ['Trace contains a duplicate or ineffective removal'] }
        }

        removed.add(key)
      }

      eliminations++
      candidateRemovals += removed.size
    }

    applyLogicalStep(state, step)
    techniqueCounts[step.technique]++
    if (hasVariantEvidence(step)) {
      variantSteps++
    }
    if (
      highestTechnique === null ||
      order.indexOf(step.technique) > order.indexOf(highestTechnique)
    ) {
      highestTechnique = step.technique
    }
  }

  return {
    valid: true,
    value: {
      steps: steps.length,
      placements,
      eliminations,
      candidateRemovals,
      techniqueCounts,
      highestTechnique,
      highestTier: highestTechnique === null ? null : TECHNIQUE_TIERS[highestTechnique],
      variantSteps,
    },
  }
}
