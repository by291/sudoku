import { isSudokuVariant } from '@/core/sudoku/rules'
import type { SudokuVariant } from '@/core/sudoku/rules'
import type { ParseResult } from '@/core/sudoku/types'

export const VARIANT_NAMES: Record<SudokuVariant, string> = {
  classic: '标准数独',
  diagonal: '对角数独',
  jigsaw: '不规则数独',
  killer: '杀手数独',
  thermo: '温度计数独',
  arrow: '箭头数独',
}
export const VARIANT_OPTIONS: readonly { label: string; value: SudokuVariant }[] = [
  { label: VARIANT_NAMES.classic, value: 'classic' },
  { label: VARIANT_NAMES.diagonal, value: 'diagonal' },
  { label: VARIANT_NAMES.jigsaw, value: 'jigsaw' },
  { label: VARIANT_NAMES.killer, value: 'killer' },
  { label: VARIANT_NAMES.thermo, value: 'thermo' },
  { label: VARIANT_NAMES.arrow, value: 'arrow' },
]
export const VARIANT_RULE_TEXT: Record<SudokuVariant, string> = {
  classic: '每行、每列、每个九宫格都填入 1–9，不能重复。',
  diagonal: '遵循标准规则，两条主对角线也各填入 1–9，不能重复。',
  jigsaw: '每行、每列和每个粗线围成的不规则区域各填入 1–9；不使用普通九宫格。',
  killer: '遵循标准规则。虚线笼内数字不能重复，合计等于左上角的总数。',
  thermo: '遵循标准规则。数字从温度计圆球到末端严格递增。',
  arrow: '遵循标准规则。箭杆上的数字之和等于圆圈内的数字；标准规则允许时，箭杆数字可以重复。',
}
export function parseVariantQuery(value: unknown): ParseResult<SudokuVariant> {
  if (value === undefined) return { valid: true, value: 'classic' }
  return isSudokuVariant(value)
    ? { valid: true, value }
    : { valid: false, issues: ['Unknown or ambiguous Sudoku variant'] }
}
export type GameTransition =
  | { status: 'ready' }
  | { status: 'blocked'; reason: 'save' | 'ownership' | 'load' | 'generation' }
  | { status: 'cancelled' }
