import { expect, it } from 'vitest'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { isDigit } from '@/core/sudoku/types'
import { createApp } from 'vue'
import { createPinia, disposePinia } from 'pinia'
import { gameRuntimeKey } from '@/infrastructure/runtime'
it('restores yesterday and old puzzle versions without generating them again', async () => {
  const test = await createTestRuntime()
  const saved = makeSession({
    id: 'daily:2026-10-10:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-10', formalAttempt: true },
  })
  saved.puzzle = { ...saved.puzzle, puzzleVersion: 'older-puzzle' }
  const lease = await test.runtime.ownership.acquireOwnership(saved.id, 'seed-owner')
  if (!lease.ok || !lease.value) throw new Error('Expected fixture lease')
  await test.runtime.repository.writeSession(saved, 0, lease.value)
  await test.runtime.ownership.releaseOwnership(lease.value)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await game.restoreSession(saved.id)
  expect(game.phase).toBe('paused')
  expect(game.session?.puzzle.puzzleVersion).toBe('older-puzzle')
  expect(game.session?.metadata).toEqual(saved.metadata)
  await game.leaveGame()
  game.dispose()
  test.dispose()
})
it('uses one stable formal ID and keeps replay results separate', async () => {
  const test = await createTestRuntime()
  test.runtime.worker.generate = async (input) => ({
    status: 'completed',
    value: { ...makeSession().puzzle, ...input },
  })
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await game.startDaily('2026-10-11')
  expect(game.session?.id).toBe('daily:2026-10-11:formal')
  const puzzle = game.session?.puzzle
  if (!puzzle) throw new Error('Expected puzzle')
  for (let cell = 0; cell < 81; cell++) {
    const digit = puzzle.solution[cell]
    if (puzzle.givens[cell] === 0 && isDigit(digit)) game.dispatch({ kind: 'enter', cell, digit })
  }
  expect(game.phase).toBe('completed')
  await game.leaveGame()
  await game.startDaily('2026-10-11')
  expect(game.session?.metadata).toMatchObject({ formalAttempt: false })
  expect(game.session?.id).not.toBe('daily:2026-10-11:formal')
  const results = await test.runtime.repository.listResults()
  expect(results.ok && results.value.length).toBe(1)
  await game.leaveGame()
  game.dispose()
  test.dispose()
})
it('converges concurrent starts on a single formal session with one editor', async () => {
  const test = await createTestRuntime()
  test.runtime.worker.generate = async (input) => ({
    status: 'completed',
    value: { ...makeSession().puzzle, ...input },
  })
  const peerPinia = createPinia()
  const peerApp = createApp({})
    .use(peerPinia)
    .provide(gameRuntimeKey, { ...test.runtime, ownerId: 'peer-owner' })
  const first = test.app.runWithContext(() => useGameStore(test.pinia))
  const second = peerApp.runWithContext(() => useGameStore(peerPinia))
  await Promise.all([first.startDaily('2026-10-11'), second.startDaily('2026-10-11')])
  expect(await test.database.count('sessions')).toBe(1)
  expect([first.session?.id, second.session?.id]).toEqual([
    'daily:2026-10-11:formal',
    'daily:2026-10-11:formal',
  ])
  expect([first.readOnly, second.readOnly].filter(Boolean)).toHaveLength(1)
  await first.leaveGame()
  await second.leaveGame()
  first.dispose()
  second.dispose()
  disposePinia(peerPinia)
  test.dispose()
})
