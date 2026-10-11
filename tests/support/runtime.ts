import 'fake-indexeddb/auto'
import { createApp } from 'vue'
import { createPinia, disposePinia } from 'pinia'
import { openSudokuDatabase } from '@/storage/database'
import { createGameRepository } from '@/storage/repository'
import { createOwnershipCoordinator } from '@/infrastructure/ownership'
import { createSaveQueue } from '@/storage/saveQueue'
import { gameRuntimeKey } from '@/infrastructure/runtime'
import type { GameRuntime } from '@/infrastructure/runtime'
export async function createTestRuntime() {
  const database = await openSudokuDatabase(crypto.randomUUID())
  const provider = () => Promise.resolve(database)
  const ownership = createOwnershipCoordinator(provider, { channel: null })
  const repository = createGameRepository(provider)
  const runtime: GameRuntime = {
    ownership,
    repository,
    ownerId: 'test-owner',
    createId: () => crypto.randomUUID(),
    monotonicNow: () => 0,
    wallNow: () => new Date('2026-10-11T01:00:00.000Z'),
    createSaveQueue: (token, revision) => createSaveQueue(repository, token, revision),
    worker: {
      generate: async () => ({ status: 'failed', message: 'No worker configured' }),
      hint: async () => ({ status: 'failed', message: 'No worker configured' }),
      dispose() {},
    },
  }
  const pinia = createPinia(),
    app = createApp({})
  app.use(pinia).provide(gameRuntimeKey, runtime)
  return {
    database,
    runtime,
    pinia,
    app,
    dispose() {
      ownership.dispose()
      runtime.worker.dispose()
      disposePinia(pinia)
      database.close()
    },
  }
}
