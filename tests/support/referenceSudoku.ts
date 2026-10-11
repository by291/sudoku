// Algorithm X covers four independent constraints per placement. This oracle imports no engine code.
export function countReferenceSolutions(board: readonly number[], limit: number): number {
  if (board.length !== 81 || limit < 1) throw new Error('Invalid reference input')
  const assignments: number[][] = []
  for (let cell = 0; cell < 81; cell++) {
    const row = Math.floor(cell / 9)
    const column = cell % 9
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3)
    for (let digit = 1; digit <= 9; digit++) {
      if (board[cell] !== 0 && board[cell] !== digit) continue
      assignments.push([
        cell,
        81 + row * 9 + digit - 1,
        162 + column * 9 + digit - 1,
        243 + box * 9 + digit - 1,
      ])
    }
  }
  const columns = new Map<number, Set<number>>()
  for (let constraint = 0; constraint < 324; constraint++) columns.set(constraint, new Set())
  assignments.forEach((constraints, id) => {
    for (const constraint of constraints) columns.get(constraint)?.add(id)
  })
  let found = 0
  function cover(remaining: Map<number, Set<number>>): void {
    if (found >= limit) return
    if (!remaining.size) {
      found++
      return
    }
    let candidates: Set<number> | null = null
    for (const rows of remaining.values())
      if (candidates === null || rows.size < candidates.size) candidates = rows
    if (candidates === null || candidates.size === 0) return
    for (const assignment of candidates) {
      const selected = assignments[assignment]
      const excluded = new Set<number>()
      for (const constraint of selected)
        for (const id of remaining.get(constraint) ?? []) excluded.add(id)
      const next = new Map<number, Set<number>>()
      for (const [constraint, rows] of remaining) {
        if (selected.includes(constraint)) continue
        next.set(constraint, new Set([...rows].filter((id) => !excluded.has(id))))
      }
      cover(next)
      if (found >= limit) return
    }
  }
  cover(columns)
  return found
}
