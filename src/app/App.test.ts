import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createTestRuntime } from '../../tests/support/runtime'
import { gameRuntimeKey } from './runtime'
import App from './App.vue'
import { router } from './router'

const listeners = new Set<() => void>()
const media = {
  matches: false,
  addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
  removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
}
let test: Awaited<ReturnType<typeof createTestRuntime>>

beforeEach(async () => {
  listeners.clear()
  media.matches = false
  vi.stubGlobal('matchMedia', () => media)
  test = await createTestRuntime()
})
afterEach(async () => {
  await flushPromises()
  test.dispose()
})

it('changes themes and exposes an accessible home landmark', async () => {
  await router.push('/')
  await router.isReady()
  const wrapper = mount(App, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  expect(wrapper.find('main').exists()).toBe(true)
  expect(wrapper.get('main').attributes('aria-label')).toBe('数独游戏')
  await wrapper.get('button[aria-label="深色主题"]').trigger('click')
  expect(document.documentElement.dataset.theme).toBe('dark')
  await wrapper.get('button[aria-label="浅色主题"]').trigger('click')
  expect(document.documentElement.dataset.theme).toBe('light')
  wrapper.unmount()
})

it('follows system theme changes only while its scope is alive', async () => {
  const wrapper = mount(App, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  expect(wrapper.find('button[aria-label="跟随系统主题"]').exists()).toBe(true)
  await wrapper.get('button[aria-label="跟随系统主题"]').trigger('click')
  media.matches = true
  for (const listener of listeners) listener()
  expect(document.documentElement.dataset.theme).toBe('dark')
  wrapper.unmount()
  expect(listeners.size).toBe(0)
})
