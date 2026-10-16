import { LESSONS } from '../../../../tests/support/lessons'
import { expect, it, vi } from 'vitest'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'
import { deferred } from '../../../../tests/support/deferred'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'

it('invalidates an old exercise when settings detect a restored epoch and resumes after rereading', async () => {
  const test = await createTestRuntime()
  await test.runtime.repository.writeSettings(
    { ...DEFAULT_SETTINGS, lessonStages: { 'killer-combined': 2 } },
    1,
  )
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  const restored = { ...DEFAULT_SETTINGS, lessonStages: { 'killer-combined': 4 } }
  await test.runtime.repository.restoreBackup(
    JSON.stringify({
      backupVersion: 1,
      exportedAt: '2026-10-14T03:00:00.000Z',
      sessions: [],
      results: [],
      lessons: [],
      settings: restored,
    }),
    1,
  )

  await preferences.update({ theme: 'dark' })
  expect(learning.readyGeneration).toBeNull()
  await preferences.retry()
  await vi.waitFor(() => expect(learning.exerciseStage('killer-combined')).toBe(4))
  expect(learning.readyGeneration).toBe(learning.datasetGeneration)
  test.dispose()
})

it('refreshes exercise progress when settings read a different actual dataset epoch', async () => {
  const test = await createTestRuntime()
  await test.runtime.repository.writeSettings(
    { ...DEFAULT_SETTINGS, lessonStages: { 'killer-combined': 2 } },
    1,
  )
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  const restored = { ...DEFAULT_SETTINGS, lessonStages: { 'killer-combined': 4 } }
  await test.runtime.repository.restoreBackup(
    JSON.stringify({
      backupVersion: 1,
      exportedAt: '2026-10-14T03:00:00.000Z',
      sessions: [],
      results: [],
      lessons: [],
      settings: restored,
    }),
    1,
  )

  await preferences.reset()
  await preferences.load()
  await vi.waitFor(() => expect(learning.exerciseStage('killer-combined')).toBe(4))
  test.dispose()
})

it('keeps exercises unready when the settings containing their cursor cannot be read', async () => {
  const test = await createTestRuntime()
  await test.runtime.repository.writeSettings(
    { ...DEFAULT_SETTINGS, lessonStages: { 'killer-combined': 4 } },
    1,
  )
  const read = vi.spyOn(test.runtime.repository, 'readSettings').mockResolvedValue({
    ok: false,
    error: { kind: 'unavailable', message: 'Injected read failure' },
  })
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))

  await learning.load()
  expect(learning.readyGeneration).toBeNull()
  read.mockRestore()
  await learning.load()
  expect(learning.exerciseStage('killer-combined')).toBe(4)
  test.dispose()
})

it('allows retries, persists progress once, and retains it across lesson selection', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()

  expect((await learning.submitExercise('rules', { cell: 80, digit: 9 })).correct).toBe(false)
  expect(learning.progress).toHaveLength(0)
  for (const [index, stage] of lessonStages(LESSONS[0]).entries()) {
    await learning.submitExercise('rules', stageAnswer(stage).expected, index)
  }
  await learning.selectLesson('hidden-pair')
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
  const gate = deferred<void>()
  const entered = deferred<void>()
  test.runtime.repository.writeLessonProgress = async () => {
    entered.resolve()
    await gate.promise

    return { ok: true, value: undefined }
  }
  await learning.submitExercise('rules', LESSONS[0].exercise.expected, 0)
  const submitting = learning.submitExercise(
    'rules',
    stageAnswer(lessonStages(LESSONS[0])[1]).expected,
    1,
  )
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
  const gate = deferred<void>()
  const entered = deferred<void>()
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

it('resumes committed stages after reload while preserving old completion facts', async () => {
  const test = await createTestRuntime()
  await test.database.put('lessons', { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' })
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  const lesson = LESSONS.find((item) => item.id === 'diagonal-combined')
  if (!lesson) {
    throw new Error('Missing combined course')
  }
  await learning.submitExercise(lesson.id, stageAnswer(lessonStages(lesson)[0]).expected, 0)
  await learning.load()

  expect(learning.exerciseStage(lesson.id)).toBe(1)
  expect(learning.progress).toEqual([
    { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' },
  ])
  expect(
    (await learning.submitExercise(lesson.id, stageAnswer(lessonStages(lesson)[0]).expected, 0))
      .correct,
  ).toBe(false)
  test.dispose()
})

it('retains a failed completion for retry and never announces it as committed', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  const stages = lessonStages(LESSONS[0])
  await learning.submitExercise('rules', stageAnswer(stages[0]).expected, 0)
  const write = test.runtime.repository.writeLessonProgress
  test.runtime.repository.writeLessonProgress = async () => ({
    ok: false,
    error: { kind: 'write-failed', message: 'fixture failure' },
  })
  const failed = await learning.submitExercise('rules', stageAnswer(stages[1]).expected, 1)

  expect(failed).toMatchObject({ correct: true, completed: false, advance: false })
  expect(learning.progress).toHaveLength(0)
  expect(learning.exerciseStage('rules')).toBe(1)
  test.runtime.repository.writeLessonProgress = write
  expect(await learning.submitExercise('rules', stageAnswer(stages[1]).expected, 1)).toMatchObject({
    correct: true,
    completed: true,
  })
  expect(learning.progress).toHaveLength(1)
  test.dispose()
})

it('does not resume an optimistic stage after its settings transaction fails', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  test.runtime.repository.writeSettings = async () => ({
    ok: false,
    error: { kind: 'write-failed', message: 'fixture failure' },
  })

  expect(await learning.submitExercise('rules', LESSONS[0].exercise.expected, 0)).toMatchObject({
    correct: true,
    advance: false,
  })
  await learning.load()
  expect(learning.exerciseStage('rules')).toBe(0)
  expect(await test.database.count('lessons')).toBe(0)
  test.dispose()
})

it('does not announce completion after a reset during stage-cursor cleanup', async () => {
  const test = await createTestRuntime()
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await learning.load()
  const stages = lessonStages(LESSONS[0])
  await learning.submitExercise('rules', stageAnswer(stages[0]).expected, 0)
  const gate = deferred<void>()
  const entered = deferred<void>()
  const write = test.runtime.repository.writeSettings
  test.runtime.repository.writeSettings = async (settings, epoch) => {
    entered.resolve()
    await gate.promise
    return write(settings, epoch)
  }
  const completing = learning.submitExercise('rules', stageAnswer(stages[1]).expected, 1)
  await entered.promise
  learning.reset()
  gate.resolve()

  expect(await completing).toMatchObject({ completed: false })
  expect(learning.progress).toEqual([])
  test.dispose()
})
