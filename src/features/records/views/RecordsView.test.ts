import { initialSummaryState, projectRecord } from '@/storage/projections'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RecordsView from '@/features/records/views/RecordsView.vue'
import { gameRuntimeKey } from '@/runtime'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { deferred } from '../../../../tests/support/deferred'

const cleanups: (() => void)[] = []

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
  vi.unstubAllGlobals()
})

async function setup(path: string, delayRead: boolean | 'overview' = false) {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  cleanups.push(records.dispose)
  const session = makeSession()
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
  await test.database.put('meta', initialSummaryState(false), 'summaries')
  expect((await test.runtime.repository.maintainSummaries()).ok).toBe(true)
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.repository.readSummaryPage>>>()
  const overviewResponse = await test.runtime.repository.readOverview('classic', '2026-10-11')
  const pendingOverview = deferred<typeof overviewResponse>()
  if (delayRead === 'overview') {
    vi.spyOn(test.runtime.repository, 'readOverview').mockReturnValueOnce(pendingOverview.promise)
  } else if (delayRead) {
    vi.spyOn(test.runtime.repository, 'readSummaryPage').mockReturnValue(pending.promise)
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/records', component: RecordsView },
      { path: '/play/free', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(RouterView, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  if (!delayRead) {
    await vi.waitFor(() => expect(records.loaded).toBe(true))
  }

  return { ...test, records, router, wrapper, pending, pendingOverview, overviewResponse }
}

it('selects local saves from the URL and retains the tab when changing variant', async () => {
  const { wrapper, router } = await setup('/records?variant=classic&tab=saves')

  expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('本地存档')
  expect(wrapper.get('a[href*="session=fixture-free-session"]').text()).toContain('继续存档')
  expect(wrapper.text()).toContain('已填 0 / 51 格')
  expect(wrapper.get('time').attributes('datetime')).toBe('2026-10-11T01:00:00.000Z')
  expect(wrapper.find('table').exists()).toBe(false)

  await wrapper.get('a[href*="variant=arrow"]').trigger('click')
  await flushPromises()

  expect(router.currentRoute.value.query).toEqual({ variant: 'arrow', tab: 'saves' })
  expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('本地存档')
  await vi.waitFor(() => expect(wrapper.text()).toContain('这个玩法还没有本地存档'))
})

it('shows counts for all variants in every tab and refreshes them after clearing data', async () => {
  const { wrapper, router, records, database } = await setup('/records?variant=arrow&tab=saves')
  const session = makeSession({
    completion: { completedAt: '2026-10-17T01:00:00.000Z', elapsedMs: 0 },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] ? 0 : digit,
  )
  await database.put('results', { formatVersion: 2, session })
  await database.put('resultSummaries', projectRecord(session, 0, 'results'))

  await records.load()

  const navigation = wrapper.get('nav[aria-label="成绩玩法"]')
  expect(navigation.get('a[href*="variant=classic"]').text()).toContain('1 局')
  expect(navigation.findAll('.choice-count').map((count) => count.text())).toEqual([
    '1 局',
    '0 局',
    '0 局',
    '0 局',
    '0 局',
    '0 局',
  ])
  await router.push('/records?variant=arrow&tab=history')
  await vi.waitFor(() => expect(records.loaded).toBe(true))

  expect(navigation.get('a[href*="variant=classic"]').text()).toContain('1 局')
  await records.clearLocalData()
  await flushPromises()

  expect(navigation.findAll('.choice-count').map((count) => count.text())).toEqual(
    Array(6).fill('0 局'),
  )
})

it('keeps unread data distinct from empty data and defers transient loading text', async () => {
  const { wrapper, pending } = await setup('/records?tab=history', true)

  expect(wrapper.text()).not.toContain('还没有完成记录')
  expect(wrapper.text()).not.toContain('已完成 0 局')
  expect(wrapper.text()).not.toContain('正在处理本机记录')
  await vi.waitFor(() => expect(wrapper.text()).toContain('正在处理本机记录'))

  pending.resolve({
    ok: true,
    value: { coverage: 'ready', epoch: 1, generation: 1, rows: [], nextCursor: null },
  })
  await flushPromises()

  expect(wrapper.text()).toContain('还没有完成记录')
  expect(wrapper.text()).not.toContain('正在处理本机记录')
})

it('renders overview cards and table before counts arrive and keeps their nodes during loading', async () => {
  const { wrapper, pendingOverview, overviewResponse } = await setup('/records', 'overview')
  const cards = wrapper.findAll('.stat').map((card) => card.element)
  const table = wrapper.get('table').element
  const feedback = wrapper.get('.loading-slot').element

  expect(cards).toHaveLength(3)
  expect(wrapper.text()).toContain('已完成 — 局')
  expect(wrapper.text()).not.toContain('已完成 0 局')
  expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
  await vi.waitFor(() => expect(wrapper.text()).toContain('正在处理本机记录'))
  expect(wrapper.get('.loading-slot').element).toBe(feedback)

  pendingOverview.resolve(overviewResponse)
  await vi.waitFor(() => expect(wrapper.text()).toContain('已完成 0 局'))

  expect(wrapper.findAll('.stat').map((card) => card.element)).toEqual(cards)
  expect(wrapper.get('table').element).toBe(table)
})
