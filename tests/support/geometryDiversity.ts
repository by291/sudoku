import type { PuzzleRules } from '@/sudoku/contracts'

/** Canonical geometry ignores clue numbering, given masks and arithmetic totals, but preserves directed paths. */
export function geometrySignature(rules: PuzzleRules): string {
  const signatures: string[] = []
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    function cellMap(cell: number): number {
      let row = Math.floor(cell / 9)
      let column = cell % 9
      if (symmetry >= 4) {
        column = 8 - column
      }
      for (let turn = 0; turn < symmetry % 4; turn++) {
        const previousRow = row
        row = column
        column = 8 - previousRow
      }
      return row * 9 + column
    }
    const normalizeGroups = (groups: readonly (readonly number[])[]) =>
      groups
        .map((group) => [...group].sort((a, b) => a - b).join(','))
        .sort()
        .join('|')
    if (rules.kind === 'classic' || rules.kind === 'diagonal') {
      signatures.push(rules.kind)
    } else if (rules.kind === 'jigsaw') {
      signatures.push(normalizeGroups(rules.regions.map((cells) => cells.map(cellMap))))
    } else if (rules.kind === 'killer') {
      signatures.push(normalizeGroups(rules.cages.map(({ cells }) => cells.map(cellMap))))
    } else if (rules.kind === 'thermo') {
      for (const reverse of [false, true]) {
        signatures.push(
          rules.paths
            .map((path) => {
              const mapped = path.map(cellMap)
              return (reverse ? mapped.reverse() : mapped).join(',')
            })
            .sort()
            .join('|'),
        )
      }
    } else {
      signatures.push(
        rules.arrows
          .map(({ circle, shaft }) => `${cellMap(circle)}:${shaft.map(cellMap).join(',')}`)
          .sort()
          .join('|'),
      )
    }
  }
  return `${rules.kind}:${signatures.sort()[0]}`
}
