import type { PuzzleRules, RulesFor, SudokuVariant } from '@/sudoku/contracts'
import { BOARD_SIZE, UNIT_SIZE, isCellIndex } from '@/sudoku/values'

const CAGE_BORDER_INSET = 0.09

export type BoardEdge = { cell: number; edge: 'top' | 'right' | 'bottom' | 'left' }

export type BoardClue =
  | { kind: 'diagonal'; cells: readonly number[] }
  | { kind: 'cage'; id: string; cells: readonly number[]; anchor: number; sum: number }
  | { kind: 'thermo'; id: string; cells: readonly number[] }
  | { kind: 'arrow'; id: string; circle: number; shaft: readonly number[] }

export type BoardGeometry = { boundaries: readonly BoardEdge[]; clues: readonly BoardClue[] }

export type VariantBoardAdapter<K extends SudokuVariant> = {
  geometry(rules: RulesFor<K>): BoardGeometry
  describeCell(cell: number, rules: RulesFor<K>): readonly string[]
}

function position(cell: number): string {
  return `第${Math.floor(cell / UNIT_SIZE) + 1}行第${(cell % UNIT_SIZE) + 1}列`
}

export const VARIANT_BOARD_ADAPTERS = {
  classic: {
    geometry() {
      return { boundaries: [], clues: [] }
    },
    describeCell() {
      return []
    },
  },
  diagonal: {
    geometry() {
      const clues: BoardClue[] = []
      clues.push(
        {
          kind: 'diagonal',
          cells: Array.from({ length: UNIT_SIZE }, (_, index) => index * (UNIT_SIZE + 1)),
        },
        {
          kind: 'diagonal',
          cells: Array.from({ length: UNIT_SIZE }, (_, index) => (index + 1) * (UNIT_SIZE - 1)),
        },
      )

      return { boundaries: [], clues }
    },
    describeCell(cell, rules) {
      return getBoardGeometry(rules).clues.flatMap((clue, index) =>
        clue.kind === 'diagonal' && clue.cells.includes(cell)
          ? [`主对角线${index + 1}：填入 1–9，不能重复。`]
          : [],
      )
    },
  },
  jigsaw: {
    geometry(rules) {
      const boundaries: BoardEdge[] = []

      const regions = Array<number>(BOARD_SIZE)
      rules.regions.forEach((cells, region) =>
        cells.forEach((cell) => {
          regions[cell] = region
        }),
      )

      // Draw each shared edge once, from its upper or left cell.
      for (let cell = 0; cell < BOARD_SIZE; cell++) {
        if (cell % UNIT_SIZE < UNIT_SIZE - 1 && regions[cell] !== regions[cell + 1]) {
          boundaries.push({ cell, edge: 'right' })
        }

        if (cell < BOARD_SIZE - UNIT_SIZE && regions[cell] !== regions[cell + UNIT_SIZE]) {
          boundaries.push({ cell, edge: 'bottom' })
        }
      }

      return { boundaries, clues: [] }
    },
    describeCell(cell, rules) {
      return rules.regions.flatMap((cells, index) =>
        cells.includes(cell) ? [`不规则区域${index + 1}：这九格填入 1–9，不能重复。`] : [],
      )
    },
  },
  killer: {
    geometry(rules) {
      const clues: BoardClue[] = []
      rules.cages.forEach((cage, index) =>
        clues.push({
          kind: 'cage',
          id: `cage:${index}`,
          cells: cage.cells,
          anchor: Math.min(...cage.cells),
          sum: cage.sum,
        }),
      )

      return { boundaries: [], clues }
    },
    describeCell(cell, rules) {
      return rules.cages.flatMap((cage, index) =>
        cage.cells.includes(cell)
          ? [`笼${index + 1}：${cage.cells.length}格的总和为 ${cage.sum}，数字不能重复。`]
          : [],
      )
    },
  },
  thermo: {
    geometry(rules) {
      const clues: BoardClue[] = []
      rules.paths.forEach((cells, index) =>
        clues.push({
          kind: 'thermo',
          id: `thermo:${index}`,
          cells,
        }),
      )

      return { boundaries: [], clues }
    },
    describeCell(cell, rules) {
      return rules.paths.flatMap((cells, index) =>
        cells.includes(cell)
          ? [
              `温度计${index + 1}：从圆球${position(cells[0])}到末端${position(cells.at(-1) ?? cells[0])}严格递增；当前是第${cells.indexOf(cell) + 1}格，共${cells.length}格。`,
            ]
          : [],
      )
    },
  },
  arrow: {
    geometry(rules) {
      const clues: BoardClue[] = []
      rules.arrows.forEach((arrow, index) =>
        clues.push({
          kind: 'arrow',
          id: `arrow:${index}`,
          circle: arrow.circle,
          shaft: arrow.shaft,
        }),
      )

      return { boundaries: [], clues }
    },
    describeCell(cell, rules) {
      return rules.arrows.flatMap((arrow, index) => {
        const isCircle = arrow.circle === cell
        if (!isCircle && !arrow.shaft.includes(cell)) {
          return []
        }

        const role = isCircle ? '圆圈' : '箭杆'
        return [
          `箭头${index + 1}：箭杆${arrow.shaft.length}格的总和等于圆圈${position(arrow.circle)}的数字；当前是${role}，标准规则允许时箭杆可重复。`,
        ]
      })
    },
  },
} satisfies { [K in SudokuVariant]: VariantBoardAdapter<K> }

