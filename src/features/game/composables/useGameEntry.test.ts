import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { useGameEntry } from '@/features/game/composables/useGameEntry'
import { gameRuntimeKey } from '@/runtime'
import { createTestRuntime } from '../../../../tests/support/runtime'

it.each(['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'])(
  'rejects an Expert %s start URL with a recovery message',
  async (variant) => {
    const test = await createTestRuntime()
    const generate = vi.spyOn(test.runtime.worker, 'generate')
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/play/free', component: { render: () => h('div') } }],
    })
    await router.push(`/play/free?start=1&difficulty=expert&variant=${variant}`)
    const host = defineComponent({
      setup() {
        const entry = useGameEntry({
          metadata: () => ({ kind: 'free' }),
          autoRestore: () => true,
          practiceVariant: () => 'classic',
          practiceDifficulty: () => 'easy',
          chooseDaily() {},
        })
        return () => h('div', entry.initializationError.value ?? '')
      },
    })
    const wrapper = mount(host, {
      global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
    })
    try {
      await flushPromises()
      expect(wrapper.text()).toMatch(/专家.*标准.*重新选择/)
      expect(generate).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      test.dispose()
    }
  },
)
