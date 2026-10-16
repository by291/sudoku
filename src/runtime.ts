import { SEED_BYTE_LENGTH } from '@/sudoku/seed'
import type { MainSudokuEngine } from '@/sudoku/mainEngine'
import { inject } from 'vue'
import type { InjectionKey } from 'vue'
import type { SudokuWorkerClient } from '@/worker/client'
import { createSudokuWorkerClient } from '@/worker/client'
import type { GameRepository } from '@/storage/repository'
import { createGameRepository } from '@/storage/repository'
import { openSudokuDatabase } from '@/storage/database'
import type { OwnershipCoordinator, OwnershipToken } from '@/storage/ownership'
import { createOwnershipCoordinator } from '@/storage/ownership'
import type { SaveQueue } from '@/storage/saveQueue'
import { createSaveQueue } from '@/storage/saveQueue'

// Compose application-scoped browser services here; App owns their final disposal.
export interface GameRuntime {
  readonly ready: true
  engine: MainSudokuEngine
  createSeed(): Uint8Array
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
  if (!runtime) {
    throw new Error('GameRuntime must be provided by the application')
  }

  return runtime
}

export function createGameRuntime(
  engine: MainSudokuEngine,
  module: WebAssembly.Module,
): GameRuntime {
  let disposed = false
  // Reuse one live connection; failed opens and version changes permit a fresh connection.
  let opening: ReturnType<typeof openSudokuDatabase> | null = null
  const provider = () => {
    if (!opening) {
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
    }

    return opening
  }
  const ownership = createOwnershipCoordinator(provider)
  const repository = createGameRepository(provider, { onReset: () => ownership.notifyReset() })
  const worker = createSudokuWorkerClient(module, engine)

  return {
    ready: true,
    engine,
    createSeed: () => crypto.getRandomValues(new Uint8Array(SEED_BYTE_LENGTH)),
    worker,
    repository,
    ownership,
    createSaveQueue: (token, revision) => createSaveQueue(repository, token, revision),
    monotonicNow: () => performance.now(),
    wallNow: () => new Date(),
    createId: () => crypto.randomUUID(),
    ownerId: crypto.randomUUID(),
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      worker.dispose()
      ownership.dispose()
      engine.dispose()
      if (opening) {
        void opening.then((database) => database.close())
      }
    },
  }
}
