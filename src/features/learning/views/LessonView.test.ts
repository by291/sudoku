import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { router } from '@/router/index'
import { gameRuntimeKey } from '@/runtime'
import LessonView from '@/features/learning/views/LessonView.vue'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { deferred } from '../../../../tests/support/deferred'
import { createTestRuntime } from '../../../../tests/support/runtime'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
})

async function setup(visitSaveGate?: Promise<void>) {
  const test = await createTestRuntime()
  if (visitSaveGate) {
    const write = test.runtime.repository.writeSettings
    test.runtime.repository.writeSettings = async (settings, epoch) => {
      await visitSaveGate
      return write(settings, epoch)
    }
  }
  cleanups.push(test.dispose)
  await router.push('/learn/rules')
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  const wrapper = mount(LessonView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  await wrapper.get('button[aria-label^="第5行第5列"]').trigger('click')
  if (!visitSaveGate) {
    await vi.waitFor(() =>
      expect(wrapper.get('button[aria-label="填写数字5"]').attributes('disabled')).toBeUndefined(),
    )
  }

  return { wrapper, learning }
}

it('waits for the last-visited write before accepting a stage answer', async () => {
  const gate = deferred<void>()
  const { wrapper, learning } = await setup(gate.promise)
  try {
    expect(wrapper.get('button[aria-label="填写数字5"]').attributes('disabled')).toBeDefined()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    gate.resolve()
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper.get('button[aria-label="填写数字5"]').attributes('disabled')).toBeUndefined(),
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toContain('推理正确'))
    expect(learning.exerciseStage('rules')).toBe(1)
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
