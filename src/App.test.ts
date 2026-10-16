import { createApp } from 'vue'
import RootApp from '@/App.vue'
import * as moduleLoader from '@/sudoku/wasmModule'
import * as runtimeComposition from '@/runtime'
import { getTestModule } from '../tests/support/wasm'
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

it('publishes_the_ready_runtime_to_the_pinia_application_context', async () => {
  vi.spyOn(moduleLoader, 'loadSudokuModule').mockResolvedValue(getTestModule())
  vi.spyOn(runtimeComposition, 'createGameRuntime').mockImplementation((engine) => ({
    ...test.runtime,
    engine,
    dispose: () => engine.dispose(),
  }))
  const host = document.createElement('div')
  document.body.append(host)
  const application = createApp(RootApp, {
    installRuntime(runtime: runtimeComposition.GameRuntime) {
      application.provide(gameRuntimeKey, runtime)
    },
  })
  application.use(test.pinia).use(router)

  try {
    application.mount(host)
    await vi.waitFor(() => {
      expect(host.querySelector('main[aria-label="数独游戏"]')).not.toBeNull()
    })
  } finally {
    application.unmount()
    await flushPromises()
    host.remove()
  }
})

it('semantic_validation_awaits_ready_before_opening_transaction', async () => {
  let resolveModule: (module: WebAssembly.Module) => void = () => {
    throw new Error('Missing module resolver')
  }
  const pending = new Promise<WebAssembly.Module>((resolve) => {
    resolveModule = resolve
  })
  vi.spyOn(moduleLoader, 'loadSudokuModule').mockReturnValue(pending)
  const compose = vi
    .spyOn(runtimeComposition, 'createGameRuntime')
    .mockImplementation((engine) => ({ ...test.runtime, engine, dispose: () => engine.dispose() }))
  const transactions = vi.spyOn(test.database, 'transaction')
  const wrapper = mount(RootApp, {
    props: { installRuntime() {} },
    global: { plugins: [test.pinia, router] },
  })

  await flushPromises()

  expect(compose).not.toHaveBeenCalled()
  expect(transactions).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('正在加载')
  // Unmounting a pending bootstrap must release its late engine without touching storage.
  wrapper.unmount()
  resolveModule(getTestModule())
  await flushPromises()

  expect(compose).not.toHaveBeenCalled()
  expect(transactions).not.toHaveBeenCalled()
})
