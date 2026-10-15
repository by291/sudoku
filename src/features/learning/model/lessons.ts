import type { Board, Difficulty, NoteMask } from '@/core/sudoku/types'
import { EXAMPLES } from '@/features/learning/model/examples'
import { explainStep, TECHNIQUE_NAMES } from '@/features/game/model/techniquePresentation'
import type { BasicClassicTechnique } from '@/core/sudoku/logic/types'
import { CLASSIC_RULES } from '@/core/sudoku/rules/context'
import type { PuzzleRules, SudokuVariant } from '@/core/sudoku/rules/types'
import { getVariantPresentation } from '@/features/game/model/variants'
import { VARIANT_EXAMPLES, ARROW_TRANSFER_EXAMPLE } from '@/features/learning/model/variantExamples'
import { SUDOKU_VARIANTS } from '@/core/sudoku/rules/types'
import { COURSE_FRAGMENTS } from '@/features/learning/model/courseFragments'
import { transformStage, stageAnswer } from '@/features/learning/model/exerciseStages'
import type {
  ExerciseStage,
  LessonExercise,
  ExerciseAnswer,
} from '@/features/learning/model/exerciseStages'
import { LESSON_IDS } from '@/features/learning/model/lessonIds'

export type Exercise = ExerciseAnswer

export type Lesson = {
  id: string
  title: string
  introduction: string
  board: Board
  candidates: readonly NoteMask[]
  explanation: string
  exercise: Exercise
  practiceDifficulty: Difficulty
  rules: PuzzleRules
  practiceVariant: SudokuVariant
  guided: ExerciseStage
  exercises: readonly LessonExercise[]
}

type BaseLesson = Omit<Lesson, 'guided' | 'exercises'>

const introductions: Record<BasicClassicTechnique, string> = {
  'naked-single': '逐一排除同一行、列、宫里已出现的数字。如果只剩一个候选数，就可以落笔。',
  'hidden-single':
    '把注意力放在一个数字上：即使某格有多个候选数，这个数字也可能在整个单元里只有一个位置。',
  'locked-candidate':
    '观察行、列和宫的交叉。当一个数字在单元内的位置被锁定在交叉区，就能排除另一单元的其他位置。',
  'naked-pair': '如果同一单元中恰有两格都只剩相同的两个候选数，这两个数字就被这两格占住了。',
  'hidden-pair': '如果两个数字在一个单元里都只出现在相同的两格，这两格中的其他候选数就可以排除。',
}
const techniqueLessons = Object.entries(EXAMPLES).map(([id, example]): BaseLesson => {
  const step = example.step

  return {
    id,
    rules: CLASSIC_RULES,
    practiceVariant: 'classic',
    title: TECHNIQUE_NAMES[step.technique],
    introduction: introductions[step.technique],
    board: example.board,
    candidates: example.candidates,
    explanation: explainStep(step),
    exercise:
      step.kind === 'placement'
        ? { kind: 'placement', expected: { cell: step.cell, digit: step.digit } }
        : { kind: 'elimination', expected: step.removals },
    practiceDifficulty:
      step.technique === 'locked-candidate'
        ? 'medium'
        : step.technique.endsWith('pair')
          ? 'hard'
          : 'easy',
  }
})
const legacyLessons: readonly BaseLesson[] = [
  {
    id: 'rules',
    rules: CLASSIC_RULES,
    practiceVariant: 'classic',
    title: '认识数独',
    introduction:
      '在 9 × 9 的棋盘中填入 1–9。每一行、每一列、每个 3 × 3 宫中的数字都只能出现一次。题目给定的数字不能修改。',
    board: EXAMPLES['naked-single'].board,
    candidates: EXAMPLES['naked-single'].candidates,
    explanation:
      '先找只能填一个数字的位置。小数字是候选笔记，表示仍可考虑的数字；候选笔记本身不等于答案。' +
      explainStep(EXAMPLES['naked-single'].step),
    exercise: { kind: 'placement', expected: { cell: 40, digit: 5 } },
    practiceDifficulty: 'easy',
  },
  ...techniqueLessons.sort(
    (first, second) =>
      ['naked-single', 'hidden-single', 'locked-candidate', 'naked-pair', 'hidden-pair'].indexOf(
        first.id,
      ) -
      ['naked-single', 'hidden-single', 'locked-candidate', 'naked-pair', 'hidden-pair'].indexOf(
        second.id,
      ),
  ),
  ...SUDOKU_VARIANTS.flatMap((variant): BaseLesson[] => {
    if (variant === 'classic') {
      return []
    }

    const example = VARIANT_EXAMPLES[variant]

    return [
      {
        id: `${variant}-rules`,
        title: `认识${getVariantPresentation(variant).label}`,
        introduction: getVariantPresentation(variant).ruleText,
        rules: example.rules,
        practiceVariant: variant,
        board: example.board,
        candidates: example.candidates,
        explanation: explainStep(example.step),
        exercise: {
          kind: 'placement',
          expected: { cell: example.step.cell, digit: example.step.digit },
        },
        practiceDifficulty: 'easy',
      },
    ]
  }),
]

