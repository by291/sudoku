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

async function setup() {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  await router.push('/learn/rules')
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  const wrapper = mount(LessonView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  await wrapper.get('button[aria-label^="第5行第5列"]').trigger('click')

  return { wrapper, learning }
}

it('does not publish a delayed answer into another lesson', async () => {
  const { wrapper, learning } = await setup()
  const answer = deferred<{ correct: boolean; explanation: string }>()
  vi.spyOn(learning, 'submitExercise').mockImplementation(() => answer.promise)

  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  await router.push('/learn/naked-single')
  await flushPromises()
  answer.resolve({ correct: true, explanation: 'Stale answer feedback' })
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
