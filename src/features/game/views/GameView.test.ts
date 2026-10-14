import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { createGenerationInput } from '@/core/sudoku/generation'
import type { SessionMetadata } from '@/features/game/model/session'
import GameView from '@/features/game/views/GameView.vue'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
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

async function setup(metadata: SessionMetadata) {
  const test = await createTestRuntime()
  cleanups.push(test.dispose)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  cleanups.push(game.dispose)
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })
  await game.startGame(createGenerationInput('classic', 'easy', 'fixture'), metadata)
  game.selectCell(2)
  game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  game.pause()

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/game', component: GameView, props: { metadata, autoRestore: false } }],
  })
  await router.push('/game')
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
  })
  cleanups.push(async () => {
    wrapper.unmount()
    await flushPromises()
  })
  await flushPromises()

  return { ...test, game, wrapper }
}

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

    const starting = game.startGame(createGenerationInput('classic', 'easy', 'pending'), metadata)
    await vi.waitFor(() => expect(game.phase).toBe('generating'))
    await flushPromises()

    const statuses = wrapper
      .findAll('[role="status"]')
      .filter((element) => element.text().includes('正在生成题目'))
    expect(statuses).toHaveLength(1)
    expect(statuses[0]?.attributes('aria-live')).toBe('polite')
    expect(statuses[0]?.find('.n-spin-body').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.selection-message').text()).toBe('正在生成题目，请稍候。')
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
