import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { router } from '@/router/index'
import { gameRuntimeKey } from '@/runtime'
import LessonView from '@/features/learning/views/LessonView.vue'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { deferred } from '../../../../tests/support/deferred'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import { explainStep } from '@/features/game/model/techniquePresentation'
import { lessonStages } from '@/features/learning/model/lessons'
import { stageAnswer } from '@/features/learning/model/exerciseStages'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
})

async function setup(visitSaveGate?: Promise<void>, lessonId = 'rules') {
  const test = await createTestRuntime()
  if (visitSaveGate) {
    const write = test.runtime.repository.writeSettings
    test.runtime.repository.writeSettings = async (settings, epoch) => {
      await visitSaveGate
      return write(settings, epoch)
    }
  }
  cleanups.push(test.dispose)
  await router.push(`/learn/${lessonId}`)
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  const wrapper = mount(LessonView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  await wrapper.get('input[value="exercise"]').setValue(true)
  await wrapper.get('button[aria-label^="第5行第5列"]').trigger('click')
  if (!visitSaveGate) {
    await vi.waitFor(() =>
      expect(wrapper.get('button[aria-label$="数字5"]').attributes('disabled')).toBeUndefined(),
    )
  }

  return { ...test, wrapper, learning }
}

async function submitPlacement(wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) {
  await flushPromises()
  await wrapper.get('button[aria-label="提交答案"]').trigger('click')
}

it('keeps a placement draft across modes and submits only through the explicit action', async () => {
  const { wrapper, learning } = await setup()
  const lesson = learning.lessons[0]
  if (!lesson) {
    throw new Error('Missing rules lesson')
  }

  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  await flushPromises()

  expect(learning.exerciseStage('rules')).toBe(0)
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
  expect(wrapper.get('button[aria-label^="第5行第5列"]').attributes('aria-label')).toContain(
    '数字5',
  )
  expect(wrapper.text()).not.toContain(explainStep(lesson.guided.step))

  await wrapper.get('input[value="guide"]').setValue(true)

  expect(wrapper.getComponent(SudokuBoard).props('board')).toEqual(lesson.guided.board)
  expect(wrapper.getComponent(SudokuBoard).props('hintCells')).toEqual(
    lesson.guided.step.evidence.cells,
  )
  expect(wrapper.text()).toContain(explainStep(lesson.guided.step))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '9' }))
  await wrapper.get('input[value="exercise"]').setValue(true)

  expect(wrapper.get('button[aria-label^="第5行第5列"]').attributes('aria-label')).toContain(
    '数字5',
  )
  expect(wrapper.get('button[aria-label^="第5行第5列"]').attributes('aria-pressed')).toBe('true')
  await submitPlacement(wrapper)
  await vi.waitFor(() => expect(learning.exerciseStage('rules')).toBe(1))
  expect(wrapper.text()).toContain('练习阶段 1 / 2')
  expect(wrapper.get('[role="status"]').text()).toContain('推理正确')

  await wrapper.get('input[value="guide"]').setValue(true)
  await wrapper.get('input[value="exercise"]').setValue(true)

  expect(wrapper.get('[role="status"]').text()).toContain('推理正确')
  expect(wrapper.findAll('button').some((button) => button.text() === '下一阶段')).toBe(true)

  const next = wrapper.findAll('button').find((button) => button.text() === '下一阶段')
  if (!next) {
    throw new Error('Missing next-stage action')
  }
  await next.trigger('click')
  expect(wrapper.text()).toContain('练习阶段 2 / 2')
  expect(wrapper.getComponent(SudokuBoard).props('board')).not.toEqual(lesson.guided.board)

  await wrapper.get('input[value="guide"]').setValue(true)

  expect(wrapper.getComponent(SudokuBoard).props('board')).toEqual(lesson.guided.board)
  expect(wrapper.text()).toContain(explainStep(lesson.guided.step))
})

it('retains selected eliminations across modes and clears them without changing progress', async () => {
  const { wrapper, learning } = await setup(undefined, 'locked-candidate')
  const lesson = learning.lessons.find((item) => item.id === 'locked-candidate')
  const stage = lesson && lessonStages(lesson)[0]
  const exercise = stage && stageAnswer(stage)
  if (!stage || exercise?.kind !== 'elimination' || !exercise.expected[0]) {
    throw new Error('Missing locked-candidate elimination fixture')
  }
  const { cell, digit } = exercise.expected[0]
  await wrapper
    .get(`button[aria-label^="第${Math.floor(cell / 9) + 1}行第${(cell % 9) + 1}列"]`)
    .trigger('click')
  await wrapper.get(`button[aria-label="排除数字${digit}"]`).trigger('click')
  const draftNotes = wrapper.getComponent(SudokuBoard).props('notes')

  await wrapper.get('input[value="guide"]').setValue(true)
  await wrapper.get('input[value="exercise"]').setValue(true)

  expect(wrapper.text()).toContain('已选择 1 个排除项')
  expect(wrapper.getComponent(SudokuBoard).props('notes')).toEqual(draftNotes)
  expect(wrapper.getComponent(SudokuBoard).props('selectedCell')).toBe(cell)
  expect(learning.exerciseStage('locked-candidate')).toBe(0)
  const clear = wrapper.findAll('button').find((button) => button.text() === '清空选择')
  if (!clear) {
    throw new Error('Missing clear-selection action')
  }
  await clear.trigger('click')

  expect(wrapper.text()).toContain('已选择 0 个排除项')
  expect(wrapper.getComponent(SudokuBoard).props('notes')).toEqual(stage.candidates)
})

