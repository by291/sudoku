import { validatePuzzleSnapshot } from '@/sudoku/puzzleSnapshot'
import { copyGenerationInput } from '@/sudoku/generationInput'
import { shallowRef } from 'vue'
import type { Ref } from 'vue'
import type { GameRuntime } from '@/runtime'
import type { OwnershipToken } from '@/storage/ownership'
import type { GenerationInput } from '@/sudoku/generationInput'
import type { Puzzle } from '@/sudoku/contracts'
import type { SudokuVariant } from '@/sudoku/contracts'
import {
  getDailyIdentity,
  getDailyFormalId,
  getDailySeedMaterial,
} from '@/features/game/model/daily'
import { createSession } from '@/features/game/model/session'
import type { GameSession, SessionMetadata, SessionPhase } from '@/features/game/model/session'
import type { GameTransition } from '@/features/game/model/variants'
import type { StorageOutcome, SessionRecord } from '@/storage/records'
import type { SessionPersistence } from '@/features/game/stores/sessionPersistence'
import type { PuzzleAssessment } from '@/sudoku/contracts'

export type SessionTransitionHost = {
  session: Ref<GameSession | null>
  phase: Ref<SessionPhase>
  readOnly: Ref<boolean>
  error: Ref<string | null>
  pause(): void
  install(next: GameSession, token: OwnershipToken | null, revision: number, paused: boolean): void
  retrySave(): Promise<void>
  activateClock(): void
  dropSession(): void
}

