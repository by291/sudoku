import { isSudokuVariant } from '@/sudoku/catalogue'
import { SUDOKU_VARIANTS } from '@/sudoku/catalogue'
import type { SudokuVariant } from '@/sudoku/contracts'
import type { ParseResult } from '@/sudoku/contracts'

export type VariantPresentation = { label: string; ruleText: string }

export const VARIANT_PRESENTATION = {
  classic: { label: '标准数独', ruleText: '每行、每列、每个九宫格都填入 1–9，不能重复。' },
  diagonal: { label: '对角数独', ruleText: '遵循标准规则，两条主对角线也各填入 1–9，不能重复。' },
  jigsaw: {
    label: '不规则数独',
    ruleText: '每行、每列和每个粗线围成的不规则区域各填入 1–9；不使用普通九宫格。',
  },
  killer: {
    label: '杀手数独',
    ruleText: '遵循标准规则。虚线笼内数字不能重复，合计等于左上角的总数。',
  },
  thermo: { label: '温度计数独', ruleText: '遵循标准规则。数字从温度计圆球到末端严格递增。' },
  arrow: {
    label: '箭头数独',
    ruleText: '遵循标准规则。箭杆上的数字之和等于圆圈内的数字；标准规则允许时，箭杆数字可以重复。',
  },
} satisfies Record<SudokuVariant, VariantPresentation>

export function getVariantPresentation(variant: SudokuVariant): VariantPresentation {
  return VARIANT_PRESENTATION[variant]
}

export const VARIANT_OPTIONS = SUDOKU_VARIANTS.map((value) => ({
  value,
  label: getVariantPresentation(value).label,
}))

export function parseVariantQuery(value: unknown): ParseResult<SudokuVariant> {
  if (value === undefined) {
    return { valid: true, value: 'classic' }
  }

  return isSudokuVariant(value)
    ? { valid: true, value }
    : { valid: false, issues: ['Unknown or ambiguous Sudoku variant'] }
}

export type GameTransition =
  | { status: 'ready' }
  | { status: 'blocked'; reason: 'save' | 'ownership' | 'load' | 'generation' }
  | { status: 'cancelled' }
