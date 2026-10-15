import { calculateBaseCandidates, maskOf, PEERS } from '@/core/sudoku/board'
import type { RuleContext } from '@/core/sudoku/rules/types'
import type { Board } from '@/core/sudoku/types'
import type { LogicalStep } from '@/core/sudoku/logic/types'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules/context'
import type { PreparedConstraintSupport } from '@/core/sudoku/constraints/types'
import type { LogicalWorkspace } from '@/core/sudoku/logic/types'

export function createLogicalWorkspace(
  board: Board,
  context: RuleContext = CLASSIC_CONTEXT,
  support?: PreparedConstraintSupport,
): LogicalWorkspace {
  // Cage exclusion is emitted as an explained step, rather than hidden initialization.
  const base = context.rules.kind === 'killer' ? CLASSIC_CONTEXT : context

  return {
    board: [...board],
    candidates: [...calculateBaseCandidates(board, base)],
    context,
    support,
    premises: [],
    // Never carry deductions or support snapshots into another trial clue mask.
    cageSupportMemo: new Map(),
  }
}

export function applyLogicalStep(state: LogicalWorkspace, step: LogicalStep): void {
  if (step.kind === 'elimination') {
    for (const removal of step.removals) {
      state.candidates[removal.cell] &= ~maskOf(removal.digit)
    }

    if (
      step.evidence.kind === 'cage' ||
      step.evidence.kind === 'thermo' ||
      step.evidence.kind === 'arrow'
    ) {
      state.premises.push(step.evidence)
    }

    return
  }

  state.board[step.cell] = step.digit
  state.candidates[step.cell] = 0
  const peers =
    state.context.rules.kind === 'classic'
      ? PEERS[step.cell]
      : [
          ...new Set(
            state.context.units
              .filter((unit) => unit.cells.includes(step.cell))
              .flatMap((unit) => unit.cells),
          ),
        ]

  for (const peer of peers) {
    state.candidates[peer] &= ~maskOf(step.digit)
  }

  state.premises = []
}
