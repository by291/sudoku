import { LESSONS } from '../../../../tests/support/lessons'
import { expect, it } from 'vitest'

import { LESSON_IDS } from '@/features/learning/model/lessonIds'
import { supportsDifficulty } from '@reference/core/sudoku/difficulties'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { stageAnswer } from '@/features/learning/model/exerciseStages'

it('provides thirty-two units with two exercises and ordered combined variant reasoning', () => {
  expect(LESSONS).toHaveLength(32)
  expect(new Set(LESSON_IDS).size).toBe(32)
  for (const variant of ['classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
    const course = LESSONS.filter((lesson) => lesson.practiceVariant === variant)
    expect(course).toHaveLength(variant === 'classic' ? 12 : 4)
    if (variant !== 'classic') {
      expect(course.at(-1)?.exercises[0].stages.length).toBeGreaterThanOrEqual(3)
    }
    for (const lesson of course) {
      expect(lesson.exercises).toHaveLength(2)
      expect(supportsDifficulty(variant, lesson.practiceDifficulty)).toBe(true)
      expect(JSON.stringify(lesson.exercises[0].stages), lesson.id).not.toBe(
        JSON.stringify(lesson.exercises[1].stages),
      )
    }
  }
})

it('requires each stage in order, retains a wrong answer and commits completion only at the end', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  const lesson = LESSONS.find((item) => item.id === 'killer-combined')
  if (!lesson) {
    throw new Error('Missing combined lesson')
  }
  await learning.load()
  const stages = lesson.exercises.flatMap((exercise) => exercise.stages)
  expect((await learning.submitExercise(lesson.id, stageAnswer(stages[0]).expected, 1)).kind).toBe(
    'unavailable',
  )
  expect((await learning.submitExercise(lesson.id, { cell: 80, digit: 9 }, 0)).kind).toBe(
    'incorrect',
  )
  for (let stage = 0; stage < stages.length; stage++) {
    const result = await learning.submitExercise(
      lesson.id,
      stageAnswer(stages[stage]).expected,
      stage,
    )
    expect(result.kind).toBe(stage === stages.length - 1 ? 'completed' : 'advance')
    expect(learning.progress.some((item) => item.lessonId === lesson.id)).toBe(
      stage === stages.length - 1,
    )
  }
  expect(await test.database.count('lessons')).toBe(1)
  test.dispose()
})

it('moves the inference targets to a different position for every transfer exercise', () => {
  function targets(stage: (typeof LESSONS)[number]['guided']): number[] {
    const step = stage.step
    return step.kind === 'placement'
      ? [step.cell]
      : [...new Set(step.removals.map(({ cell }) => cell))].sort((a, b) => a - b)
  }
  for (const lesson of LESSONS) {
    expect(targets(lesson.exercises[0].stages[0]), lesson.id).not.toEqual(
      targets(lesson.exercises[1].stages[0]),
    )
  }
})
