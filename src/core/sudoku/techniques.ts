import type { Unit } from '@/core/sudoku/board'
import type { Board, Digit, NoteMask } from '@/core/sudoku/types'
import { UNIT_SIZE } from '@/core/sudoku/types'

export type Technique =
  'naked-single' | 'hidden-single' | 'locked-candidate' | 'naked-pair' | 'hidden-pair'
export type LogicalState = { board: Board; candidates: readonly NoteMask[] }
export type LogicalStep = {
  technique: Technique
  evidence: { unit: Unit; cells: readonly number[]; digits: readonly Digit[] }
} & (
  | { kind: 'placement'; cell: number; digit: Digit }
  | { kind: 'elimination'; removals: readonly { cell: number; digit: Digit }[] }
)
export const TECHNIQUES: readonly Technique[] = [
  'naked-single',
  'hidden-single',
  'locked-candidate',
  'naked-pair',
  'hidden-pair',
]
export const TECHNIQUE_NAMES: Record<Technique, string> = {
  'naked-single': '唯一候选数',
  'hidden-single': '单元唯一数',
  'locked-candidate': '区块排除',
  'naked-pair': '显性数对',
  'hidden-pair': '隐性数对',
}
export function explainStep(step: LogicalStep): string {
  const unitName = { row: '行', column: '列', box: '宫' }[step.evidence.unit.kind]
  const cells = step.evidence.cells
    .map((cell) => `第${Math.floor(cell / UNIT_SIZE) + 1}行第${(cell % UNIT_SIZE) + 1}列`)
    .join('、')
  const digits = step.evidence.digits.join('、')
  const reasons: Record<Technique, string> = {
    'naked-single': `${cells}只剩下候选数${digits}，因此可以确定这个数字`,
    'hidden-single': `数字${digits}在这个单元中只有${cells}这一个可用位置`,
    'locked-candidate': `数字${digits}只能出现在${cells}，这些格子也集中在同一行、列或宫，所以可以排除该交叉单元外高亮位置的${digits}`,
    'naked-pair': `${cells}都只有候选数${digits}，这两个数字必须占据这两个格子，所以同一单元的其他格子不能再填${digits}`,
    'hidden-pair': `数字${digits}在这个单元中只能占据${cells}这两个位置，所以这两个格子的其他候选数可以排除`,
  }
  return `${TECHNIQUE_NAMES[step.technique]}：第${step.evidence.unit.index + 1}${unitName}中，${reasons[step.technique]}。`
}