/** Build the visual boundaries and clues for a checked rule layout. */
export function getBoardGeometry(rules: PuzzleRules): BoardGeometry {
  switch (rules.kind) {
    case 'classic':
      return VARIANT_BOARD_ADAPTERS.classic.geometry()
    case 'diagonal':
      return VARIANT_BOARD_ADAPTERS.diagonal.geometry()
    case 'jigsaw':
      return VARIANT_BOARD_ADAPTERS.jigsaw.geometry(rules)
    case 'killer':
      return VARIANT_BOARD_ADAPTERS.killer.geometry(rules)
    case 'thermo':
      return VARIANT_BOARD_ADAPTERS.thermo.geometry(rules)
    case 'arrow':
      return VARIANT_BOARD_ADAPTERS.arrow.geometry(rules)
  }
}

/** Describe only the rules that affect the selected cell. */
export function getSelectedRuleDescriptions(cell: number, rules: PuzzleRules): readonly string[] {
  if (!isCellIndex(cell)) {
    return []
  }

  switch (rules.kind) {
    case 'classic':
      return VARIANT_BOARD_ADAPTERS.classic.describeCell()
    case 'diagonal':
      return VARIANT_BOARD_ADAPTERS.diagonal.describeCell(cell, rules)
    case 'jigsaw':
      return VARIANT_BOARD_ADAPTERS.jigsaw.describeCell(cell, rules)
    case 'killer':
      return VARIANT_BOARD_ADAPTERS.killer.describeCell(cell, rules)
    case 'thermo':
      return VARIANT_BOARD_ADAPTERS.thermo.describeCell(cell, rules)
    case 'arrow':
      return VARIANT_BOARD_ADAPTERS.arrow.describeCell(cell, rules)
  }
}

/** Join the selected cell rule descriptions for its accessible label. */
export function getCellRuleContext(cell: number, rules: PuzzleRules): string {
  return getSelectedRuleDescriptions(cell, rules).join(' ')
}

/** Inset each outside edge while joining across adjacent cells in the same cage. */
export function getCageOutline(cells: readonly number[]): string {
  const cage = new Set(cells)
  const lines: string[] = []

  for (const cell of cells) {
    const column = cell % UNIT_SIZE
    const row = Math.floor(cell / UNIT_SIZE)
    const hasLeftNeighbor = column > 0 && cage.has(cell - 1)
    const hasRightNeighbor = column < UNIT_SIZE - 1 && cage.has(cell + 1)
    const hasTopNeighbor = row > 0 && cage.has(cell - UNIT_SIZE)
    const hasBottomNeighbor = row < UNIT_SIZE - 1 && cage.has(cell + UNIT_SIZE)

    const leftEdge = column + (hasLeftNeighbor ? 0 : CAGE_BORDER_INSET)
    const rightEdge = column + 1 - (hasRightNeighbor ? 0 : CAGE_BORDER_INSET)
    const topEdge = row + (hasTopNeighbor ? 0 : CAGE_BORDER_INSET)
    const bottomEdge = row + 1 - (hasBottomNeighbor ? 0 : CAGE_BORDER_INSET)

    if (!hasTopNeighbor) {
      lines.push(`M${leftEdge},${topEdge}H${rightEdge}`)
    }

    if (!hasBottomNeighbor) {
      lines.push(`M${leftEdge},${bottomEdge}H${rightEdge}`)
    }

    if (!hasLeftNeighbor) {
      lines.push(`M${leftEdge},${topEdge}V${bottomEdge}`)
    }

    if (!hasRightNeighbor) {
      lines.push(`M${rightEdge},${topEdge}V${bottomEdge}`)
    }
  }

  return lines.join(' ')
}
