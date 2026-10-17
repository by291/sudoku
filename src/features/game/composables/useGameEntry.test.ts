import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { useGameEntry } from '@/features/game/composables/useGameEntry'
import { gameRuntimeKey } from '@/runtime'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { deferred } from '../../../../tests/support/deferred'

function createEntryHost(showError = false) {
  return defineComponent({
    setup() {
      const entry = useGameEntry({
        metadata: () => ({ kind: 'free' }),
        autoRestore: () => true,
        practiceVariant: () => 'classic',
        practiceDifficulty: () => 'easy',
        chooseDaily() {},
      })
      return () =>
        h('div', [
          showError ? (entry.initializationError.value ?? '') : '',
          h('button', { onClick: entry.startSelected }, 'Start'),
          h('button', { onClick: entry.retryTarget }, 'Retry'),
        ])
    },
  })
}

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
    const host = createEntryHost(true)
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

it('prepares the game setup from summaries without opening a full saved game', async () => {
  const test = await createTestRuntime()
  const readFull = vi.spyOn(test.runtime.repository, 'readSlot')
  const summary = vi.spyOn(test.runtime.repository, 'readSlotSummary').mockResolvedValue({
    ok: true,
    value: { coverage: 'ready', epoch: 0, generation: 0, summary: null },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/play/free', component: { render: () => h('div') } }],
  })
  await router.push('/play/free')
  const host = createEntryHost()
  const wrapper = mount(host, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  try {
    await flushPromises()
    expect(readFull).not.toHaveBeenCalled()
    expect(summary).toHaveBeenCalledWith('free', 'classic')
  } finally {
    wrapper.unmount()
    test.dispose()
  }
})

it('retains a requested save error after a successful summary read', async () => {
  const test = await createTestRuntime()
  vi.spyOn(test.runtime.repository, 'readSession').mockResolvedValue({
    ok: false,
    error: { kind: 'unavailable', message: 'Engine download failed' },
  })
  const summary = vi.spyOn(test.runtime.repository, 'readSlotSummary').mockResolvedValue({
    ok: true,
    value: { coverage: 'ready', epoch: 0, generation: 0, summary: null },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/play/free', component: { render: () => h('div') } }],
  })
  await router.push('/play/free?session=saved-game')
  const wrapper = mount(createEntryHost(true), {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  try {
    await flushPromises()

    expect(summary).toHaveBeenCalled()
    expect(wrapper.text()).toContain('读取存档失败')
  } finally {
    wrapper.unmount()
    test.dispose()
  }
})

it('blocks replacement while saved game presence cannot be read', async () => {
  const test = await createTestRuntime()
  vi.spyOn(test.runtime.repository, 'readSlotSummary').mockResolvedValue({
    ok: false,
    error: { kind: 'unavailable', message: 'Database unavailable' },
  })
  const generate = vi.spyOn(test.runtime.worker, 'generate')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/play/free', component: { render: () => h('div') } }],
  })
  await router.push('/play/free')
  const wrapper = mount(createEntryHost(), {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  try {
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(generate).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
    test.dispose()
  }
})

it('cancels legacy maintenance when the game setup owner leaves', async () => {
  const test = await createTestRuntime()
  vi.spyOn(test.runtime.repository, 'readSlotSummary').mockResolvedValue({
    ok: true,
    value: { coverage: 'pending', epoch: 1, generation: 1, summary: null },
  })
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.repository.maintainSummaries>>>()
  const maintenance = vi
    .spyOn(test.runtime.repository, 'maintainSummaries')
    .mockReturnValue(pending.promise)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/play/free', component: { render: () => h('div') } }],
  })
  await router.push('/play/free')
  const wrapper = mount(createEntryHost(), {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  try {
    await flushPromises()
    await wrapper.findAll('button')[1]?.trigger('click')
    expect(maintenance).toHaveBeenCalledOnce()

    wrapper.unmount()

    expect(maintenance.mock.calls[0]?.[0]?.aborted).toBe(true)
  } finally {
    pending.resolve({ ok: false, error: { kind: 'unavailable', message: 'Cancelled' } })
    wrapper.unmount()
    test.dispose()
  }
})
