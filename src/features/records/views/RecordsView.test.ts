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

async function setup(path: string, delayRead = false) {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  cleanups.push(records.dispose)
  const session = makeSession()
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.repository.listSessions>>>()
  if (delayRead) {
    vi.spyOn(test.runtime.repository, 'listSessions').mockReturnValue(pending.promise)
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

  return { ...test, records, router, wrapper, pending }
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
  expect(wrapper.text()).toContain('这个玩法还没有本地存档')
})

it('keeps unread data distinct from empty data and defers transient loading text', async () => {
  const { wrapper, pending } = await setup('/records?tab=history', true)

  expect(wrapper.text()).not.toContain('还没有完成记录')
  expect(wrapper.text()).not.toContain('已完成 0 局')
  expect(wrapper.text()).not.toContain('正在处理本机记录')
  await vi.waitFor(() => expect(wrapper.text()).toContain('正在处理本机记录'))

  pending.resolve({ ok: true, value: [] })
  await flushPromises()

  expect(wrapper.text()).toContain('还没有完成记录')
  expect(wrapper.text()).not.toContain('正在处理本机记录')
})
