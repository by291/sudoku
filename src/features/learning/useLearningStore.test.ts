import { expect, it } from 'vitest'
import { createTestRuntime } from '../../../tests/support/runtime'
import { useLearningStore } from './useLearningStore'
import { LESSONS } from './lessons'
import { deferred } from '../../../tests/support/deferred'
it('allows retries, persists progress once, and retains it across lesson selection', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  expect((await learning.submitExercise('rules', { cell: 80, digit: 9 })).correct).toBe(false)
  expect(learning.progress).toHaveLength(0)
  await learning.submitExercise('rules', LESSONS[0].exercise.expected)
  await learning.submitExercise('rules', LESSONS[0].exercise.expected)
  learning.selectLesson('hidden-pair')
  await learning.load()
  expect(learning.progress).toHaveLength(1)
  expect(await test.database.count('lessons')).toBe(1)
  expect(await test.runtime.repository.readSettings()).toMatchObject({
    ok: true,
    value: { currentLessonId: 'hidden-pair' },
  })
  test.dispose()
})
it('ignores an exercise completion that finishes after progress reset', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  const gate = deferred<void>(),
    entered = deferred<void>()
  test.runtime.repository.writeLessonProgress = async () => {
    entered.resolve()
    await gate.promise
    return { ok: true, value: undefined }
  }
  const submitting = learning.submitExercise('rules', LESSONS[0].exercise.expected)
  await entered.promise
  learning.reset()
  gate.resolve()
  await submitting
  expect(learning.progress).toEqual([])
  test.dispose()
})
it('ignores a progress read that finishes after reset', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  const gate = deferred<void>(),
    entered = deferred<void>()
  test.runtime.repository.readLessonProgress = async () => {
    entered.resolve()
    await gate.promise
    return { ok: true, value: [{ lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' }] }
  }
  const loading = learning.load()
  await entered.promise
  learning.reset()
  gate.resolve()
  await loading
  expect(learning.progress).toEqual([])
  test.dispose()
})
