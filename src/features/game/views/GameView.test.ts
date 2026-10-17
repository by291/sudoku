import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { generationInput } from '../../../../tests/support/generation'
import type { SessionMetadata } from '@/features/game/model/session'
import GameView from '@/features/game/views/GameView.vue'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import LessonView from '@/features/learning/views/LessonView.vue'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { gameRuntimeKey } from '@/runtime'
import type { GenerateOutcome } from '@/worker/protocol'
import { deferred } from '../../../../tests/support/deferred'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { createTestRuntime } from '../../../../tests/support/runtime'

const cleanups: (() => void | Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function setup(metadata: SessionMetadata, path = '/game') {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  cleanups.push(game.dispose)
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })
  await game.startGame(generationInput('classic', 'easy', 'fixture'), metadata)
  game.selectCell(2)
  game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  game.pause()

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/game/:lessonId?', component: GameView, props: { metadata, autoRestore: false } },
      { path: '/home', component: { template: '<p>Home destination</p>' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(async () => {
    wrapper.unmount()
    await flushPromises()
  })
  await flushPromises()

  return { ...test, game, wrapper, router }
}

it('retains a failed departure and saves the original board before retrying navigation', async () => {
  const { game, runtime, wrapper, router, database } = await setup({ kind: 'free' })
  await game.resume()
  await game.periodicSave()
  const id = game.session?.id
  if (!id) {
    throw new Error('Missing fixture session')
  }
  const write = runtime.repository.writeSession
  runtime.repository.writeSession = async () => ({
    ok: false,
    error: { kind: 'unavailable', message: 'Injected write failure' },
  })
  game.dispatch({ kind: 'enter', cell: 3, digit: 6 })

  await router.push('/home')
  await flushPromises()

  expect(router.currentRoute.value.path).toBe('/game')
  expect(game.session?.entries[3]).toBe(6)
  expect(game.saveState).toBe('failed')
  expect(wrapper.text()).toContain('重试保存')
  expect(await database.get('sessions', id)).toHaveProperty('session.entries.3', 0)

  runtime.repository.writeSession = write
  await game.retrySave()
  await router.push('/home')

  expect(router.currentRoute.value.path).toBe('/home')
  expect(await database.get('sessions', id)).toHaveProperty('session.entries.3', 6)
})

it('keeps the departing board visible and inert until a delayed save completes', async () => {
  const { game, runtime, wrapper, router } = await setup({ kind: 'free' })
  await game.resume()
  game.selectCell(3)
  game.dispatch({ kind: 'toggle-note', cell: 3, digit: 6 })
  await game.periodicSave()
  await flushPromises()
  await wrapper.get('button[aria-label="更多操作"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('button[aria-label="更多操作"]').attributes('aria-expanded')).toBe('true')
  const originalBoard = [...game.board]
  const entered = deferred<void>()
  const gate = deferred<void>()
  cleanups.push(() => gate.resolve())
  const write = runtime.repository.writeSession
  runtime.repository.writeSession = async (...args) => {
    entered.resolve()
    await gate.promise
    return write(...args)
  }

  const leaving = router.push('/home')
  await entered.promise
  await flushPromises()

  expect(router.currentRoute.value.path).toBe('/game')
  expect(wrapper.getComponent(SudokuBoard).props('obscured')).toBe(false)
  expect(wrapper.find('.pause-cover').exists()).toBe(false)
  expect(wrapper.get('.game-page').attributes('inert')).toBeDefined()
  expect(wrapper.get('button[aria-label="更多操作"]').attributes('aria-expanded')).toBe('false')
  expect(wrapper.get('button[aria-label="快捷笔记数字6"]').attributes('aria-pressed')).toBe('true')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
  expect(game.board).toEqual(originalBoard)

  gate.resolve()
  await leaving
  expect(router.currentRoute.value.path).toBe('/home')
})

it('guards practice query exits and clears its outgoing hold when the view is reused', async () => {
  const { game, runtime, router, wrapper } = await setup(
    { kind: 'learning', lessonId: 'rules' },
    '/game/rules?practice=1',
  )
  await game.resume()
  await game.periodicSave()
  const write = runtime.repository.writeSession
  runtime.repository.writeSession = async () => ({
    ok: false,
    error: { kind: 'unavailable', message: 'Injected write failure' },
  })
  game.dispatch({ kind: 'enter', cell: 3, digit: 6 })

  await router.push('/game/rules')

  expect(router.currentRoute.value.query.practice).toBe('1')
  expect(game.session?.entries[3]).toBe(6)
  runtime.repository.writeSession = write
  await game.retrySave()
  await router.push('/game/rules')
  await flushPromises()

  expect(router.currentRoute.value.query.practice).toBeUndefined()
  expect(wrapper.get('.game-page').attributes('inert')).toBeUndefined()
})

it('conceals the board immediately when backgrounding interrupts a delayed departure', async () => {
  const { game, runtime, wrapper, router } = await setup({ kind: 'free' })
  await game.resume()
  await game.periodicSave()
  const entered = deferred<void>()
  const gate = deferred<void>()
  cleanups.push(() => gate.resolve())
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  cleanups.push(() => hidden.mockRestore())
  const write = runtime.repository.writeSession
  runtime.repository.writeSession = async (...args) => {
    entered.resolve()
    await gate.promise
    return write(...args)
  }
  const leaving = router.push('/home')
  await entered.promise
  await flushPromises()

  hidden.mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()

  expect(wrapper.getComponent(SudokuBoard).props('obscured')).toBe(true)
  expect(wrapper.find('.pause-cover').exists()).toBe(true)
  gate.resolve()
  await leaving
  expect(router.currentRoute.value.path).toBe('/game')
})

it.each(['loaded', 'cancelled', 'failed', 'replaced'] as const)(
  'holds the original presentation until a newer destination is %s',
  async (outcome) => {
    const { game, runtime, wrapper, router } = await setup({ kind: 'free' })
    await game.resume()
    await game.periodicSave()
    const entered = deferred<void>()
    const saveGate = deferred<void>()
    const routeEntered = deferred<void>()
    const routeGate = deferred<{ template: string }>()
    cleanups.push(() => {
      saveGate.resolve()
      routeGate.resolve({ template: '<p>Later destination</p>' })
    })
    router.addRoute({
      path: '/later',
      component: () => {
        routeEntered.resolve()
        return routeGate.promise.then((component) => {
          if (outcome === 'failed') {
            throw new Error('Destination loading failed')
          }
          return component
        })
      },
    })
    if (outcome === 'cancelled') {
      router.beforeResolve((to) => (to.path === '/later' ? false : undefined))
    }
    const write = runtime.repository.writeSession
    runtime.repository.writeSession = async (...args) => {
      entered.resolve()
      await saveGate.promise
      return write(...args)
    }

    const first = router.push('/home')
    await entered.promise
    const newer = router.push('/later')
    await routeEntered.promise
    saveGate.resolve()
    await first
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/game')
    expect(wrapper.getComponent(SudokuBoard).props('obscured')).toBe(false)
    expect(wrapper.find('.pause-cover').exists()).toBe(false)
    if (outcome === 'replaced') {
      await router.push('/game#stay')
    }
    routeGate.resolve({ template: '<p>Later destination</p>' })
    if (outcome === 'failed') {
      await expect(newer).rejects.toThrow('Destination loading failed')
    } else {
      await newer
    }
    await flushPromises()

    if (outcome === 'loaded') {
      expect(router.currentRoute.value.path).toBe('/later')
    } else {
      expect(router.currentRoute.value.path).toBe('/game')
      expect(wrapper.get('.game-page').attributes('inert')).toBeUndefined()
      expect(wrapper.getComponent(SudokuBoard).props('obscured')).toBe(true)
    }
  },
)

it('still checks the save when backgrounding occurs before the destination finishes loading', async () => {
  const { game, runtime, wrapper, router } = await setup({ kind: 'free' })
  await game.resume()
  await game.periodicSave()
  const entered = deferred<void>()
  const gate = deferred<{ template: string }>()
  cleanups.push(() => gate.resolve({ template: '<p>Later destination</p>' }))
  router.addRoute({
    path: '/later',
    component: () => {
      entered.resolve()
      return gate.promise
    },
  })
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  cleanups.push(() => hidden.mockRestore())
  runtime.repository.writeSession = async () => ({
    ok: false,
    error: { kind: 'unavailable', message: 'Injected write failure' },
  })
  game.dispatch({ kind: 'enter', cell: 3, digit: 6 })

  const leaving = router.push('/later')
  await entered.promise
  hidden.mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  gate.resolve({ template: '<p>Later destination</p>' })
  await leaving
  await flushPromises()

  expect(router.currentRoute.value.path).toBe('/game')
  expect(game.session?.entries[3]).toBe(6)
  expect(game.saveState).toBe('failed')
  expect(wrapper.get('.game-page').attributes('inert')).toBeUndefined()
  expect(wrapper.text()).toContain('重试保存')
})

it('starts a new lesson practice after leaving the preceding course practice', async () => {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  cleanups.push(game.dispose)
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/learn/:lessonId', component: LessonView }],
  })
  await router.push('/learn/rules?practice=1')
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(async () => {
    wrapper.unmount()
    await flushPromises()
  })
  const click = async (label: string) => {
    const findButton = () =>
      [...document.querySelectorAll('button')].find(
        (element) => element.textContent?.trim() === label,
      )
    await vi.waitFor(() => expect(findButton()).toBeDefined())
    const button = findButton()
    if (!button) {
      throw new Error(`Missing button: ${label}`)
    }
    button.click()
    await flushPromises()
  }
  await flushPromises()
  await click('开始游戏')
  await vi.waitFor(() =>
    expect(game.session?.metadata).toEqual({ kind: 'learning', lessonId: 'rules' }),
  )

  await router.push('/learn/naked-single?practice=1')
  await flushPromises()
  await click('开始游戏')
  await click('确认开始')

  await vi.waitFor(() =>
    expect(game.session?.metadata).toEqual({ kind: 'learning', lessonId: 'naked-single' }),
  )
  expect(wrapper.findComponent(SudokuBoard).exists()).toBe(true)
})

