import type { Unit } from '@/sudoku/contracts'
import { digitsIn } from '@/shared/model/sudokuPresentation'
import { UNIT_SIZE } from '@/sudoku/values'
import type {
  BasicClassicTechnique,
  AdvancedEvidence,
  Technique,
  LogicalStep,
} from '@/sudoku/contracts'
import {
  TECHNIQUES,
  isClassicTechnique,
  isAdvancedTechnique,
  isAdvancedEvidence,
} from '@/sudoku/catalogue'

export const TECHNIQUE_NAMES: Record<Technique, string> = {
  'naked-single': '唯一候选数',
  'hidden-single': '单元唯一数',
  'locked-candidate': '区块排除',
  'naked-pair': '显性数对',
  'hidden-pair': '隐性数对',
  'naked-triple': '显性三数组',
  'hidden-triple': '隐性三数组',
  'x-wing': 'X-Wing',
  swordfish: '剑鱼',
  'xy-wing': 'XY-Wing',
  'simple-coloring': '简单着色',
  'cage-distinct': '笼内排除',
  'cage-remainder': '笼内余数',
  'cage-combination': '笼内组合',
  'thermo-bound': '温度计范围',
  'arrow-equation': '箭头求和',
  'arrow-combination': '箭头组合',
}

function cellPosition(cell: number): string {
  return `第${Math.floor(cell / UNIT_SIZE) + 1}行第${(cell % UNIT_SIZE) + 1}列`
}

function advancedReason(evidence: AdvancedEvidence): string {
  switch (evidence.kind) {
    case 'subset':
      return evidence.hidden
        ? '这三个数字在单元中仅能占据这三格，排除三格内的其他候选数'
        : '三格的候选数合计只有三个数字，排除单元其他格中的这三个数字'
    case 'fish':
      return '这些行（或列）的该数字位置仅覆盖相同数量的列（或行），排除覆盖单元的其他位置'
    case 'wing':
      return '枢轴的两种取值分别迫使一翼取共同数字，因此同时看到两翼的格不能取该数字'
    case 'coloring':
      return evidence.mode === 'wrap'
        ? '强链两种颜色交替；同色格互相看到，该颜色不成立'
        : '此格同时看到强链的两种颜色，无论哪种颜色成立都不能取该数字'
  }
}

export function explainStepEvidence(step: LogicalStep): readonly string[] {
  const evidence = step.evidence
  if (evidence.kind === 'unit') {
    return []
  }

  if (isAdvancedEvidence(evidence)) {
    const details = evidence.domains
      .filter(({ cell, mask }) => evidence.cells.includes(cell) && mask !== 0)
      .map(({ cell, mask }) => `${cellPosition(cell)}：${digitsIn(mask).join('、')}`)
    if (evidence.kind === 'fish') {
      const unitLabel = (unit: Unit) => `第${unit.index + 1}${unit.kind === 'row' ? '行' : '列'}`
      details.unshift(
        `基础单元：${evidence.bases.map(unitLabel).join('、')}`,
        `覆盖单元：${evidence.covers.map(unitLabel).join('、')}`,
      )
    }
    if (evidence.kind === 'wing') {
      details.unshift(
        `枢轴：${cellPosition(evidence.pivot)}；两翼：${evidence.wings.map(cellPosition).join('、')}`,
      )
    }
    if (evidence.kind === 'coloring') {
      details.unshift(
        `颜色 A：${evidence.colors[0].map(cellPosition).join('、')}`,
        `颜色 B：${evidence.colors[1].map(cellPosition).join('、')}`,
      )
      details.push(
        ...evidence.links.map(
          ({ cells }) =>
            `${cellPosition(cells[0])} ↔ ${cellPosition(cells[1])}：数字${evidence.digits[0]}恰有两个位置`,
        ),
      )
    }

    return details
  }

  if (evidence.kind === 'thermo') {
    return evidence.bounds.map(
      ({ cell, min, max }) =>
        `${cellPosition(cell)}（从圆头起第${evidence.path.indexOf(cell) + 1}格，共${evidence.path.length}格）：${min === max ? min : `${min}–${max}`}`,
    )
  }

  const details = evidence.domains.map(({ cell, mask }) => {
    let label = ''
    if (evidence.kind === 'arrow') {
      label = cell === evidence.circle ? '圆圈' : '箭杆'
    }

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
  if (isAdvancedEvidence(evidence)) {
    const reason = advancedReason(evidence)
    const conclusion =
      step.kind === 'elimination'
        ? step.removals.map(({ cell, digit }) => `${cellPosition(cell)}排除${digit}`).join('；')
        : ''
    return `${TECHNIQUE_NAMES[step.technique]}：${reason}。${conclusion}。`
  }
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
    let reason: string
    if (evidence.kind === 'cage') {
      reason = `笼内数字不能重复，总和为${evidence.sum}`
    } else if (evidence.kind === 'thermo') {
      reason = '温度计从圆头开始严格递增，各格必须留出后续数字的位置'
    } else {
      reason = '箭头上的数字总和等于圆圈内数字'
    }

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
  const reasons: Record<BasicClassicTechnique, string> = {
    'naked-single': `${cells}只剩下候选数${digits}，因此可以确定这个数字`,
    'hidden-single': `数字${digits}在这个单元中只有${cells}这一个可用位置`,
    'locked-candidate': `数字${digits}只能出现在${cells}，这些格子也集中在同一行、列或宫，所以可以排除该交叉单元外高亮位置的${digits}`,
    'naked-pair': `${cells}都只有候选数${digits}，这两个数字必须占据这两个格子，所以同一单元的其他格子不能再填${digits}`,
    'hidden-pair': `数字${digits}在这个单元中只能占据${cells}这两个位置，所以这两个格子的其他候选数可以排除`,
  }
  const premises = evidence.premises.map((premise) => {
    if (premise.kind === 'cage') {
      return `笼总和${premise.sum}及不重复限制`
    }
    if (premise.kind === 'thermo') {
      return '温度计递增限制'
    }

    return '箭头求和限制'
  })

  if (evidence.units?.some((unit) => unit.kind === 'diagonal')) {
    premises.push('对角线不重复限制')
  }

  if (evidence.units?.some((unit) => unit.kind === 'region')) {
    premises.push('不规则区域不重复限制')
  }

  const prefix = premises.length ? `结合${[...new Set(premises)].join('、')}，` : ''
  const reason =
    TECHNIQUES.some((technique) => technique === step.technique) &&
    !isAdvancedTechnique(step.technique) &&
    isClassicTechnique(step.technique)
      ? reasons[step.technique]
      : '候选范围受到当前规则限制'

  return `${prefix}${TECHNIQUE_NAMES[step.technique]}：第${evidence.unit.index + 1}${unitName}中，${reason}。`
}
