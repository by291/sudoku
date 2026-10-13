import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createTestRuntime } from '../tests/support/runtime'
import { NConfigProvider } from 'naive-ui'
import themeCss from '@/styles/theme.css?raw'
import { gameRuntimeKey } from '@/runtime'
import App from '@/App.vue'
import { router } from '@/router/index'

const listeners = new Set<() => void>()
const media = {
  matches: false,
  addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
  removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
}
let test: Awaited<ReturnType<typeof createTestRuntime>>
let themeStyle: HTMLStyleElement

beforeEach(async () => {
  themeStyle = document.createElement('style')
  themeStyle.textContent = themeCss
  document.head.append(themeStyle)

  listeners.clear()
  media.matches = false
  vi.stubGlobal('matchMedia', () => media)
  test = await createTestRuntime()
})
afterEach(async () => {
  await flushPromises()
  test.dispose()
  themeStyle.remove()
})

it('changes themes and exposes an accessible home landmark', async () => {
  await router.push('/')
  await router.isReady()
  const wrapper = mount(App, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })

  expect(wrapper.find('main').exists()).toBe(true)
  expect(wrapper.get('main').attributes('aria-label')).toBe('数独游戏')
  await wrapper.get('input[type="radio"][value="dark"]').trigger('change')

  expect(document.documentElement.dataset.theme).toBe('dark')
  const overrides = wrapper.findComponent(NConfigProvider).props('themeOverrides')
  const palette = getComputedStyle(document.documentElement)

  expect(overrides?.common?.textColor1).toBe(palette.getPropertyValue('--text').trim())
  expect(overrides?.Button?.color).toBe(palette.getPropertyValue('--surface').trim())
  await wrapper.get('input[type="radio"][value="light"]').trigger('change')

  expect(document.documentElement.dataset.theme).toBe('light')
  wrapper.unmount()
})

it('follows system theme changes only while its scope is alive', async () => {
  const wrapper = mount(App, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })

  expect(wrapper.find('input[type="radio"][value="system"]').exists()).toBe(true)
  await wrapper.get('input[type="radio"][value="system"]').trigger('change')
  media.matches = true

  for (const listener of listeners) {
    listener()
  }

  expect(document.documentElement.dataset.theme).toBe('dark')
  wrapper.unmount()

  expect(listeners.size).toBe(0)
})
