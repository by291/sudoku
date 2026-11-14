import type { Board, CellValue, Digit } from '@/sudoku/contracts'
import type { PuzzleRules } from '@/sudoku/contracts'

/** Count variant solutions independently of production compilation and support propagation. */
export function referenceCountSolutions(
  board: Board,
  rules: PuzzleRules,
  options: {
    maxSolutions?: 1 | 2
    domains?: readonly (readonly number[])[]
  } = {},
): { count: 0 | 1 | 2; solution: Board | null } {
  const { maxSolutions = 2, domains } = options
  const grid: CellValue[] = [...board]
  const groups: number[][] = []
  for (let i = 0; i < 9; i++) {
    groups.push(Array.from({ length: 9 }, (_, j) => i * 9 + j))
    groups.push(Array.from({ length: 9 }, (_, j) => j * 9 + i))
    if (rules.kind !== 'jigsaw') {
      groups.push(
        Array.from(
          { length: 9 },
          (_, j) => Math.floor(i / 3) * 27 + (i % 3) * 3 + Math.floor(j / 3) * 9 + (j % 3),
        ),
      )
    }
  }

  if (rules.kind === 'jigsaw') {
    groups.push(...rules.regions.map((region) => [...region]))
  }
  if (rules.kind === 'diagonal') {
    groups.push(
      Array.from({ length: 9 }, (_, i) => i * 10),
      Array.from({ length: 9 }, (_, i) => (i + 1) * 8),
    )
  }
  if (rules.kind === 'killer') {
    groups.push(...rules.cages.map((cage) => [...cage.cells]))
  }

  // prettier-ignore
  const digits: readonly Digit[] = [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
  ]
  const memberships = Array.from({ length: 81 }, (_, cell) =>
    groups.filter((group) => group.includes(cell)),
  )

  function hasThermoSpacing(path: readonly number[]): boolean {
    for (let i = 0; i < path.length; i++) {
      const value = grid[path[i]]
      if (value === 0) {
        continue
      }
      if (value <= i || value > 9 - (path.length - i - 1)) {
        return false
      }

      for (let j = i + 1; j < path.length; j++) {
        const laterValue = grid[path[j]]
        if (laterValue !== 0 && laterValue - value < j - i) {
          return false
        }
      }
    }

    return true
  }

  function consistent(changedCell?: number): boolean {
    for (const group of changedCell === undefined ? groups : memberships[changedCell]) {
      const filled = group.map((cell) => grid[cell]).filter((digit) => digit !== 0)
      if (new Set(filled).size !== filled.length) {
        return false
      }
    }

    if (rules.kind === 'killer') {
      for (const cage of rules.cages.filter(
        (cage) => changedCell === undefined || cage.cells.includes(changedCell),
      )) {
        const total = cage.cells.reduce((sum, cell) => sum + grid[cell], 0)
        const remaining = cage.cells.filter((cell) => grid[cell] === 0).length
        if (total + remaining > cage.sum || total + remaining * 9 < cage.sum) {
          return false
        }
      }
    }

    if (rules.kind === 'thermo') {
      const affectedPaths = rules.paths.filter(
        (path) => changedCell === undefined || path.includes(changedCell),
      )
      if (!affectedPaths.every(hasThermoSpacing)) {
        return false
      }
    }

    if (rules.kind === 'arrow') {
      for (const arrow of rules.arrows.filter(
        (arrow) =>
          changedCell === undefined ||
          arrow.circle === changedCell ||
          arrow.shaft.includes(changedCell),
      )) {
        const circle = grid[arrow.circle]
        const total = arrow.shaft.reduce((sum, cell) => sum + grid[cell], 0)
        const remaining = arrow.shaft.filter((cell) => grid[cell] === 0).length
        if (total + remaining > (circle || 9) || (circle !== 0 && total + remaining * 9 < circle)) {
          return false
        }
      }
    }

    return true
  }

  let count: 0 | 1 | 2 = 0
  let solution: Board | null = null
  let domainVisits = 0

  function checkUnitCoverage(cellChoices: readonly (readonly Digit[])[]) {
    let forced: { cell: number; digit: Digit } | null = null
    const completeUnits = groups.filter((group) => group.length === 9)

    for (const group of completeUnits) {
      for (const digit of digits) {
        if (group.some((cell) => grid[cell] === digit)) {
          continue
        }
        const locations = group.filter(
          (cell) => grid[cell] === 0 && cellChoices[cell].includes(digit),
        )
        if (!locations.length) {
          return { possible: false } as const
        }
        if (locations.length === 1) {
          forced = { cell: locations[0], digit }
        }
      }
    }

    return { possible: true, forced } as const
  }

  function visit(): void {
    if (domains && ++domainVisits > 2000) {
      throw new Error('Independent candidate search budget exhausted')
    }
    if (count >= maxSolutions) {
      return
    }
    let target = -1
    let choices: readonly Digit[] = digits
    const cellChoices: (readonly Digit[])[] = Array.from({ length: 81 }, () => [])
    for (let cell = 0; cell < 81; cell++) {
      if (grid[cell] !== 0) {
        continue
      }
      const candidates = digits.filter((digit) => {
        if (domains && !domains[cell].includes(digit)) {
          return false
        }
        grid[cell] = digit
        const allowed = consistent(cell)
        grid[cell] = 0
        return allowed
      })
      cellChoices[cell] = candidates
      if (!candidates.length) {
        return
      }
      if (target === -1 || candidates.length < choices.length) {
        target = cell
        choices = candidates
      }
      if (choices.length === 1 && !domains) {
        break
      }
    }
    if (domains && target !== -1) {
      // Check all required digits before branching so an impossible unit prunes this state.
      const coverage = checkUnitCoverage(cellChoices)
      if (!coverage.possible) {
        return
      }
      if (coverage.forced) {
        target = coverage.forced.cell
        choices = [coverage.forced.digit]
      }
    }
    if (target === -1) {
      count = count === 0 ? 1 : 2
      solution ??= [...grid]
      return
    }
    for (const digit of choices) {
      grid[target] = digit
      visit()
      grid[target] = 0
      if (count >= maxSolutions) {
        return
      }
    }
  }
  if (consistent()) {
    visit()
  }
  return { count, solution }
}
