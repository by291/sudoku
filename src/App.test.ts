import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import RootApp from '@/App.vue'
import * as moduleLoader from '@/sudoku/wasmModule'
import * as runtimeComposition from '@/runtime'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createTestRuntime } from '../tests/support/runtime'
import { NConfigProvider } from 'naive-ui'
import themeCss from '@/styles/theme.css?raw'
import { gameRuntimeKey } from '@/runtime'
import App from '@/ReadyApplication.vue'
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

it('keeps_semantic_validation_alive_until_the_final_save_settles', async () => {
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  let finish: () => void = () => {
    throw new Error('Missing save resolver')
  }
  const leaving = new Promise<void>((resolve) => {
    finish = resolve
  })
  const leave = vi.spyOn(game, 'leaveGame').mockReturnValue(leaving)
  const dispose = vi.fn(() => test.runtime.engine.dispose())
  test.runtime.dispose = dispose
  const wrapper = mount(App, {
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })

  wrapper.unmount()
  expect(dispose).not.toHaveBeenCalled()
  expect(test.runtime.engine.deriveSeed(new Uint8Array())).toHaveLength(32)
  finish()
  await flushPromises()

  expect(leave).toHaveBeenCalledOnce()
  expect(dispose).toHaveBeenCalledOnce()
  expect(() => test.runtime.engine.deriveSeed(new Uint8Array())).toThrow(/disposed/i)
})

it('waits_for_the_initial_route_before_publishing_the_runtime_to_pinia', async () => {
  const compose = vi.spyOn(runtimeComposition, 'createGameRuntime').mockReturnValue(test.runtime)
  let finishNavigation: () => void = () => {
    throw new Error('Missing navigation resolver')
  }
  const navigation = new Promise<void>((resolve) => {
    finishNavigation = resolve
  })
  const initialRouter = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: async () => {
          await navigation
          return { render: () => null }
        },
      },
    ],
  })
  const host = document.createElement('div')
  document.body.append(host)
  const application = createApp(RootApp, {
    installRuntime(runtime: runtimeComposition.GameRuntime) {
      application.provide(gameRuntimeKey, runtime)
    },
  })
  application.use(test.pinia).use(initialRouter)

  try {
    application.mount(host)
    await flushPromises()

    expect(compose).not.toHaveBeenCalled()
    expect(host.querySelector('main[aria-label="数独游戏"]')).toBeNull()
    finishNavigation()
    await vi.waitFor(() => {
      expect(host.querySelector('main[aria-label="数独游戏"]')).not.toBeNull()
    })
  } finally {
    finishNavigation()
    application.unmount()
    await flushPromises()
    host.remove()
  }
})

it('allows storage-backed browsing without requesting computation', async () => {
  const load = vi.spyOn(moduleLoader, 'loadSudokuModule')
  const initialize = vi.spyOn(test.runtime, 'ensureEngine')
  const compose = vi.spyOn(runtimeComposition, 'createGameRuntime').mockReturnValue(test.runtime)
  const wrapper = mount(RootApp, {
    props: { installRuntime() {} },
    global: {
      plugins: [test.pinia, router],
      provide: { [gameRuntimeKey]: test.runtime },
    },
  })

  await flushPromises()

  expect(compose).toHaveBeenCalledOnce()
  expect(wrapper.find('main[aria-label="数独游戏"]').exists()).toBe(true)
  expect(load).not.toHaveBeenCalled()
  expect(initialize).not.toHaveBeenCalled()
  wrapper.unmount()
})
