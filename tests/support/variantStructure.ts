import type { Board } from '@/core/sudoku/types'
import type { PuzzleRules } from '@/core/sudoku/rules/types'

function touches(first: number, second: number, diagonal = false): boolean {
  const rows = Math.abs(Math.floor(first / 9) - Math.floor(second / 9))
  const columns = Math.abs((first % 9) - (second % 9))
  return diagonal ? Math.max(rows, columns) === 1 : rows + columns === 1
}

function connected(cells: readonly number[]): boolean {
  const visited = new Set([cells[0]])
  const pending = [cells[0]]
  while (pending.length) {
    const current = pending.pop()
    if (current === undefined) {
      break
    }
    for (const cell of cells) {
      if (!visited.has(cell) && touches(current, cell)) {
        visited.add(cell)
        pending.push(cell)
      }
    }
  }
  return visited.size === cells.length
}

/** Independent topology and terminal oracle; imports no production parser or compiler. */
export function structureIssues(solution: Board, rules: PuzzleRules): readonly string[] {
  const issues: string[] = []
  const validCells = (cells: readonly number[]) =>
    cells.length > 0 &&
    new Set(cells).size === cells.length &&
    cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 81)
  const unit = (cells: readonly number[]) =>
    cells.length === 9 &&
    validCells(cells) &&
    new Set(cells.map((cell) => solution[cell])).size === 9
  if (
    solution.length !== 81 ||
    solution.some((value) => !Number.isInteger(value) || value < 1 || value > 9)
  ) {
    return ['Invalid complete board']
  }
  for (let index = 0; index < 9; index++) {
    if (
      !unit(Array.from({ length: 9 }, (_, offset) => index * 9 + offset)) ||
      !unit(Array.from({ length: 9 }, (_, offset) => offset * 9 + index))
    ) {
      issues.push('Invalid row or column')
    }
    if (
      rules.kind !== 'jigsaw' &&
      !unit(
        Array.from(
          { length: 9 },
          (_, offset) =>
            Math.floor(index / 3) * 27 +
            (index % 3) * 3 +
            Math.floor(offset / 3) * 9 +
            (offset % 3),
        ),
      )
    ) {
      issues.push('Invalid box')
    }
  }
  if (
    rules.kind === 'diagonal' &&
    (!unit(Array.from({ length: 9 }, (_, cell) => cell * 10)) ||
      !unit(Array.from({ length: 9 }, (_, cell) => (cell + 1) * 8)))
  ) {
    issues.push('Invalid diagonals')
  }
  if (rules.kind === 'jigsaw' || rules.kind === 'killer') {
    const groups = rules.kind === 'jigsaw' ? rules.regions : rules.cages.map((cage) => cage.cells)
    if (
      groups.flat().length !== 81 ||
      new Set(groups.flat()).size !== 81 ||
      groups.some((cells) => !validCells(cells) || !connected(cells))
    ) {
      issues.push('Invalid connected partition')
    }
    if (rules.kind === 'jigsaw') {
      if (groups.length !== 9 || !groups.every(unit)) {
        issues.push('Invalid regional units')
      }
      const regularBoxes = groups.every(
        (cells) =>
          new Set(cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)))
            .size === 1,
      )
      if (regularBoxes) {
        issues.push('Jigsaw geometry is regular boxes')
      }
    } else if (
      rules.cages.some(
        ({ cells, sum }) =>
          new Set(cells.map((cell) => solution[cell])).size !== cells.length ||
          cells.reduce((total, cell) => total + solution[cell], 0) !== sum,
      )
    ) {
      issues.push('Invalid cage digits or total')
    }
  }
  const ordered = (path: readonly number[]) =>
    validCells(path) &&
    path.length >= 2 &&
    path.length <= 9 &&
    path.slice(1).every((cell, index) => touches(path[index], cell, true))
  if (
    rules.kind === 'thermo' &&
    (!rules.paths.length ||
      rules.paths.some(
        (path) =>
          !ordered(path) ||
          path.slice(1).some((cell, index) => solution[cell] <= solution[path[index]]),
      ))
  ) {
    issues.push('Invalid increasing path')
  }
  if (
    rules.kind === 'arrow' &&
    (!rules.arrows.length ||
      rules.arrows.some(
        ({ circle, shaft }) =>
          !ordered([circle, ...shaft]) ||
          shaft.length < 2 ||
          shaft.reduce((sum, cell) => sum + solution[cell], 0) !== solution[circle],
      ))
  ) {
    issues.push('Invalid arrow geometry or sum')
  }
  return issues
}
