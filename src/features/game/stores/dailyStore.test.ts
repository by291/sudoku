import { seedForTest } from '../../../../tests/support/generation'
import { encodeSeed } from '@/sudoku/seed'
import { expect, it, vi } from 'vitest'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeAssessment, makeSession } from '../../../../tests/support/gameFixtures'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { isDigit } from '@/core/sudoku/types'
import { createApp } from 'vue'
import { createPinia, disposePinia } from 'pinia'
import { gameRuntimeKey } from '@/runtime'
import { SUDOKU_VARIANTS } from '@/core/sudoku/rules/types'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
import type { GenerationInput } from '@/sudoku/generationInput'
import { getDailyIdentity, getDailyFormalId } from '@/features/game/model/daily'

it('restores yesterday and old puzzle versions without generating them again', async () => {
  const test = await createTestRuntime()
  const saved = makeSession({
    id: 'daily:2026-10-10:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-10', formalAttempt: true },
  })
  saved.puzzle = { ...saved.puzzle, puzzleVersion: 'older-puzzle' }
  saved.assessment = makeAssessment(saved.puzzle)
  const assess = vi.spyOn(test.runtime.worker, 'assess')
  const generate = vi.spyOn(test.runtime.worker, 'generate')
  const lease = await test.runtime.ownership.acquireOwnership(saved.id, 'seed-owner')
  if (!lease.ok || !lease.value) {
    throw new Error('Expected fixture lease')
  }

  await test.runtime.repository.writeSession(saved, 0, lease.value)
  await test.runtime.ownership.releaseOwnership(lease.value)
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await game.restoreSession(saved.id)

  expect(game.phase).toBe('paused')
  expect(game.session?.puzzle.puzzleVersion).toBe('older-puzzle')
  expect(game.session?.metadata).toEqual(saved.metadata)
  expect(game.session?.assessment).toEqual(saved.assessment)
  expect(assess).not.toHaveBeenCalled()
  expect(generate).not.toHaveBeenCalled()
  await game.leaveGame()
  game.dispose()
  test.dispose()
})
it('uses one stable formal ID and keeps replay results separate', async () => {
  const test = await createTestRuntime()
  test.runtime.worker.generate = async (input) => ({
    status: 'completed',
    value: { ...makeSession().puzzle, ...input, seed: encodeSeed(input.seed) },
  })
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await game.startDaily('2026-10-11', 'classic')

  expect(game.session?.id).toBe('daily:2026-10-11:formal')
  const puzzle = game.session?.puzzle
  if (!puzzle) {
    throw new Error('Expected puzzle')
  }

  for (let cell = 0; cell < 81; cell++) {
    const digit = puzzle.solution[cell]
    if (puzzle.givens[cell] === 0 && isDigit(digit)) {
      game.dispatch({ kind: 'enter', cell, digit })
    }
  }

  expect(game.phase).toBe('completed')
  await game.leaveGame()
  await game.startDaily('2026-10-11', 'classic')

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
    value: { ...makeSession().puzzle, ...input, seed: encodeSeed(input.seed) },
  })
  const peerPinia = createPinia()
  const peerApp = createApp({})
    .use(peerPinia)
    .provide(gameRuntimeKey, { ...test.runtime, ownerId: 'peer-owner' })
  const first = test.app.runWithContext(() => useGameStore(test.pinia))
  const second = peerApp.runWithContext(() => useGameStore(peerPinia))
  await Promise.all([
    first.startDaily('2026-10-11', 'classic'),
    second.startDaily('2026-10-11', 'classic'),
  ])

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
it('uses six Medium daily inputs and preserves independent formal attempts after Classic completes', async () => {
  const test = await createTestRuntime()
  const calls: GenerationInput[] = []
  test.runtime.worker.generate = async (input) => {
    calls.push(input)
    const fixture =
      input.variant === 'classic' ? makeSession().puzzle : VARIANT_FIXTURES[input.variant]

    return {
      status: 'completed',
      value: { ...makeSession().puzzle, ...fixture, ...input, seed: encodeSeed(input.seed) },
    }
  }
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  try {
    for (const variant of SUDOKU_VARIANTS) {
      expect(await game.startDaily('2026-10-11', variant)).toEqual({ status: 'ready' })
      expect(game.session?.id).toBe(getDailyFormalId('2026-10-11', variant))
      expect(game.activeVariant).toBe(variant)
      expect(game.session?.metadata).toMatchObject({ formalAttempt: true })
      if (variant === 'classic') {
        const puzzle = game.session?.puzzle
        if (!puzzle) {
          throw new Error('Expected daily puzzle')
        }

        for (let cell = 0; cell < 81; cell++) {
          const digit = puzzle.solution[cell]
          if (!puzzle.givens[cell] && isDigit(digit)) {
            game.dispatch({ kind: 'enter', cell, digit })
          }
        }
      }
    }

    expect(calls.map((input) => input.difficulty)).toEqual(Array(6).fill('medium'))
    expect(calls.map((input) => encodeSeed(input.seed))).toEqual(
      Array(6).fill(encodeSeed(seedForTest('daily:2026-10-11'))),
    )
    expect(await test.database.count('sessions')).toBe(6)
    expect(await game.startDaily('2026-10-11', 'arrow')).toEqual({ status: 'ready' })
    expect(calls).toHaveLength(6)
    expect(game.session?.metadata).toMatchObject({ formalAttempt: true })
    await game.startDaily('2026-10-11', 'classic')

    expect(game.session?.metadata).toMatchObject({ formalAttempt: false })
    expect(game.session?.id).not.toBe('daily:2026-10-11:formal')
  } finally {
    await game.leaveGame()
    game.dispose()
    test.dispose()
  }
})

it('keeps a saved v9 formal attempt authoritative across the current generator identity', async () => {
  const test = await createTestRuntime()
  const saved = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    elapsedMs: 71000,
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
  })
  const derive = vi.spyOn(test.runtime.engine, 'deriveSeed')
  saved.puzzle = { ...saved.puzzle, puzzleVersion: 'sudoku-v9', seed: 'daily:sudoku-v9:2026-10-11' }
  saved.assessment = makeAssessment(saved.puzzle)
  expect(
    getDailyIdentity('2026-10-11', 'classic', new Uint8Array(32)).input.puzzleVersion,
  ).not.toBe(saved.puzzle.puzzleVersion)
  const lease = await test.runtime.ownership.acquireOwnership(saved.id, 'v9-fixture')
  if (!lease.ok || !lease.value) {
    throw new Error('Expected fixture lease')
  }
  await test.runtime.repository.writeSession(saved, 0, lease.value)
  await test.runtime.ownership.releaseOwnership(lease.value)
  const generate = vi.spyOn(test.runtime.worker, 'generate')
  const assess = vi.spyOn(test.runtime.worker, 'assess')
  const game = test.app.runWithContext(() => useGameStore(test.pinia))

  await game.startDaily('2026-10-11', 'classic')

  expect(game.session?.id).toBe(saved.id)
  expect(game.session?.puzzle).toEqual(saved.puzzle)
  expect(game.session?.assessment).toEqual(saved.assessment)
  expect(game.session?.metadata).toEqual(saved.metadata)
  expect(game.session?.elapsedMs).toBe(71000)
  expect(generate).not.toHaveBeenCalled()
  expect(derive).not.toHaveBeenCalled()
  expect(assess).not.toHaveBeenCalled()
  await game.leaveGame()
  game.dispose()
  test.dispose()
})
