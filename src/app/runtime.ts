import { inject } from 'vue'
import type { InjectionKey } from 'vue'
import type { SudokuWorkerClient } from '../infrastructure/worker/client'
import { createSudokuWorkerClient } from '../infrastructure/worker/client'
import type { GameRepository } from '../infrastructure/storage/repository'
import { createGameRepository } from '../infrastructure/storage/repository'
import { openSudokuDatabase } from '../infrastructure/storage/database'
import type { OwnershipCoordinator, OwnershipToken } from '../infrastructure/ownership'
import { createOwnershipCoordinator } from '../infrastructure/ownership'
import type { SaveQueue } from '../infrastructure/storage/saveQueue'
import { createSaveQueue } from '../infrastructure/storage/saveQueue'
export interface GameRuntime {
  worker: SudokuWorkerClient
  repository: GameRepository
  ownership: OwnershipCoordinator
  createSaveQueue(token: OwnershipToken, revision: number): SaveQueue
  monotonicNow(): number
  wallNow(): Date
  createId(): string
  ownerId: string
  dispose?(): void
}
export const gameRuntimeKey: InjectionKey<GameRuntime> = Symbol('GameRuntime')
export function useGameRuntime(): GameRuntime {
  const runtime = inject(gameRuntimeKey)
  if (!runtime) throw new Error('GameRuntime must be provided by the application')
  return runtime
}
export function createGameRuntime(): GameRuntime {
  // Reuse one live connection; failed opens and version changes permit a fresh connection.
  let opening: ReturnType<typeof openSudokuDatabase> | null = null
  const provider = () => {
    if (!opening)
      opening = openSudokuDatabase()
        .then((database) => {
          database.addEventListener('versionchange', () => {
            opening = null
          })
          return database
        })
        .catch((error: unknown) => {
          opening = null
          throw error
        })
    return opening
  }
  const ownership = createOwnershipCoordinator(provider)
  const repository = createGameRepository(provider, { onReset: () => ownership.notifyReset() })
  const worker = createSudokuWorkerClient()
  return {
    worker,
    repository,
    ownership,
    createSaveQueue: (token, revision) => createSaveQueue(repository, token, revision),
    monotonicNow: () => performance.now(),
    wallNow: () => new Date(),
    createId: () => crypto.randomUUID(),
    ownerId: crypto.randomUUID(),
    dispose() {
      worker.dispose()
      ownership.dispose()
      if (opening) void opening.then((database) => database.close())
    },
  }
}
