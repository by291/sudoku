const BOARD_SIZE = 81
const UNIT_SIZE = 9
const BOX_SIZE = 3
const ROW_OFFSET = BOARD_SIZE
const COLUMN_OFFSET = ROW_OFFSET + BOARD_SIZE
const BOX_OFFSET = COLUMN_OFFSET + BOARD_SIZE
const CONSTRAINT_COUNT = BOX_OFFSET + BOARD_SIZE

/** Count solutions using independent exact cover with four constraints per placement. */
export function countReferenceSolutions(board: readonly number[], limit: number): number {
  if (board.length !== BOARD_SIZE || limit < 1) {
    throw new Error('Invalid reference input')
  }

  const assignments: number[][] = []
  for (let cell = 0; cell < BOARD_SIZE; cell++) {
    const row = Math.floor(cell / UNIT_SIZE)
    const column = cell % UNIT_SIZE
    const box = Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(column / BOX_SIZE)
    for (let digit = 1; digit <= UNIT_SIZE; digit++) {
      if (board[cell] !== 0 && board[cell] !== digit) {
        continue
      }
      assignments.push([
        cell,
        ROW_OFFSET + row * UNIT_SIZE + digit - 1,
        COLUMN_OFFSET + column * UNIT_SIZE + digit - 1,
        BOX_OFFSET + box * UNIT_SIZE + digit - 1,
      ])
    }
  }

  const columns = new Map<number, Set<number>>()
  for (let constraint = 0; constraint < CONSTRAINT_COUNT; constraint++) {
    columns.set(constraint, new Set())
  }
  assignments.forEach((constraints, id) => {
    for (const constraint of constraints) {
      columns.get(constraint)?.add(id)
    }
  })

  let found = 0
  function cover(remaining: Map<number, Set<number>>): void {
    if (found >= limit) {
      return
    }
    if (!remaining.size) {
      found++
      return
    }
    let candidates: Set<number> | null = null
    // Choose the tightest constraint first, preserving insertion order for ties.
    for (const rows of remaining.values()) {
      if (candidates === null || rows.size < candidates.size) {
        candidates = rows
      }
    }
    if (candidates === null || candidates.size === 0) {
      return
    }
    for (const assignment of candidates) {
      const selected = assignments[assignment]
      const excluded = new Set<number>()
      for (const constraint of selected) {
        for (const id of remaining.get(constraint) ?? []) {
          excluded.add(id)
        }
      }

      // Each branch owns its reduced cover, so rejected assignments cannot change siblings.
      const next = new Map<number, Set<number>>()
      for (const [constraint, rows] of remaining) {
        if (selected.includes(constraint)) {
          continue
        }
        next.set(constraint, new Set([...rows].filter((id) => !excluded.has(id))))
      }
      cover(next)
      if (found >= limit) {
        return
      }
    }
  }

  cover(columns)

  return found
}
