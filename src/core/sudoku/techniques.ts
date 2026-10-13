import type { Unit } from '@/core/sudoku/board'
import { digitsIn } from '@/core/sudoku/board'
import type { Board, Digit, NoteMask } from '@/core/sudoku/types'
import { UNIT_SIZE } from '@/core/sudoku/types'
import type { RuleContext } from '@/core/sudoku/rules'

export type ClassicTechnique =
  'naked-single' | 'hidden-single' | 'locked-candidate' | 'naked-pair' | 'hidden-pair'

export type Technique =
  | ClassicTechnique
  | 'cage-distinct'
  | 'cage-remainder'
  | 'cage-combination'
  | 'thermo-bound'
  | 'arrow-equation'
  | 'arrow-combination'

type ClueEvidence = { constraintId: string; cells: readonly number[]; digits: readonly Digit[] }

export type RuleEvidence = ClueEvidence &
  (
    | { kind: 'cage'; sum: number; domains: readonly { cell: number; mask: NoteMask }[] }
    | {
        kind: 'thermo'
        path: readonly number[]
        bounds: readonly { cell: number; min: Digit; max: Digit }[]
      }
    | {
        kind: 'arrow'
        circle: number
        shaft: readonly number[]
        domains: readonly { cell: number; mask: NoteMask }[]
      }
  )

export type LogicalState = {
  board: Board
  candidates: readonly NoteMask[]
  context?: RuleContext
  premises?: readonly RuleEvidence[]
}

export type LogicalStep = {
  technique: Technique
  evidence:
    | RuleEvidence
    | {
        kind: 'unit'
        unit: Unit
        cells: readonly number[]
        digits: readonly Digit[]
        premises: readonly RuleEvidence[]
        units?: readonly Unit[]
      }
} & (
  | { kind: 'placement'; cell: number; digit: Digit }
  | { kind: 'elimination'; removals: readonly { cell: number; digit: Digit }[] }
)

export const TECHNIQUES: readonly ClassicTechnique[] = [
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
  'cage-distinct': '笼内排除',
  'cage-remainder': '笼内余数',
  'cage-combination': '笼内组合',
  'thermo-bound': '温度计范围',
  'arrow-equation': '箭头求和',
  'arrow-combination': '箭头组合',
}

export function isClassicTechnique(value: Technique): value is ClassicTechnique {
  return TECHNIQUES.some((technique) => technique === value)
}

export function matchesRuleTechnique(technique: Technique, kind: RuleEvidence['kind']): boolean {
  switch (kind) {
    case 'cage':
      return technique.startsWith('cage-')
    case 'thermo':
      return technique === 'thermo-bound'
    case 'arrow':
      return technique.startsWith('arrow-')
  }
}

function cellPosition(cell: number): string {
  return `第${Math.floor(cell / UNIT_SIZE) + 1}行第${(cell % UNIT_SIZE) + 1}列`
}

export function explainStepEvidence(step: LogicalStep): readonly string[] {
  const evidence = step.evidence
  if (evidence.kind === 'unit') {
    return []
  }

  if (evidence.kind === 'thermo') {
    return evidence.bounds.map(
      ({ cell, min, max }) =>
        `${cellPosition(cell)}（从圆头起第${evidence.path.indexOf(cell) + 1}格，共${evidence.path.length}格）：${min === max ? min : `${min}–${max}`}`,
    )
  }

  const details = evidence.domains.map(({ cell, mask }) => {
    const label = evidence.kind === 'arrow' ? (cell === evidence.circle ? '圆圈' : '箭杆') : ''

    return `${label}${cellPosition(cell)}：${digitsIn(mask).join('、')}`
  })
  if (evidence.kind === 'cage') {
    details.unshift(`目标总和：${evidence.sum}`)
  }

  // These techniques guarantee one unknown; the other singleton domains are filled values.
  if (step.kind !== 'placement') {
    return details
  }

  const known = evidence.domains.filter(({ cell }) => cell !== step.cell)
  if (known.some(({ mask }) => digitsIn(mask).length !== 1)) {
    return details
  }

  const values = known.map(({ mask }) => digitsIn(mask)[0])
  if (evidence.kind === 'cage' && step.technique === 'cage-remainder') {
    details.unshift(`${[evidence.sum, ...values].join(' − ')} = ${step.digit}`)
  }

  if (evidence.kind === 'arrow' && step.technique === 'arrow-equation') {
    const circle = evidence.domains.find(({ cell }) => cell === evidence.circle)
    if (step.cell === evidence.circle) {
      details.unshift(`${values.join(' + ')} = ${step.digit}`)
    } else if (circle) {
      const shaftValues = known
        .filter(({ cell }) => cell !== evidence.circle)
        .map(({ mask }) => digitsIn(mask)[0])
      details.unshift(`${[digitsIn(circle.mask)[0], ...shaftValues].join(' − ')} = ${step.digit}`)
    }
  }

  return details
}

