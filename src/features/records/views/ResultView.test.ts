import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import ResultView from '@/features/records/views/ResultView.vue'
import { gameRuntimeKey } from '@/runtime'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import type { OwnershipNotice } from '@/storage/ownership'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
})

async function setup(id: string) {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const listeners: ((notice: OwnershipNotice) => void)[] = []
  vi.spyOn(test.runtime.ownership, 'subscribe').mockImplementation((listener) => {
    listeners.push(listener)
    return () => {}
  })
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  cleanups.push(records.dispose)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  const session = makeSession({
    elapsedMs: 61000,
    completion: { completedAt: '2026-10-11T01:00:00.000Z', elapsedMs: 61000 },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] ? 0 : digit,
  )
  await test.database.put('results', { formatVersion: 2, session })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/records/:id', component: ResultView },
      { path: '/records', component: { template: '<div />' } },
    ],
  })
  await router.push(`/records/${id}`)
  const wrapper = mount(RouterView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await vi.waitFor(() => expect(records.loaded).toBe(true))
  await flushPromises()

  return { ...test, records, game, wrapper, router, session, listeners }
}

it('displays the original completion without creating an editable session, lease or changing facts', async () => {
  const { wrapper, database, game, session } = await setup('fixture-free-session')

  expect(wrapper.get('h1').text()).toBe('已完成的棋局')
  expect(wrapper.get('[aria-label="数独棋盘"]').findAll('button')).toHaveLength(81)
  expect(wrapper.get('button[aria-label^="第1行第3列"]').text()).toBe('4')
  expect(wrapper.findAll('.cell').every((cell) => cell.attributes('disabled') !== undefined)).toBe(
    true,
  )
  expect(wrapper.text()).toContain('01:01')
  expect(wrapper.text()).toContain('无辅助完成')
  expect(game.session).toBeNull()
  expect(await database.count('leases')).toBe(0)
  expect(await database.get('results', session.id)).toEqual({ formatVersion: 2, session })
})

it('shows a missing-result recovery when the route ID is absent and after a peer reset', async () => {
  const { wrapper, records, database, listeners, router } = await setup('missing')
  expect(wrapper.text()).toContain('找不到这条完成记录')
  expect(wrapper.find('[aria-label="数独棋盘"]').exists()).toBe(false)

  await router.push('/records/fixture-free-session')
  await flushPromises()
  expect(wrapper.find('[aria-label="数独棋盘"]').exists()).toBe(true)
  await database.clear('results')

  for (const listener of listeners) {
    listener({ kind: 'reset', epoch: 2 })
  }
  await flushPromises()

  expect(wrapper.find('[aria-label="数独棋盘"]').exists()).toBe(false)
  await vi.waitFor(() => expect(records.loaded).toBe(true))
  expect(wrapper.text()).toContain('找不到这条完成记录')
})
