import { createTestEngine } from './wasm'
import 'fake-indexeddb/auto'
import { createApp } from 'vue'
import { createPinia, disposePinia } from 'pinia'
import { openSudokuDatabase } from '@/storage/database'
import { createGameRepository } from '@/storage/repository'
import { createOwnershipCoordinator } from '@/storage/ownership'
import { createSaveQueue } from '@/storage/saveQueue'
import { gameRuntimeKey } from '@/runtime'
import type { GameRuntime } from '@/runtime'

export async function createTestRuntime() {
  const database = await openSudokuDatabase(crypto.randomUUID())
  const provider = () => Promise.resolve(database)
  const ownership = createOwnershipCoordinator(provider, { channel: null })
  const engine = await createTestEngine()
  const repository = createGameRepository(provider, engine)
  const runtime: GameRuntime = {
    ready: true,
    engine,
    createSeed: () => crypto.getRandomValues(new Uint8Array(32)),
    ownership,
    repository,
    ownerId: 'test-owner',
    createId: () => crypto.randomUUID(),
    monotonicNow: () => 0,
    wallNow: () => new Date('2026-10-11T01:00:00.000Z'),
    createSaveQueue: (token, revision) => createSaveQueue(repository, token, revision),
    worker: {
      conflicts: async () => ({ status: 'failed', message: 'No live conflict fixture' }),
      generateNotes: async () => ({ status: 'failed', message: 'No live notes fixture' }),
      generate: async () => ({ status: 'failed', message: 'No worker configured' }),
      assess: async () => ({ status: 'failed', message: 'No worker configured' }),
      hint: async () => ({ status: 'failed', message: 'No worker configured' }),
      dispose() {},
    },
  }
  const pinia = createPinia()
  const app = createApp({})
  app.use(pinia).provide(gameRuntimeKey, runtime)

  return {
    database,
    runtime,
    pinia,
    app,
    dispose() {
      ownership.dispose()
      runtime.worker.dispose()
      engine.dispose()
      disposePinia(pinia)
      database.close()
    },
  }
}
