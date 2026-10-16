import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'

const mocks = vi.hoisted(() => ({ load: vi.fn(), createEngine: vi.fn(), createRuntime: vi.fn() }))
vi.mock('@/sudoku/wasmModule', () => ({ loadSudokuModule: mocks.load }))
vi.mock('@/sudoku/mainEngine', () => ({ createMainEngine: mocks.createEngine }))
vi.mock('@/runtime', () => ({
  gameRuntimeKey: Symbol('runtime'),
  createGameRuntime: mocks.createRuntime,
}))

function createBootstrapRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})

it('failed_or_mismatched_module_blocks_semantic_actions', async () => {
  mocks.load.mockRejectedValue(new Error('Missing WASM asset'))
  const wrapper = mount(App, {
    props: { installRuntime: vi.fn() },
    global: { plugins: [createBootstrapRouter()], stubs: { ReadyApplication: true } },
  })

  await flushPromises()

  expect(wrapper.text()).toContain('数独引擎加载失败，请重试。')
  expect(wrapper.find('button').text()).toBe('重试')
  expect(mocks.createRuntime).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('retries_after_failure_and_installs_only_a_ready_runtime', async () => {
  mocks.load.mockRejectedValueOnce(new Error('Version mismatch')).mockResolvedValueOnce({})
  const dispose = vi.fn()
  mocks.createEngine.mockResolvedValue({ dispose })
  const disposeRuntime = vi.fn()
  mocks.createRuntime.mockReturnValue({ dispose: disposeRuntime })
  const wrapper = mount(App, {
    props: { installRuntime: vi.fn() },
    global: { plugins: [createBootstrapRouter()], stubs: { ReadyApplication: true } },
  })
  await flushPromises()

  await wrapper.get('button').trigger('click')
  await flushPromises()

  expect(mocks.createRuntime).toHaveBeenCalledTimes(1)
  expect(wrapper.findComponent({ name: 'ReadyApplication' }).exists()).toBe(true)
  wrapper.unmount()
  expect(disposeRuntime).toHaveBeenCalledOnce()
})

it('retry_cannot_publish_a_disposed_generation', async () => {
  mocks.load.mockResolvedValue({})
  let finish: (value: { dispose(): void }) => void = () => {
    throw new Error('Missing init resolver')
  }
  mocks.createEngine.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const wrapper = mount(App, {
    props: { installRuntime: vi.fn() },
    global: { plugins: [createBootstrapRouter()] },
  })
  await flushPromises()
  const dispose = vi.fn()

  wrapper.unmount()
  finish({ dispose })
  await flushPromises()

  expect(dispose).toHaveBeenCalledOnce()
  expect(mocks.createRuntime).not.toHaveBeenCalled()
})
