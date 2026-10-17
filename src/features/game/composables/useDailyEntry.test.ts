import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { gameRuntimeKey } from '@/runtime'
import { useDailyEntry } from '@/features/game/composables/useDailyEntry'
import { useGameStore } from '@/features/game/stores/useGameStore'
import type { GameRepository } from '@/storage/repository'
import { initialSummaryState } from '@/storage/projections'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { deferred } from '../../../../tests/support/deferred'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
})

async function setup(
  configure?: (test: Awaited<ReturnType<typeof createTestRuntime>>) => void | Promise<void>,
  path = '/play/daily',
) {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  await configure?.(test)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  cleanups.push(game.dispose)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/play/daily', component: { render: () => h('div') } }],
  })
  await router.push(path)
  let entry: ReturnType<typeof useDailyEntry> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        entry = useDailyEntry()
        return () => h('div')
      },
    }),
    {
      global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
    },
  )
  cleanups.push(() => wrapper.unmount())
  if (!entry) {
    throw new Error('Daily entry was not created')
  }
  return { ...test, game, router, wrapper, entry }
}

it('keeps daily progress unknown and rejects selector starts until the summary arrives', async () => {
  const pending = deferred<Awaited<ReturnType<GameRepository['readDailyStatuses']>>>()
  const { entry, game, runtime } = await setup((test) => {
    vi.spyOn(test.runtime.repository, 'readDailyStatuses').mockReturnValueOnce(pending.promise)
  })
  const start = vi.spyOn(game, 'startDaily')
  await vi.waitFor(() => expect(runtime.repository.readDailyStatuses).toHaveBeenCalled())

  expect(entry.completedCount.value).toBeNull()
  expect(entry.statusesReady.value).toBe(false)
  await entry.start()
  expect(start).not.toHaveBeenCalled()

  pending.resolve({
    ok: true,
    value: {
      coverage: 'ready',
      epoch: 1,
      generation: 1,
      statuses: [{ variant: 'classic', state: 'available' }],
    },
  })
  await vi.waitFor(() => expect(entry.statusesReady.value).toBe(true))
  expect(entry.completedCount.value).toBe(0)
})

it('leaves legacy daily summaries pending until an explicit maintenance retry', async () => {
  const { entry, runtime } = await setup(async (test) => {
    const session = makeSession({
      id: 'daily:2026-10-11:formal',
      mode: 'daily',
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
      puzzle: { ...makeSession().puzzle, difficulty: 'medium' },
    })
    await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
    await test.database.put('meta', initialSummaryState(false), 'summaries')
    vi.spyOn(test.runtime.repository, 'maintainSummaries')
  })
  await vi.waitFor(() => expect(entry.statusesLoading.value).toBe(false))
  await flushPromises()

  expect(entry.statusesPending.value).toBe(true)
  expect(entry.completedCount.value).toBeNull()
  expect(runtime.repository.maintainSummaries).not.toHaveBeenCalled()

  await entry.retryStatuses()

  expect(runtime.repository.maintainSummaries).toHaveBeenCalledOnce()
  expect(entry.statusesReady.value).toBe(true)
  expect(entry.statuses.value).toContainEqual({ variant: 'classic', state: 'in-progress' })
})

it('keeps an entry failure separate from status errors and successful status refreshes', async () => {
  const { entry, runtime } = await setup((test) => {
    vi.spyOn(test.runtime.repository, 'readSession').mockResolvedValue({
      ok: false,
      error: { kind: 'unavailable', message: 'Injected entry failure' },
    })
  }, '/play/daily?session=unavailable')
  await vi.waitFor(() => expect(entry.localError.value).toContain('每日挑战存档读取失败'))
  const read = vi.spyOn(runtime.repository, 'readDailyStatuses').mockResolvedValueOnce({
    ok: false,
    error: { kind: 'unavailable', message: 'Injected status failure' },
  })

  await entry.refreshStatuses()

  expect(entry.statusError.value).toContain('每日状态读取失败')
  expect(entry.localError.value).toContain('每日挑战存档读取失败')
  read.mockRestore()
  await entry.refreshStatuses()

  expect(entry.statusError.value).toBeNull()
  expect(entry.localError.value).toContain('每日挑战存档读取失败')
})

it('cancels requested legacy maintenance when the entry scope is disposed', async () => {
  const maintenance = deferred<Awaited<ReturnType<GameRepository['maintainSummaries']>>>()
  const { entry, runtime, wrapper } = await setup(async (test) => {
    const session = makeSession({
      id: 'daily:2026-10-11:formal',
      mode: 'daily',
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
      puzzle: { ...makeSession().puzzle, difficulty: 'medium' },
    })
    await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
    await test.database.put('meta', initialSummaryState(false), 'summaries')
    vi.spyOn(test.runtime.repository, 'maintainSummaries').mockReturnValue(maintenance.promise)
  })
  await vi.waitFor(() => expect(entry.statusesPending.value).toBe(true))

  const retrying = entry.retryStatuses()
  const signal = vi.mocked(runtime.repository.maintainSummaries).mock.calls[0]?.[0]
  expect(signal?.aborted).toBe(false)
  wrapper.unmount()

  expect(signal?.aborted).toBe(true)
  maintenance.resolve({
    ok: true,
    value: { coverage: 'ready', epoch: 1, generation: 1, processed: 0 },
  })
  await retrying
  expect(entry.statusesReady.value).toBe(false)
})

it('preserves an explicit daily start URL without waiting for summary readiness', async () => {
  const { game, runtime } = await setup((test) => {
    vi.spyOn(test.runtime.repository, 'readDailyStatuses').mockImplementation(
      () => new Promise(() => {}),
    )
    vi.spyOn(test.runtime.worker, 'generate')
  }, '/play/daily?start=1&variant=classic')

  await vi.waitFor(() => expect(runtime.worker.generate).toHaveBeenCalledOnce())
  expect(game.error).toContain('出题失败')
})
