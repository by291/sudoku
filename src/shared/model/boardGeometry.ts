import type { PuzzleRules, RulesFor, SudokuVariant } from '@/core/sudoku/rules'
import { isCellIndex } from '@/core/sudoku/board'

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
  return `第${Math.floor(cell / 9) + 1}行第${(cell % 9) + 1}列`
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
        { kind: 'diagonal', cells: Array.from({ length: 9 }, (_, index) => index * 10) },
        { kind: 'diagonal', cells: Array.from({ length: 9 }, (_, index) => (index + 1) * 8) },
      )

      return { boundaries: [], clues: clues }
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

      const regions = Array<number>(81)
      rules.regions.forEach((cells, region) =>
        cells.forEach((cell) => {
          regions[cell] = region
        }),
      )

      for (let cell = 0; cell < 81; cell++) {
        if (cell % 9 < 8 && regions[cell] !== regions[cell + 1]) {
          boundaries.push({ cell, edge: 'right' })
        }

        if (cell < 72 && regions[cell] !== regions[cell + 9]) {
          boundaries.push({ cell, edge: 'bottom' })
        }
      }

      return { boundaries: boundaries, clues: [] }
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

      return { boundaries: [], clues: clues }
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
        clues.push({ kind: 'thermo', id: `thermo:${index}`, cells }),
      )

      return { boundaries: [], clues: clues }
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

      return { boundaries: [], clues: clues }
    },
    describeCell(cell, rules) {
      return rules.arrows.flatMap((arrow, index) =>
        arrow.circle === cell || arrow.shaft.includes(cell)
          ? [
              `箭头${index + 1}：箭杆${arrow.shaft.length}格的总和等于圆圈${position(arrow.circle)}的数字；当前是${arrow.circle === cell ? '圆圈' : '箭杆'}，标准规则允许时箭杆可重复。`,
            ]
          : [],
      )
    },
  },
} satisfies { [K in SudokuVariant]: VariantBoardAdapter<K> }

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

export function getCellRuleContext(cell: number, rules: PuzzleRules): string {
  return getSelectedRuleDescriptions(cell, rules).join(' ')
}

/** Inset each outside edge while joining across adjacent cells in the same cage. */
export function getCageOutline(cells: readonly number[]): string {
  const cage = new Set(cells)
  const inset = 0.09
  const lines: string[] = []

  for (const cell of cells) {
    const x = cell % 9
    const y = Math.floor(cell / 9)
    const left = x > 0 && cage.has(cell - 1)
    const right = x < 8 && cage.has(cell + 1)
    const top = y > 0 && cage.has(cell - 9)
    const bottom = y < 8 && cage.has(cell + 9)
    const x1 = x + (left ? 0 : inset)
    const x2 = x + 1 - (right ? 0 : inset)
    const y1 = y + (top ? 0 : inset)
    const y2 = y + 1 - (bottom ? 0 : inset)
    if (!top) {
      lines.push(`M${x1},${y1}H${x2}`)
    }

    if (!bottom) {
      lines.push(`M${x1},${y2}H${x2}`)
    }

    if (!left) {
      lines.push(`M${x1},${y1}V${y2}`)
    }

    if (!right) {
      lines.push(`M${x2},${y1}V${y2}`)
    }
  }

  return lines.join(' ')
}
