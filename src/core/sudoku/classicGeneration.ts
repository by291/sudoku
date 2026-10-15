import type { WorkBudget } from '@/core/sudoku/budget'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules'
import { constructUnitTerminal } from '@/core/sudoku/terminalConstruction'
import type { TerminalConstructionResult } from '@/core/sudoku/terminalConstruction'

/** Consumes the supplied seeded stream and node budget; never exposes an incomplete grid. */
export function constructClassicTerminal(
  random: () => number,
  budget: WorkBudget,
): TerminalConstructionResult {
  return constructUnitTerminal(CLASSIC_CONTEXT, random, budget)
}