const additions: readonly {
  id: keyof typeof COURSE_FRAGMENTS
  title: string
  introduction: string
  difficulty: Difficulty
}[] = [
  {
    id: 'naked-triple',
    title: '显性三数组',
    introduction: '三格不必都有三个候选数；只要合起来恰好三个数字，它们就占住了这三格。',
    difficulty: 'expert',
  },
  {
    id: 'hidden-triple',
    title: '隐性三数组',
    introduction: '先追踪三个数字的位置。如果它们只出现在同一单元的三格，排除三格内其他候选数。',
    difficulty: 'expert',
  },
  {
    id: 'x-wing',
    title: 'X-Wing',
    introduction: '寻找同一数字在两行中的两个对应列；交换行列也成立。排除覆盖列中其余位置。',
    difficulty: 'expert',
  },
  {
    id: 'swordfish',
    title: '剑鱼',
    introduction: '三行的候选位置合计只占三列，三个数字必须在这三列中分配；每行不必有三个位置。',
    difficulty: 'expert',
  },
  {
    id: 'xy-wing',
    title: 'XY-Wing',
    introduction: '枢轴是 XY，两翼是 XZ 和 YZ，并且都能看到枢轴。两种情况都会让一翼成为 Z。',
    difficulty: 'expert',
  },
  {
    id: 'simple-coloring',
    title: '简单着色',
    introduction:
      '一个完整单元中同一数字恰有两处时，它们构成强链。交替标记两种颜色，检查同色冲突和同时看到两色的位置。',
    difficulty: 'expert',
  },
  {
    id: 'diagonal-singles',
    title: '对角线唯一数',
    introduction: '主对角线和反对角线也是完整的九数字单元。追踪数字在对角线中唯一的位置。',
    difficulty: 'easy',
  },
  {
    id: 'diagonal-intersections',
    title: '对角线与单元交叉',
    introduction:
      '当对角线中的候选位置集中在一行、列或宫的交叉部分，可以排除另一个单元的外部位置。',
    difficulty: 'medium',
  },
  {
    id: 'diagonal-combined',
    title: '综合对角线推理',
    introduction: '按顺序结合对角线与行、列、宫的候选限制。每次排除都改变下一阶段的候选范围。',
    difficulty: 'hard',
  },
  {
    id: 'jigsaw-singles',
    title: '区域唯一数',
    introduction: '每个区域恰有九格。沿真实区域边界寻找数字的唯一位置，不能沿传统宫格猜测。',
    difficulty: 'easy',
  },
  {
    id: 'jigsaw-intersections',
    title: '区域与行列交叉',
    introduction: '把区域的候选位置与一行或一列相交，检查是否能将一个数字锁在交叉位置。',
    difficulty: 'medium',
  },
  {
    id: 'jigsaw-combined',
    title: '综合区域推理',
    introduction: '保持真实区域边界，连续利用区域、行列和候选范围推理，每一步都要给出理由。',
    difficulty: 'hard',
  },
  {
    id: 'killer-remainder',
    title: '笼内余数与不重复',
    introduction: '用目标总和减去已填数字；笼内数字不能重复。笼通常不是包含 1–9 的完整单元。',
    difficulty: 'easy',
  },
  {
    id: 'killer-combinations',
    title: '笼内候选组合',
    introduction: '枚举当前候选范围内满足目标和、不重复以及行列宫限制的组合，再排除不支持的数字。',
    difficulty: 'medium',
  },
  {
    id: 'killer-combined',
    title: '笼与单元联合推理',
    introduction: '先由笼内算术缩小数字范围，再将这些限制带到行、列、宫，逐阶段完成联合排除。',
    difficulty: 'hard',
  },
  {
    id: 'thermo-bounds',
    title: '递增位置与范围',
    introduction: '从圆头开始严格递增，每个位置都要给前后格留出数字。已填值还能进一步收紧范围。',
    difficulty: 'easy',
  },
  {
    id: 'thermo-interactions',
    title: '路径与单元交互',
    introduction:
      '路径范围与行、列、宫的候选限制必须同时成立。检查填值和后续位置如何改变可用数字。',
    difficulty: 'medium',
  },
  {
    id: 'thermo-combined',
    title: '综合温度计推理',
    introduction: '按顺序收紧有序路径范围，再用普通单元推理；不能把温度计直接当作九数字单元。',
    difficulty: 'hard',
  },
  {
    id: 'arrow-equations',
    title: '直接求和等式',
    introduction:
      '已知圆圈和箭杆其余数字时，可以用加法或减法求唯一未知数；箭杆重复仍受行列宫限制。',
    difficulty: 'easy',
  },
  {
    id: 'arrow-combinations',
    title: '圆圈与箭杆组合',
    introduction:
      '用当前数字范围枚举满足等式的圆圈和箭杆组合。只能排除所有有效组合都不支持的候选数。',
    difficulty: 'medium',
  },
  {
    id: 'arrow-combined',
    title: '箭头与单元联合推理',
    introduction: '结合箭头等式与行列宫限制，按三个阶段推进；每次候选变化都成为下一步的前提。',
    difficulty: 'hard',
  },
]

