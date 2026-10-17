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

it('makes browsing available without requesting the computation module', async () => {
  mocks.load.mockImplementation(() => new Promise(() => {}))
  const dispose = vi.fn()
  const ensureEngine = vi.fn()
  mocks.createRuntime.mockReturnValue({ dispose, ensureEngine })
  const install = vi.fn()
  const wrapper = mount(App, {
    props: { installRuntime: install },
    global: { plugins: [createBootstrapRouter()], stubs: { ReadyApplication: true } },
  })

  await flushPromises()

  expect(wrapper.findComponent({ name: 'ReadyApplication' }).exists()).toBe(true)
  expect(install).toHaveBeenCalledOnce()
  expect(mocks.load).not.toHaveBeenCalled()
  expect(ensureEngine).not.toHaveBeenCalled()
  wrapper.unmount()
  expect(dispose).toHaveBeenCalledOnce()
})

it('retries an application setup failure without starting computation', async () => {
  const dispose = vi.fn()
  mocks.createRuntime
    .mockImplementationOnce(() => {
      throw new Error('Services unavailable')
    })
    .mockReturnValueOnce({ dispose })
  const wrapper = mount(App, {
    props: { installRuntime: vi.fn() },
    global: { plugins: [createBootstrapRouter()], stubs: { ReadyApplication: true } },
  })
  await flushPromises()

  expect(wrapper.text()).toContain('加载失败，请重试')
  await wrapper.get('button').trigger('click')
  await flushPromises()

  expect(mocks.createRuntime).toHaveBeenCalledTimes(2)
  expect(wrapper.findComponent({ name: 'ReadyApplication' }).exists()).toBe(true)
  expect(mocks.load).not.toHaveBeenCalled()
  wrapper.unmount()
  expect(dispose).toHaveBeenCalledOnce()
})
