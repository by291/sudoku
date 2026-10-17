import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import DailyView from '@/features/game/views/DailyView.vue'
import GameSetupDialog from '@/features/game/components/GameSetupDialog.vue'
import { gameRuntimeKey } from '@/runtime'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { deferred } from '../../../../tests/support/deferred'

const cleanups: (() => void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup()
  }
  await flushPromises()
})

it('renders unknown daily progress and stable controls while a selector waits for summaries', async () => {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  cleanups.push(game.dispose)
  const response = await test.runtime.repository.readDailyStatuses('2026-10-11')
  const pending = deferred<typeof response>()
  vi.spyOn(test.runtime.repository, 'readDailyStatuses').mockReturnValue(pending.promise)
  const computation = vi.spyOn(test.runtime, 'ensureEngine')
  const maintenance = vi.spyOn(test.runtime.repository, 'maintainSummaries')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/play/daily', component: DailyView }],
  })
  await router.push('/play/daily')
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  const card = wrapper.get('.daily-card').element
  const actions = wrapper.get('.daily-actions').element
  const loadingSlot = wrapper.get('.daily-status-slot').element

  expect(wrapper.text()).toContain('今日已完成 — / 6 种玩法')
  expect(wrapper.text()).not.toContain('今日已完成 0 / 6 种玩法')
  expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBeUndefined()
  expect(wrapper.text()).not.toContain('正在读取每日状态')
  await vi.waitFor(() => expect(wrapper.text()).toContain('正在读取每日状态'))
  expect(wrapper.get('.daily-status-slot').element).toBe(loadingSlot)

  const choose = wrapper.findAll('button').find((button) => button.text() === '选择今日挑战')
  if (!choose) {
    throw new Error('Missing challenge selector')
  }
  await choose.trigger('click')
  const setup = wrapper.getComponent(GameSetupDialog)

  expect(setup.props('statusesReady')).toBe(false)
  expect(setup.props('blocked')).toBe(true)
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('待开始')
  expect(computation).not.toHaveBeenCalled()
  expect(maintenance).not.toHaveBeenCalled()
  pending.resolve(response)
  await vi.waitFor(() => expect(setup.props('statusesReady')).toBe(true))

  expect(setup.props('blocked')).toBe(false)
  expect(wrapper.text()).toContain('今日已完成 0 / 6 种玩法')
  expect(wrapper.get('.daily-card').element).toBe(card)
  expect(wrapper.get('.daily-actions').element).toBe(actions)
  expect(computation).not.toHaveBeenCalled()
})