export function explainStep(step: LogicalStep): string {
  const evidence = step.evidence
  if (evidence.kind !== 'unit') {
    const conclusion =
      step.kind === 'placement'
        ? `${cellPosition(step.cell)}可以填${step.digit}`
        : [...new Set(step.removals.map(({ cell }) => cell))]
            .map(
              (cell) =>
                `${cellPosition(cell)}排除${step.removals
                  .filter((removal) => removal.cell === cell)
                  .map(({ digit }) => digit)
                  .join('、')}`,
            )
            .join('；')
    const reason =
      evidence.kind === 'cage'
        ? `笼内数字不能重复，总和为${evidence.sum}`
        : evidence.kind === 'thermo'
          ? `温度计从圆头开始严格递增，各格必须留出后续数字的位置`
          : '箭头上的数字总和等于圆圈内数字'
    const deduction =
      step.technique === 'cage-combination' || step.technique === 'arrow-combination'
        ? '检查下列范围内满足求和及行、列、宫不重复规则的组合后'
        : '结合下列数字范围'

    return `${TECHNIQUE_NAMES[step.technique]}：${reason}，${deduction}，${conclusion}。`
  }

  const unitName = { row: '行', column: '列', box: '宫', region: '区域', diagonal: '对角线' }[
    evidence.unit.kind
  ]
  const cells = step.evidence.cells
    .map((cell) => `第${Math.floor(cell / UNIT_SIZE) + 1}行第${(cell % UNIT_SIZE) + 1}列`)
    .join('、')
  const digits = step.evidence.digits.join('、')
  const reasons: Record<ClassicTechnique, string> = {
    'naked-single': `${cells}只剩下候选数${digits}，因此可以确定这个数字`,
    'hidden-single': `数字${digits}在这个单元中只有${cells}这一个可用位置`,
    'locked-candidate': `数字${digits}只能出现在${cells}，这些格子也集中在同一行、列或宫，所以可以排除该交叉单元外高亮位置的${digits}`,
    'naked-pair': `${cells}都只有候选数${digits}，这两个数字必须占据这两个格子，所以同一单元的其他格子不能再填${digits}`,
    'hidden-pair': `数字${digits}在这个单元中只能占据${cells}这两个位置，所以这两个格子的其他候选数可以排除`,
  }
  const premises = evidence.premises.map((premise) =>
    premise.kind === 'cage'
      ? `笼总和${premise.sum}及不重复限制`
      : premise.kind === 'thermo'
        ? '温度计递增限制'
        : '箭头求和限制',
  )
  if (evidence.units?.some((unit) => unit.kind === 'diagonal')) {
    premises.push('对角线不重复限制')
  }

  if (evidence.units?.some((unit) => unit.kind === 'region')) {
    premises.push('不规则区域不重复限制')
  }

  const prefix = premises.length ? `结合${[...new Set(premises)].join('、')}，` : ''
  const reason = isClassicTechnique(step.technique)
    ? reasons[step.technique]
    : '候选范围受到当前规则限制'

  return `${prefix}${TECHNIQUE_NAMES[step.technique]}：第${evidence.unit.index + 1}${unitName}中，${reason}。`
}