export function createSessionTransitions(
  runtime: GameRuntime,
  host: SessionTransitionHost,
  persistence: SessionPersistence,
) {
  const { session, phase, readOnly, error } = host
  const { pause, install } = host
  const { saveState, saveMessage } = persistence
  const failedGeneration = shallowRef<{
    input: GenerationInput
    metadata: SessionMetadata
    id?: string
  } | null>(null)
  // One generation fences hints, reads, leases and installs, even after a dataset reset.
  let operationGeneration = 0
  let controller: AbortController | null = null

  function cancelOperation() {
    operationGeneration++
    controller?.abort()
    controller = null
  }

  function beginOperation() {
    cancelOperation()
    const epoch = operationGeneration
    const job = new AbortController()
    controller = job

    return {
      signal: job.signal,
      isCurrent: () => epoch === operationGeneration,
      finish() {
        if (controller === job) {
          controller = null
        }
      },
    }
  }

  function handleSave(result: StorageOutcome<unknown>) {
    persistence.report(result)
    if (
      !result.ok &&
      (result.error.kind === 'ownership-lost' || result.error.kind === 'revision-conflict')
    ) {
      readOnly.value = true
      pause()
    }
  }

  async function prepareTransition(): Promise<GameTransition> {
    pause()
    cancelOperation()
    const epoch = operationGeneration
    await persistence.waitForRelease()
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    if (!session.value) {
      return { status: 'ready' }
    }

    if (readOnly.value) {
      return persistence.capture().dirty
        ? { status: 'blocked', reason: 'ownership' }
        : { status: 'ready' }
    }

    if (persistence.capture().dirty || saveState.value === 'failed') {
      await host.retrySave()
    }

    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    const result = await persistence.flush()
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    if (result && !result.ok) {
      handleSave(result)
    }

    if (persistence.capture().dirty || saveState.value === 'failed' || (result && !result.ok)) {
      error.value = '原局保存失败，已保留在内存中。请重试保存后再切换。'

      return { status: 'blocked', reason: 'save' }
    }

    return { status: 'ready' }
  }

  async function findFreeSession(
    variant: SudokuVariant,
  ): Promise<StorageOutcome<SessionRecord | null>> {
    return runtime.repository.readSlot('free', variant)
  }

  async function restoreSession(id: string): Promise<GameTransition> {
    const prepared = await prepareTransition()
    if (prepared.status !== 'ready') {
      return prepared
    }

    return loadSavedSession(id, operationGeneration)
  }

  async function reloadLatestSession(): Promise<GameTransition> {
    // The caller explicitly confirms replacing conflicted local edits; ordinary transitions stay guarded.
    if (!session.value || !readOnly.value) {
      return { status: 'blocked', reason: 'ownership' }
    }

    const id = session.value.id
    pause()
    cancelOperation()

    return loadSavedSession(id, operationGeneration)
  }

  async function prepareEngine(epoch: number): Promise<GameTransition> {
    try {
      await runtime.ensureEngine()
    } catch {
      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }
      error.value = '游戏准备失败，请重试。'
      phase.value = session.value ? 'paused' : 'failed'
      return { status: 'blocked', reason: 'load' }
    }
    return epoch === operationGeneration ? { status: 'ready' } : { status: 'cancelled' }
  }

  async function loadSavedSession(id: string, epoch: number): Promise<GameTransition> {
    const computation = await prepareEngine(epoch)
    if (computation.status !== 'ready') {
      return computation
    }

    await persistence.release()
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    const lease = await runtime.ownership.acquireOwnership(id, runtime.ownerId)
    if (epoch !== operationGeneration) {
      if (lease.ok && lease.value) {
        await runtime.ownership.releaseOwnership(lease.value)
      }

      return { status: 'cancelled' }
    }

    if (!lease.ok) {
      handleSave(lease)

      return { status: 'blocked', reason: 'ownership' }
    }

    // Read after acquiring the lease so a peer's final write is included before editing resumes.
    const records = await runtime.repository.readSession(id)
    if (epoch !== operationGeneration) {
      if (lease.value) {
        await runtime.ownership.releaseOwnership(lease.value)
      }

      return { status: 'cancelled' }
    }

    if (!records.ok) {
      if (lease.value) {
        await runtime.ownership.releaseOwnership(lease.value)
      }

      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }

      error.value = '读取存档失败，请重试。'
      phase.value = session.value ? 'paused' : 'failed'

      return { status: 'blocked', reason: 'load' }
    }

    const record = records.value
    if (!record) {
      if (lease.value) {
        await runtime.ownership.releaseOwnership(lease.value)
      }

      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }

      error.value = '找不到这份存档，可能已被清除。'
      phase.value = session.value ? 'paused' : 'failed'

      return { status: 'blocked', reason: 'load' }
    }

    readOnly.value = lease.value === null
    install(record.session, lease.value, record.revision, true)
    error.value = null
    saveState.value = 'saved'
    saveMessage.value = null

    return { status: 'ready' }
  }

  async function findSession(id: string): Promise<StorageOutcome<SessionRecord | null>> {
    return runtime.repository.readSession(id)
  }

  async function findPracticeSession(): Promise<StorageOutcome<SessionRecord | null>> {
    return runtime.repository.readSlot('learning')
  }

  async function clearActiveSession(): Promise<GameTransition> {
    const prepared = await prepareTransition()
    if (prepared.status !== 'ready') {
      return prepared
    }

    const epoch = operationGeneration
    await persistence.release()
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    host.dropSession()

    return { status: 'ready' }
  }

  async function resume() {
    if (!session.value || session.value.completion || phase.value === 'generating') {
      return
    }

    const epoch = operationGeneration
    const id = session.value.id
    await persistence.waitForRelease()
    if (epoch !== operationGeneration || session.value?.id !== id) {
      return
    }

    if (readOnly.value || !persistence.capture().token) {
      const lease = await runtime.ownership.acquireOwnership(id, runtime.ownerId)
      if (epoch !== operationGeneration || session.value?.id !== id) {
        if (lease.ok && lease.value) {
          await runtime.ownership.releaseOwnership(lease.value)
        }

        return
      }

      if (lease.ok && !lease.value) {
        readOnly.value = true

        return
      }

      if (lease.ok && lease.value) {
        const catalog = await runtime.repository.readSession(id)
        if (epoch !== operationGeneration || session.value?.id !== id) {
          await runtime.ownership.releaseOwnership(lease.value)

          return
        }

        if (!catalog.ok) {
          await runtime.ownership.releaseOwnership(lease.value)
          if (epoch !== operationGeneration || session.value?.id !== id) {
            return
          }

          handleSave(catalog)

          return
        }

        const stored = catalog.value
        if (
          persistence.capture().dirty &&
          (stored?.revision ?? 0) !== persistence.capture().revision
        ) {
          await runtime.ownership.releaseOwnership(lease.value)
          if (epoch !== operationGeneration || session.value?.id !== id) {
            return
          }

          handleSave({
            ok: false,
            error: {
              kind: 'revision-conflict',
              message: 'The saved game changed while local edits were unsaved',
            },
          })

          return
        }

        if (!stored && persistence.capture().revision > 0) {
          await runtime.ownership.releaseOwnership(lease.value)
          if (epoch !== operationGeneration || session.value?.id !== id) {
            return
          }

          error.value = '存档已被移除，请返回首页。'

          return
        }

        const localDirty = persistence.capture().dirty
        if (stored && !localDirty) {
          install(stored.session, lease.value, stored.revision, true)
        } else {
          persistence.attach(id, lease.value, persistence.capture().revision)
          if (localDirty) {
            persistence.markDirty()
          }
        }

        readOnly.value = false
      } else {
        handleSave(lease)
      }
    }

    error.value = null
    if (session.value?.completion) {
      return
    }

    phase.value = 'playing'
    host.activateClock()
  }

  async function replaceWithPuzzle(
    puzzle: Puzzle,
    metadata: SessionMetadata,
    options: {
      id?: string
      epoch?: number
      signal?: AbortSignal
      assessment?: PuzzleAssessment
      datasetEpoch?: number | null
    } = {},
  ): Promise<GameTransition> {
    const id = options.id ?? runtime.createId()
    const epoch = options.epoch ?? operationGeneration
    const signal = options.signal
    const fence = await runtime.repository.readDatasetEpoch()
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }
    const datasetEpoch =
      options.datasetEpoch === undefined
        ? (persistence.capture().token?.epoch ?? (fence.ok ? fence.value : null))
        : options.datasetEpoch
    if (datasetEpoch !== null && fence.ok && fence.value !== datasetEpoch) {
      host.dropSession()
      error.value = '本机数据已被替换，请重新选择游戏。'
      return { status: 'cancelled' }
    }
    const computation = await prepareEngine(epoch)
    if (computation.status !== 'ready') {
      return computation
    }
    const validated = validatePuzzleSnapshot(puzzle, runtime.engine)
    if (validated.status !== 'valid') {
      phase.value = session.value ? 'paused' : 'failed'
      error.value =
        validated.status === 'budget-exhausted'
          ? '题目校验暂时无法完成，请重试。'
          : '题目数据无效，请重新选择。'
      return { status: 'blocked', reason: 'load' }
    }
    const assessment = runtime.engine.validateAssessment({
      present: options.assessment !== undefined,
      value: options.assessment ?? null,
      identity: { variant: validated.value.rules.kind, difficulty: validated.value.difficulty },
    })
    const next = createSession(
      validated.value,
      metadata,
      id,
      runtime.wallNow().toISOString(),
      assessment.status === 'present' ? assessment.value : undefined,
    )
    if (datasetEpoch === null) {
      if (fence.ok) {
        host.dropSession()
        error.value = '本机存档状态已变化，请重新选择游戏。'
        return { status: 'cancelled' }
      }
      if (session.value || metadata.kind === 'daily') {
        phase.value = session.value ? 'paused' : 'failed'
        error.value = '无法确认本机存档状态，请重试。'
        return { status: 'blocked', reason: 'load' }
      }
      // A first game started without storage remains memory-only. An unknown initial
      // epoch cannot authorize adopting a recovered or restored dataset's fresh lease.
      readOnly.value = false
      install(next, null, 0, false)
      handleSave({
        ok: false,
        error: { kind: 'unavailable', message: 'Initial dataset epoch unavailable' },
      })
      return { status: 'ready' }
    }
    if (!fence.ok) {
      phase.value = session.value ? 'paused' : 'failed'
      error.value = '无法确认本机存档状态，请重试。'
      return { status: 'blocked', reason: 'load' }
    }
    const catalog =
      metadata.kind === 'daily'
        ? { ok: true as const, value: null }
        : await runtime.repository.readSlot(metadata.kind, puzzle.rules.kind)
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    if (!catalog.ok) {
      error.value = '读取存档失败，原局已保留。请重试。'
      phase.value = session.value ? 'paused' : 'failed'

      return { status: 'blocked', reason: 'load' }
    }

    const previous = catalog.value
    let previousToken: OwnershipToken | null = null
    // The persistence owner releases its attached lease; this transition releases only leases it acquired.
    let ownsPreviousLease = false
    if (previous) {
      if (
        session.value?.id === previous.session.id &&
        persistence.hasQueue &&
        persistence.capture().token
      ) {
        const flushed = await persistence.flush()
        if (
          epoch !== operationGeneration ||
          !persistence.hasQueue ||
          !persistence.capture().token
        ) {
          return { status: 'cancelled' }
        }

        if (!flushed.ok) {
          handleSave(flushed)
          phase.value = 'paused'

          return { status: 'blocked', reason: 'save' }
        }

        previous.revision = persistence.capture().revision
        previousToken = persistence.capture().token
      } else {
        const ownership = await runtime.ownership.acquireOwnership(
          previous.session.id,
          runtime.ownerId,
        )
        if (epoch !== operationGeneration) {
          if (ownership.ok && ownership.value) {
            await runtime.ownership.releaseOwnership(ownership.value)
          }

          return { status: 'cancelled' }
        }

        if (!ownership.ok || !ownership.value) {
          error.value = '旧局正在其他标签页编辑，请先关闭或暂停该页面。'
          phase.value = session.value ? 'paused' : 'failed'

          return { status: 'blocked', reason: 'ownership' }
        }

        previousToken = ownership.value
        ownsPreviousLease = true
      }
    }

    const acquired = await runtime.ownership.acquireOwnership(next.id, runtime.ownerId)
    if (epoch !== operationGeneration) {
      if (acquired.ok && acquired.value) {
        await runtime.ownership.releaseOwnership(acquired.value)
      }

      if (previousToken && ownsPreviousLease) {
        await runtime.ownership.releaseOwnership(previousToken)
      }

      return { status: 'cancelled' }
    }

    // Old computation cannot borrow a lease from a restored dataset. Repository writes
    // assert this token's epoch atomically, closing resets between this check and commit.
    if (acquired.ok && acquired.value && acquired.value.epoch !== datasetEpoch) {
      await runtime.ownership.releaseOwnership(acquired.value)
      if (previousToken && ownsPreviousLease) {
        await runtime.ownership.releaseOwnership(previousToken)
      }
      host.dropSession()
      error.value = '本机数据已被替换，请重新选择游戏。'
      return { status: 'cancelled' }
    }

    if (!acquired.ok) {
      if (previousToken && ownsPreviousLease) {
        await runtime.ownership.releaseOwnership(previousToken)
      }

      // Cleanup can outlive a reset or departure, just like the acquisition itself.
      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }

      handleSave(acquired)
      phase.value = session.value ? 'paused' : 'failed'

      return { status: 'blocked', reason: 'ownership' }
    }

    if (!acquired.value) {
      const latest = await runtime.repository.readDatasetEpoch()
      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }
      if (!latest.ok || latest.value !== datasetEpoch) {
        if (previousToken && ownsPreviousLease) {
          await runtime.ownership.releaseOwnership(previousToken)
        }
        host.dropSession()
        error.value = '本机存档状态已变化，请重新选择游戏。'
        return { status: 'cancelled' }
      }
      if (metadata.kind === 'daily') {
        return restoreSession(next.id)
      }

      if (previousToken && ownsPreviousLease) {
        await runtime.ownership.releaseOwnership(previousToken)
      }

      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }

      error.value = '本局正在其他标签页编辑。'
      phase.value = session.value ? 'paused' : 'failed'

      return { status: 'blocked', reason: 'ownership' }
    }

    const persisted =
      metadata.kind === 'daily'
        ? await runtime.repository.writeSession(next, 0, acquired.value, signal)
        : await runtime.repository.replaceActiveSession(
            next,
            acquired.value,
            previous && previousToken
              ? { id: previous.session.id, revision: previous.revision, token: previousToken }
              : null,
            signal,
          )
    if (epoch !== operationGeneration) {
      await runtime.ownership.releaseOwnership(acquired.value)
      if (previousToken && ownsPreviousLease) {
        await runtime.ownership.releaseOwnership(previousToken)
      }

      return { status: 'cancelled' }
    }

    if (!persisted.ok) {
      await runtime.ownership.releaseOwnership(acquired.value)
      if (previousToken && ownsPreviousLease) {
        await runtime.ownership.releaseOwnership(previousToken)
      }

      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }

      error.value = '创建存档失败，原局已保留。请重试。'
      phase.value = session.value ? 'paused' : 'failed'

      // This is a failure of the proposed save, not a loss of the old session's lease.
      return { status: 'blocked', reason: 'save' }
    }

    await persistence.release()
    if (previousToken && ownsPreviousLease) {
      await runtime.ownership.releaseOwnership(previousToken)
    }

    if (epoch !== operationGeneration) {
      await runtime.ownership.releaseOwnership(acquired.value)

      return { status: 'cancelled' }
    }

    const committedFence = await runtime.repository.readDatasetEpoch()
    if (epoch !== operationGeneration) {
      await runtime.ownership.releaseOwnership(acquired.value)
      return { status: 'cancelled' }
    }
    if (!committedFence.ok) {
      await runtime.ownership.releaseOwnership(acquired.value)
      readOnly.value = true
      phase.value = session.value ? 'paused' : 'failed'
      error.value = '存档已创建，但无法读取本机状态，请重新选择存档。'
      return { status: 'blocked', reason: 'load' }
    }
    if (committedFence.value !== datasetEpoch) {
      await runtime.ownership.releaseOwnership(acquired.value)
      host.dropSession()
      error.value = '本机数据已改变，请重新载入存档。'
      return { status: 'cancelled' }
    }

    readOnly.value = false
    install(next, acquired.value, persisted.value.revision, false)
    handleSave(persisted)

    return { status: 'ready' }
  }

  async function startGame(
    input: GenerationInput,
    metadata: SessionMetadata,
    _replaceId?: string,
    id?: string,
  ): Promise<GameTransition> {
    const snapshot = copyGenerationInput(input)
    const prepared = await prepareTransition()
    if (prepared.status !== 'ready') {
      return prepared
    }

    const operation = operationGeneration
    const fence = await runtime.repository.readDatasetEpoch()
    if (operation !== operationGeneration) {
      return { status: 'cancelled' }
    }
    return generatePreparedGame(snapshot, metadata, id, fence.ok ? fence.value : null)
  }

  async function generatePreparedGame(
    input: GenerationInput,
    metadata: SessionMetadata,
    id: string | undefined,
    datasetEpoch: number | null,
  ): Promise<GameTransition> {
    failedGeneration.value = null
    error.value = null
    phase.value = 'generating'
    const epoch = operationGeneration
    const job = new AbortController()
    controller = job
    const result = await runtime.worker.generate(input, job.signal)
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    if (result.status !== 'completed') {
      // Work-bound exhaustion repeats deterministically for the same input. A new choice
      // can start a new request; timeout and transport failure still support identical retry.
      if (result.status !== 'cancelled' && result.status !== 'budget-exhausted') {
        failedGeneration.value = { input, metadata, id }
      }

      if (result.status === 'timed-out') {
        error.value = '出题超时，请重试。'
      } else if (result.status === 'budget-exhausted') {
        error.value = '未能生成符合要求的题目，请重新选择。'
      } else if (result.status === 'cancelled') {
        error.value = '已取消出题。'
      } else {
        error.value = '出题失败，请重试。'
      }
      phase.value = session.value ? 'paused' : 'failed'

      return result.status === 'cancelled'
        ? { status: 'cancelled' }
        : { status: 'blocked', reason: 'generation' }
    }

    const transition = await replaceWithPuzzle(result.value, metadata, {
      id,
      epoch,
      signal: job.signal,
      assessment: result.assessment,
      datasetEpoch,
    })
    if (controller === job) {
      controller = null
    }

    if (transition.status === 'blocked') {
      if (epoch !== operationGeneration) {
        return { status: 'cancelled' }
      }

      failedGeneration.value = { input, metadata, id }
    }

    return transition
  }

  async function retryGeneration() {
    const request = failedGeneration.value
    if (request && phase.value !== 'generating') {
      return startGame(request.input, request.metadata, undefined, request.id)
    }
  }

  function cancelLoading() {
    cancelOperation()
    failedGeneration.value = null
    phase.value = session.value ? 'paused' : 'failed'
    error.value = '已取消出题。'
  }

  async function retrySave() {
    if (!session.value || readOnly.value) {
      return
    }

    const epoch = operationGeneration
    const id = session.value.id
    await persistence.waitForRelease()
    if (epoch !== operationGeneration || session.value?.id !== id) {
      return
    }

    if (!persistence.hasQueue) {
      const catalog = await runtime.repository.readSession(id)
      if (epoch !== operationGeneration || session.value?.id !== id) {
        return
      }

      if (!catalog.ok) {
        handleSave(catalog)

        return
      }

      const current = catalog.value
      if ((current?.revision ?? 0) !== persistence.capture().revision) {
        handleSave({
          ok: false,
          error: { kind: 'revision-conflict', message: 'Saved revision changed' },
        })

        return
      }

      if (!current && session.value.mode !== 'daily') {
        const slot = await runtime.repository.readSlot(
          session.value.mode,
          session.value.puzzle.rules.kind,
        )
        if (epoch !== operationGeneration || session.value?.id !== id) {
          return
        }
        if (!slot.ok) {
          handleSave(slot)
          return
        }
        if (slot.value) {
          error.value = '已有其他存档，请重新载入后继续。'
          readOnly.value = true
          pause()
          return
        }
      }

      const acquired = await runtime.ownership.acquireOwnership(id, runtime.ownerId)
      if (epoch !== operationGeneration || session.value?.id !== id) {
        if (acquired.ok && acquired.value) {
          await runtime.ownership.releaseOwnership(acquired.value)
        }

        return
      }

      if (!acquired.ok || !acquired.value) {
        if (acquired.ok) {
          readOnly.value = true
        } else {
          handleSave(acquired)
        }

        return
      }

      persistence.attach(id, acquired.value, current?.revision ?? 0)
      persistence.markDirty()
      const result = await persistence.save(session.value)
      if (epoch === operationGeneration && session.value?.id === id) {
        handleSave(result)
      }

      return
    }

    const checkpoint = persistence.capture()
    const result = await persistence.retry(session.value)
    if (
      epoch !== operationGeneration ||
      session.value?.id !== id ||
      !persistence.isCurrent(checkpoint)
    ) {
      return
    }

    handleSave(result)
  }

  async function restartFree() {
    if (!session.value || session.value.mode === 'daily' || readOnly.value) {
      return
    }

    const prepared = await prepareTransition()
    if (prepared.status !== 'ready' || !session.value) {
      return prepared
    }

    return replaceWithPuzzle(session.value.puzzle, session.value.metadata, {
      assessment: session.value.assessment,
    })
  }

  async function startDaily(date: string, variant: SudokuVariant): Promise<GameTransition> {
    const prepared = await prepareTransition()
    if (prepared.status !== 'ready') {
      return prepared
    }

    const epoch = operationGeneration
    const fence = await runtime.repository.readDatasetEpoch()
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }
    if (!fence.ok) {
      error.value = '读取每日挑战失败，请重试。'
      return { status: 'blocked', reason: 'load' }
    }
    const formalId = getDailyFormalId(date, variant)
    const [catalog, results] = await Promise.all([
      runtime.repository.readSession(formalId),
      runtime.repository.readResult(formalId),
    ])
    if (epoch !== operationGeneration) {
      return { status: 'cancelled' }
    }

    if (!catalog.ok || !results.ok) {
      error.value = '读取每日挑战失败，请重试。'

      return { status: 'blocked', reason: 'load' }
    }

    const existing = catalog.value
    if (existing && !existing.session.completion) {
      const restored = await restoreSession(formalId)
      if (restored.status === 'ready' && !readOnly.value) {
        await resume()
      }

      return restored
    }

    const formalAttempt = !existing && !results.value
    const computation = await prepareEngine(epoch)
    if (computation.status !== 'ready') {
      return computation
    }

    // Existing formal attempts win before any current-version seed derivation or construction.
    const seed = runtime.engine.deriveSeed(getDailySeedMaterial(date))
    const { input } = getDailyIdentity(date, variant, seed)
    return generatePreparedGame(
      input,
      { kind: 'daily', challengeDate: date, formalAttempt },
      formalAttempt ? formalId : runtime.createId(),
      fence.value,
    )
  }

  return {
    prepareTransition,
    findFreeSession,
    restoreSession,
    reloadLatestSession,
    findSession,
    findPracticeSession,
    clearActiveSession,
    resume,
    startGame,
    retryGeneration,
    cancelLoading,
    retrySave,
    restartFree,
    startDaily,
    failedGeneration,
    cancel: cancelOperation,
    beginOperation,
    reportSave: handleSave,
  }
}

export type SessionTransitions = ReturnType<typeof createSessionTransitions>