function withExercises(
  base: BaseLesson,
  stages: readonly ExerciseStage[],
  transferSource = stages,
): Lesson {
  let transfer = transferSource.map((stage) => transformStage(stage))
  if (JSON.stringify(stageAnswer(transfer[0])) === JSON.stringify(stageAnswer(stages[0]))) {
    transfer = stages.map((stage) =>
      transformStage(stage, stage.rules.kind === 'classic' ? 'swap-rows' : 'rotate'),
    )
  }
  return {
    ...base,
    guided: stages[0],
    exercises: [
      { title: '聚焦练习', stages },
      { title: '迁移练习', stages: transfer },
    ],
  }
}

const expanded: Lesson[] = legacyLessons.map((base) => {
  let stage: ExerciseStage
  if (base.practiceVariant === 'classic') {
    const example =
      base.id === 'rules'
        ? EXAMPLES['naked-single']
        : Object.values(EXAMPLES).find((example) => example.step.technique === base.id)
    if (!example) {
      throw new Error(`Missing authored Classic example: ${base.id}`)
    }
    stage = {
      board: base.board,
      candidates: base.candidates,
      rules: base.rules,
      step: example.step,
    }
  } else {
    stage = VARIANT_EXAMPLES[base.practiceVariant]
  }
  const transfer = base.id === 'arrow-rules' ? [ARROW_TRANSFER_EXAMPLE] : [stage]
  return withExercises(base, [stage], transfer)
})
for (const definition of additions) {
  const stages = COURSE_FRAGMENTS[definition.id]
  const first = stages[0]
  expanded.push(
    withExercises(
      {
        id: definition.id,
        title: definition.title,
        introduction: definition.introduction,
        board: first.board,
        candidates: first.candidates,
        rules: first.rules,
        exercise: stageAnswer(first),
        explanation: explainStep(first.step),
        practiceDifficulty: definition.difficulty,
        practiceVariant: first.rules.kind,
      },
      stages,
    ),
  )
}

export const LESSONS: readonly Lesson[] = LESSON_IDS.map((id) => {
  const lesson = expanded.find((lesson) => lesson.id === id)
  if (!lesson) {
    throw new Error(`Missing course unit: ${id}`)
  }
  return lesson
})

export function lessonStages(lesson: Lesson): readonly ExerciseStage[] {
  return lesson.exercises.flatMap((exercise) => exercise.stages)
}

export function checkExercise(
  lesson: Lesson,
  answer: Exercise['expected'],
): { correct: boolean; explanation: string } {
  let correct = false
  if (lesson.exercise.kind === 'placement' && !Array.isArray(answer) && 'cell' in answer) {
    correct =
      answer.cell === lesson.exercise.expected.cell &&
      answer.digit === lesson.exercise.expected.digit
  }

  if (lesson.exercise.kind === 'elimination' && Array.isArray(answer)) {
    const supplied = new Set(answer.map((pair) => `${pair.cell}:${pair.digit}`))
    const expected = new Set(lesson.exercise.expected.map((pair) => `${pair.cell}:${pair.digit}`))
    correct = supplied.size === expected.size && [...expected].every((pair) => supplied.has(pair))
  }

  return {
    correct,
    explanation: correct
      ? '推理正确！' + lesson.explanation
      : '还差一点。请重新检查单元内候选数的位置，可以继续尝试。',
  }
}