it('clears a draft without submitting or changing the saved stage', async () => {
  const { wrapper, learning } = await setup()
  await wrapper.get('button[aria-label="填写数字9"]').trigger('click')
  await submitPlacement(wrapper)
  await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toContain('还差一点'))

  const clear = wrapper.findAll('button').find((button) => button.text() === '清空选择')
  if (!clear) {
    throw new Error('Missing clear-selection action')
  }
  await clear.trigger('click')

  expect(wrapper.get('button[aria-label^="第5行第5列"]').attributes('aria-label')).toContain('空格')
  expect(wrapper.get('button[aria-label="提交答案"]').attributes('disabled')).toBeDefined()
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
  expect(learning.exerciseStage('rules')).toBe(0)
})

async function restoreEmptyDataset(test: Awaited<ReturnType<typeof setup>>) {
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  cleanups.push(records.dispose)
  await records.previewRestore(
    JSON.stringify({
      backupVersion: 1,
      exportedAt: '2026-10-14T03:00:00.000Z',
      sessions: [],
      results: [],
      lessons: [],
      settings: DEFAULT_SETTINGS,
    }),
  )
  await records.restoreBackup()
  await flushPromises()
}

it('reinitializes a mounted lesson from the restored cursor and clears its old feedback', async () => {
  const test = await setup()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  await submitPlacement(test.wrapper)
  await vi.waitFor(() => expect(test.wrapper.get('[role="status"]').text()).toContain('推理正确'))
  const next = test.wrapper.findAll('button').find((button) => button.text() === '下一阶段')
  if (!next) {
    throw new Error('Missing next-stage action')
  }
  await next.trigger('click')
  await flushPromises()
  expect(test.wrapper.text()).toContain('练习阶段 2 / 2')

  await restoreEmptyDataset(test)

  await vi.waitFor(() => expect(test.wrapper.text()).toContain('练习阶段 1 / 2'))
  expect(test.wrapper.find('[role="status"]').exists()).toBe(false)
  expect(await test.runtime.repository.readSettings()).toMatchObject({
    ok: true,
    value: { currentLessonId: null },
  })
  await test.wrapper.get('button[aria-label^="第5行第5列"]').trigger('click')
  await vi.waitFor(() =>
    expect(
      test.wrapper.get('button[aria-label="填写数字5"]').attributes('disabled'),
    ).toBeUndefined(),
  )
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  await submitPlacement(test.wrapper)
  await vi.waitFor(() => expect(test.wrapper.get('[role="status"]').text()).toContain('推理正确'))
  expect(test.learning.exerciseStage('rules')).toBe(1)
})

it('ignores an answer completing after dataset restoration on the same lesson', async () => {
  const test = await setup()
  const answer = deferred<{
    correct: boolean
    explanation: string
    advance: boolean
    completed: boolean
  }>()
  vi.spyOn(test.learning, 'submitExercise').mockReturnValue(answer.promise)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  await submitPlacement(test.wrapper)

  await restoreEmptyDataset(test)
  answer.resolve({
    correct: true,
    explanation: 'Stale restore answer',
    advance: true,
    completed: true,
  })
  await flushPromises()

  expect(test.wrapper.text()).not.toContain('Stale restore answer')
})

it('waits for the last-visited write before accepting a stage answer', async () => {
  const gate = deferred<void>()
  const { wrapper, learning } = await setup(gate.promise)
  try {
    expect(wrapper.text()).not.toContain('正在准备或保存练习，请稍候…')
    expect(wrapper.get('button[aria-label="填写数字5"]').attributes('disabled')).toBeDefined()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
    await flushPromises()
    await submitPlacement(wrapper)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await vi.waitFor(() => expect(wrapper.text()).toContain('正在准备或保存练习，请稍候…'))
    gate.resolve()
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper.get('button[aria-label="填写数字5"]').attributes('disabled')).toBeUndefined(),
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
    await flushPromises()
    await submitPlacement(wrapper)
    await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toContain('推理正确'))
    expect(learning.exerciseStage('rules')).toBe(1)
    expect(wrapper.text()).not.toContain('正在准备或保存练习，请稍候…')
  } finally {
    gate.resolve()
    await flushPromises()
  }
})

it('does not publish a delayed answer into another lesson', async () => {
  const { wrapper, learning } = await setup()
  const answer = deferred<{
    correct: boolean
    explanation: string
    advance: boolean
    completed: boolean
  }>()
  const submitting = vi.spyOn(learning, 'submitExercise').mockImplementation(() => answer.promise)

  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  await submitPlacement(wrapper)
  expect(submitting).toHaveBeenCalled()
  await router.push('/learn/naked-single')
  await flushPromises()
  answer.resolve({
    correct: true,
    explanation: 'Stale answer feedback',
    advance: true,
    completed: false,
  })
  await flushPromises()

  expect(wrapper.text()).not.toContain('Stale answer feedback')
})

it('yields digit input while full-board practice owns the route', async () => {
  const { learning } = await setup()
  const submit = vi.spyOn(learning, 'submitExercise')

  await router.push('/learn/rules?practice=1')
  await flushPromises()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  await flushPromises()

  expect(submit).not.toHaveBeenCalled()
})