const gameModes: SessionMetadata[] = [
  { kind: 'free' },
  { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: false },
  { kind: 'learning', lessonId: 'rules' },
]

it.each(gameModes)(
  'shows cancellable loading for $kind while retaining the paused board and rejecting input',
  async (metadata) => {
    const { game, runtime, wrapper } = await setup(metadata)
    const oldSessionId = game.session?.id
    const oldBoard = [...game.board]
    const response = deferred<GenerateOutcome>()
    runtime.worker.generate = (_input, signal) => {
      signal?.addEventListener('abort', () => response.resolve({ status: 'cancelled' }), {
        once: true,
      })

      return response.promise
    }

    const starting = game.startGame(generationInput('classic', 'easy', 'pending'), metadata)
    await vi.waitFor(() => expect(game.phase).toBe('generating'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('正在生成题目…')
    expect(wrapper.get('[aria-label="逻辑提示"]').attributes('disabled')).toBeDefined()
    await vi.waitFor(() => expect(wrapper.text()).toContain('正在生成题目…'))

    const statuses = wrapper
      .findAll('[role="status"]')
      .filter((element) => element.text().includes('正在生成题目'))
    expect(statuses).toHaveLength(1)
    expect(statuses[0]?.attributes('aria-live')).toBe('polite')
    expect(statuses[0]?.find('.n-spin-body').attributes('aria-hidden')).toBe('true')
    expect(game.session?.id).toBe(oldSessionId)
    expect(wrapper.getComponent(SudokuBoard).props('board')).toEqual(oldBoard)
    expect(wrapper.getComponent(SudokuBoard).props('obscured')).toBe(true)
    expect(
      wrapper.findAll('.cell').every((cell) => cell.attributes('disabled') !== undefined),
    ).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
    expect(game.board).toEqual(oldBoard)

    const cancel = wrapper.findAll('button').find((button) => button.text() === '取消出题')
    if (!cancel) {
      throw new Error('Missing generation cancellation action')
    }
    await cancel.trigger('click')
    await starting
    await flushPromises()

    expect(wrapper.text()).not.toContain('正在生成题目…')
    expect(game.phase).toBe('paused')
    expect(game.session?.id).toBe(oldSessionId)
    expect(game.board).toEqual(oldBoard)
    expect(wrapper.getComponent(SudokuBoard).props('obscured')).toBe(true)
  },
)

it('toggles quick notes independently from input mode and reflects selection and history', async () => {
  const { game, wrapper } = await setup({ kind: 'free' })
  await game.resume()
  game.selectCell(3)
  await flushPromises()

  const quickNote = wrapper.get('button[aria-label="快捷笔记数字5"]')
  await quickNote.trigger('click')

  expect(game.noteMode).toBe(false)
  expect(game.session?.notes[3]).toBe(16)
  expect(game.board[3]).toBe(0)
  expect(quickNote.attributes('aria-pressed')).toBe('true')

  await wrapper.get('button[aria-label="撤销"]').trigger('click')
  expect(game.session?.notes[3]).toBe(0)
  expect(quickNote.attributes('aria-pressed')).toBe('false')

  await wrapper.get('button[aria-label="重做"]').trigger('click')
  expect(quickNote.attributes('aria-pressed')).toBe('true')

  game.selectCell(5)
  game.toggleNoteMode()
  await flushPromises()
  expect(quickNote.attributes('aria-pressed')).toBe('false')

  await quickNote.trigger('click')
  expect(game.noteMode).toBe(true)
  expect(game.session?.notes[5]).toBe(16)
  expect(game.session?.notes[3]).toBe(16)
})

it.each(['given', 'paused', 'read-only'] as const)(
  'disables quick notes for a %s cell or session',
  async (state) => {
    const { game, wrapper } = await setup({ kind: 'free' })
    await game.resume()
    game.selectCell(state === 'given' ? 0 : 3)
    if (state === 'paused') {
      game.pause()
    } else if (state === 'read-only') {
      game.readOnly = true
    }
    await flushPromises()

    const quickNote = wrapper.get('button[aria-label="快捷笔记数字5"]')
    expect(quickNote.attributes('disabled')).toBeDefined()
    await quickNote.trigger('click')

    expect(game.session?.notes.every((mask) => mask === 0)).toBe(true)
    expect(game.noteMode).toBe(false)
  },
)

it.each(['paused', 'generating'] as const)(
  'conceals quick-note selection while %s without changing saved notes',
  async (state) => {
    const { game, wrapper, runtime } = await setup({ kind: 'free' })
    await game.resume()
    game.selectCell(3)
    await flushPromises()
    const quickNote = wrapper.get('button[aria-label="快捷笔记数字5"]')
    await quickNote.trigger('click')
    expect(quickNote.attributes('aria-pressed')).toBe('true')

    let starting: ReturnType<typeof game.startGame> | undefined
    if (state === 'paused') {
      game.pause()
    } else {
      const response = deferred<GenerateOutcome>()
      runtime.worker.generate = (_input, signal) => {
        signal?.addEventListener('abort', () => response.resolve({ status: 'cancelled' }), {
          once: true,
        })

        return response.promise
      }
      starting = game.startGame(generationInput('classic', 'easy', 'pending'), { kind: 'free' })
      await vi.waitFor(() => expect(game.phase).toBe('generating'))
    }
    await flushPromises()

    try {
      expect(wrapper.getComponent(SudokuBoard).props('obscured')).toBe(true)
      expect(quickNote.attributes('disabled')).toBeDefined()
      expect(quickNote.attributes('aria-pressed')).toBe('false')
      expect(game.session?.notes[3]).toBe(16)
    } finally {
      if (starting) {
        game.cancelLoading()
        await starting
      }
    }

    await game.resume()
    await flushPromises()

    expect(game.session?.notes[3]).toBe(16)
    expect(quickNote.attributes('aria-pressed')).toBe('true')
  },
)

it('disables hints immediately while deferring their visible progress', async () => {
  const { game, wrapper, runtime } = await setup({ kind: 'free' })
  await game.resume()
  const response = deferred<Awaited<ReturnType<typeof runtime.worker.hint>>>()
  runtime.worker.hint = () => response.promise
  const hintButton = wrapper.get('button[aria-label="逻辑提示"]')

  await hintButton.trigger('click')

  expect(hintButton.attributes('disabled')).toBeDefined()
  expect(hintButton.classes()).not.toContain('n-button--loading')
  expect(wrapper.text()).not.toContain('正在寻找逻辑提示')
  await vi.waitFor(() => expect(wrapper.text()).toContain('正在寻找逻辑提示'))
  expect(hintButton.classes()).toContain('n-button--loading')

  response.resolve({ status: 'failed', message: 'Hint unavailable' })
  await flushPromises()

  expect(wrapper.text()).not.toContain('正在寻找逻辑提示')
  expect(hintButton.attributes('disabled')).toBeUndefined()
  expect(wrapper.get('[role="alert"]').text()).toContain('提示暂时无法生成')
})

it('reserves the same board and controls while a saved session loads', async () => {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  cleanups.push(game.dispose)
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })
  await game.startGame(generationInput('classic', 'easy', 'fixture'), { kind: 'free' })
  const sessionId = game.session?.id
  await game.clearActiveSession()
  if (!sessionId) {
    throw new Error('Missing saved fixture')
  }
  const saved = await test.runtime.repository.readSession(sessionId)
  const response = deferred<typeof saved>()
  test.runtime.repository.readSession = () => response.promise
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/game', component: GameView }],
  })
  await router.push({ path: '/game', query: { session: sessionId } })
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(() => wrapper.unmount())
  const reservedBoard = wrapper.get('.board-wrap').element
  const reservedControls = wrapper.get('[aria-label="游戏操作"]').element

  expect(wrapper.findComponent(SudokuBoard).exists()).toBe(false)
  expect(wrapper.get('button[aria-label="快捷笔记数字5"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).not.toContain('正在读取存档…')
  await vi.waitFor(() => expect(wrapper.text()).toContain('正在读取存档…'))
  expect(wrapper.get('.board-wrap').text()).toContain('正在读取存档…')

  response.resolve(saved)
  await flushPromises()
  await vi.waitFor(() => expect(game.session?.id).toBe(sessionId))

  expect(wrapper.findComponent(SudokuBoard).exists()).toBe(true)
  expect(wrapper.get('.board-wrap').element).toBe(reservedBoard)
  expect(wrapper.get('[aria-label="游戏操作"]').element).toBe(reservedControls)
  expect(wrapper.text()).not.toContain('正在读取存档…')
  expect(game.phase).toBe('paused')
})
