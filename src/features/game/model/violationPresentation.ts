import type { ReadonlyContract, RuleViolation } from '@/sudoku/contracts'

/** Rust reports constraint facts; player-facing language belongs to the game presentation. */
export function violationMessage(violation: ReadonlyContract<RuleViolation>): string {
  const code = violation.code
  switch (code.kind) {
    case 'duplicate':
      return '同一行、列、宫、区域、对角线或笼中的数字不能重复。'
    case 'cage-total':
      return `第${code.index + 1}个笼内数字不能重复，总和必须为${code.sum}。`
    case 'thermo-order':
      return `第${code.index + 1}支温度计的数字必须从圆头开始严格递增。`
    case 'arrow-total':
      return `第${code.index + 1}条箭头上的数字总和必须等于圆圈内数字。`
  }
}
