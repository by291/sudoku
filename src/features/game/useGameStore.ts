import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '../../app/runtime'
import type { GenerationInput, Puzzle } from '../../core/sudoku/generation'
import { PUZZLE_VERSION } from '../../core/sudoku/generation'
import { getDailySeed, restartDailySession } from './daily'
import type { HintResult } from '../../core/sudoku/hint'
import { findConflicts, isCellIndex } from '../../core/sudoku/board'
import type { GameAction, GameSession, SessionMetadata, SessionPhase } from './session'
import { applySessionAction, completeSession, createSession, sessionBoard } from './session'
import { pauseClock, readElapsed, resumeClock } from './timer'
import type { RunClock } from './timer'
import type { SaveQueue } from '../../infrastructure/storage/saveQueue'
import type { OwnershipToken } from '../../infrastructure/ownership'
import type { StorageOutcome } from '../../infrastructure/storage/records'

export const useGameStore = defineStore('game', () => {
  const runtime = useGameRuntime()
  const session = shallowRef<GameSession | null>(null)
  const phase = ref<SessionPhase>('paused')
  const selectedCell = ref<number | null>(null)
  const noteMode = ref(false)
  const hint = shallowRef<HintResult | null>(null)
  const hintLoading = ref(false)
  const checkedCells = ref<readonly number[]>([])
  const checkedBoard = ref<string | null>(null)
  const failedGeneration = shallowRef<{
    input: GenerationInput
    metadata: SessionMetadata
    id?: string
  } | null>(null)
  const error = ref<string | null>(null)
  const saveMessage = ref<string | null>(null)
  const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const readOnly = ref(false)
  const clock = shallowRef<RunClock>({ accumulatedMs: 0, runningSince: null })
  const now = ref(runtime.monotonicNow())
  let token: OwnershipToken | null = null
  let queue: SaveQueue | null = null
  let operation = 0
  let saving = 0
  let controller: AbortController | null = null
  let hintBoard = ''
  let committedRevision = 0
  let dirty = false
  let releasing: Promise<void> | null = null
  const board = computed(() => (session.value ? sessionBoard(session.value) : Array(81).fill(0)))
  const conflicts = computed(() => (session.value ? findConflicts(board.value) : []))
  const elapsedMs = computed(() => Math.floor(readElapsed(clock.value, now.value)))
  const editable = computed(() => phase.value === 'playing' && !readOnly.value)
  const canUndo = computed(() => editable.value && !!session.value?.undoStack.length)
  const canRedo = computed(() => editable.value && !!session.value?.redoStack.length)
  const checkIsCurrent = computed(() => checkedBoard.value === board.value.join(','))
  const canRetryGeneration = computed(
    () => !!failedGeneration.value && phase.value !== 'generating',
  )
  function tick() {
    now.value = runtime.monotonicNow()
  }
  function cancelOperation() {
    operation++
    controller?.abort()
    controller = null
    hintLoading.value = false
  }
  function settle() {
    tick()
    if (session.value && !session.value.completion) {
      if (session.value.elapsedMs !== elapsedMs.value) dirty = true
      session.value = { ...session.value, elapsedMs: elapsedMs.value }
    }
  }
  function handleSave(result: StorageOutcome<unknown>) {
    if (result.ok) {
      saveState.value = 'saved'
      saveMessage.value = null
    } else {
      saveState.value = 'failed'
      const lost =
        result.error.kind === 'ownership-lost' || result.error.kind === 'revision-conflict'
      saveMessage.value = lost
        ? '编辑权或存档已变化，请重新载入后继续。'
        : '保存失败，本局暂存在内存中。请保持页面打开并重试保存。'
      if (lost) {
        readOnly.value = true
        pause()
      }
    }
  }
  async function save() {
    if (!session.value || readOnly.value) return
    settle()
    if (!queue) {
      saveState.value = 'failed'
      saveMessage.value = '当前仅在内存中游玩，尚未保存。请保持页面打开并重试保存。'
      return
    }
    const epoch = ++saving
    const id = session.value.id
    const currentQueue = queue
    saveState.value = 'saving'
    const result = await currentQueue.enqueue(session.value)
    if (saving === epoch && session.value?.id === id) {
      if (result.ok) {
        committedRevision = result.value.revision
        dirty = false
      }
      handleSave(result)
    }
  }
  function pause() {
    if (phase.value !== 'playing') return
    clock.value = pauseClock(clock.value, runtime.monotonicNow())
    phase.value = 'paused'
    settle()
    cancelOperation()
    hint.value = null
    void save()
  }
  async function release() {
    if (releasing) return releasing
    const oldQueue = queue,
      oldToken = token
    const id = session.value?.id
    queue = null
    token = null
    const work = (async () => {
      if (oldQueue) {
        const result = await oldQueue.flush()
        if (session.value?.id === id && !queue) {
          committedRevision = oldQueue.revision
          if (!result.ok) {
            dirty = true
            handleSave(result)
          }
        }
        oldQueue.dispose()
      }
      if (oldToken) await runtime.ownership.releaseOwnership(oldToken)
    })()
    releasing = work
    try {
      await work
    } finally {
      if (releasing === work) releasing = null
    }
  }
  function install(
    next: GameSession,
    nextToken: OwnershipToken | null,
    revision: number,
    paused: boolean,
  ) {
    saving++
    cancelOperation()
    queue?.dispose()
    session.value = next
    committedRevision = revision
    dirty = false
    token = nextToken
    queue = nextToken ? runtime.createSaveQueue(nextToken, revision) : null
    selectedCell.value = null
    noteMode.value = false
    hint.value = null
    checkedCells.value = []
    checkedBoard.value = null
    clock.value = { accumulatedMs: next.elapsedMs, runningSince: null }
    tick()
    phase.value = next.completion ? 'completed' : paused ? 'paused' : 'playing'
    if (phase.value === 'playing') clock.value = resumeClock(clock.value, now.value)
  }
  async function restoreSession(id: string) {
    pause()
    cancelOperation()
    const epoch = operation
    await release()
    if (epoch !== operation) return
    const records = await runtime.repository.listSessions()
    if (epoch !== operation) return
    if (!records.ok) {
      error.value = '读取存档失败，请重试。'
      phase.value = 'failed'
      return
    }
    const record = records.value.find((item) => item.session.id === id)
    if (!record) {
      error.value = '找不到这份存档，可能已被清除。'
      phase.value = 'failed'
      return
    }
    const lease = await runtime.ownership.acquireOwnership(id, runtime.ownerId)
    if (epoch !== operation) {
      if (lease.ok && lease.value) await runtime.ownership.releaseOwnership(lease.value)
      return
    }
    readOnly.value = lease.ok && lease.value === null
    install(record.session, lease.ok ? lease.value : null, record.revision, true)
    error.value = null
    saveState.value = lease.ok ? 'saved' : 'failed'
    saveMessage.value = lease.ok ? null : '无法取得存储连接，本局尚未保存。'
    return operation
  }
  async function resume() {
    if (!session.value || session.value.completion || phase.value === 'generating') return
    const epoch = operation,
      id = session.value.id
    if (releasing) await releasing
    if (epoch !== operation || session.value?.id !== id) return
    if (readOnly.value || !token) {
      const lease = await runtime.ownership.acquireOwnership(id, runtime.ownerId)
      if (epoch !== operation || session.value?.id !== id) {
        if (lease.ok && lease.value) await runtime.ownership.releaseOwnership(lease.value)
        return
      }
      if (lease.ok && !lease.value) {
        readOnly.value = true
        return
      }
      if (lease.ok && lease.value) {
        const catalog = await runtime.repository.listSessions()
        if (epoch !== operation || session.value?.id !== id) {
          await runtime.ownership.releaseOwnership(lease.value)
          return
        }
        if (!catalog.ok) {
          await runtime.ownership.releaseOwnership(lease.value)
          if (epoch !== operation || session.value?.id !== id) return
          handleSave(catalog)
          return
        }
        const stored = catalog.value.find((record) => record.session.id === id)
        if (dirty && (stored?.revision ?? 0) !== committedRevision) {
          await runtime.ownership.releaseOwnership(lease.value)
          if (epoch !== operation || session.value?.id !== id) return
          handleSave({
            ok: false,
            error: {
              kind: 'revision-conflict',
              message: 'The saved game changed while local edits were unsaved',
            },
          })
          return
        }
        if (!stored && committedRevision > 0) {
          await runtime.ownership.releaseOwnership(lease.value)
          if (epoch !== operation || session.value?.id !== id) return
          error.value = '存档已被移除，请返回首页。'
          return
        }
        if (stored && !dirty) install(stored.session, lease.value, stored.revision, true)
        else {
          token = lease.value
          queue = runtime.createSaveQueue(lease.value, committedRevision)
        }
        readOnly.value = false
      } else handleSave(lease)
    }
    error.value = null
    if (session.value?.completion) return
    phase.value = 'playing'
    clock.value = resumeClock(clock.value, runtime.monotonicNow())
    tick()
  }
  async function replaceWithPuzzle(
    puzzle: Puzzle,
    metadata: SessionMetadata,
    id = runtime.createId(),
    epoch = operation,
    signal?: AbortSignal,
  ) {
    const next = createSession(puzzle, metadata, id, runtime.wallNow().toISOString())
    const catalog = await runtime.repository.listSessions()
    if (epoch !== operation) return
    if (!catalog.ok) {
      await release()
      if (epoch !== operation) return
      readOnly.value = false
      install(next, null, 0, false)
      handleSave(catalog)
      return
    }
    const previous =
      metadata.kind === 'daily'
        ? null
        : catalog.value.find((record) => record.session.mode === metadata.kind)
    let previousToken: OwnershipToken | null = null
    if (previous) {
      if (session.value?.id === previous.session.id && queue && token) {
        await queue.flush()
        if (epoch !== operation || !queue || !token) return
        previous.revision = queue.revision
        previousToken = token
      } else {
        const ownership = await runtime.ownership.acquireOwnership(
          previous.session.id,
          runtime.ownerId,
        )
        if (epoch !== operation) {
          if (ownership.ok && ownership.value)
            await runtime.ownership.releaseOwnership(ownership.value)
          return
        }
        if (!ownership.ok || !ownership.value) {
          error.value = '旧局正在其他标签页编辑，请先关闭或暂停该页面。'
          phase.value = session.value ? 'paused' : 'failed'
          return
        }
        previousToken = ownership.value
      }
    }
    const acquired = await runtime.ownership.acquireOwnership(next.id, runtime.ownerId)
    if (epoch !== operation) {
      if (acquired.ok && acquired.value) await runtime.ownership.releaseOwnership(acquired.value)
      if (previousToken && previousToken !== token)
        await runtime.ownership.releaseOwnership(previousToken)
      return
    }
    if (!acquired.ok) {
      await release()
      if (epoch !== operation) return
      readOnly.value = false
      install(next, null, 0, false)
      handleSave(acquired)
      return
    }
    if (!acquired.value) {
      if (metadata.kind === 'daily') {
        await restoreSession(next.id)
        return
      }
      error.value = '本局正在其他标签页编辑。'
      phase.value = session.value ? 'paused' : 'failed'
      return
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
    if (epoch !== operation) {
      await runtime.ownership.releaseOwnership(acquired.value)
      if (previousToken && previousToken !== token)
        await runtime.ownership.releaseOwnership(previousToken)
      return
    }
    if (!persisted.ok) {
      await runtime.ownership.releaseOwnership(acquired.value)
      if (previousToken && previousToken !== token)
        await runtime.ownership.releaseOwnership(previousToken)
      error.value = '创建存档失败，原局已保留。请重试。'
      phase.value = session.value ? 'paused' : 'failed'
      handleSave(persisted)
      return
    }
    await release()
    if (previousToken) await runtime.ownership.releaseOwnership(previousToken)
    if (epoch !== operation) {
      await runtime.ownership.releaseOwnership(acquired.value)
      return
    }
    readOnly.value = false
    install(next, acquired.value, persisted.value.revision, false)
    handleSave(persisted)
  }
  async function startGame(
    input: GenerationInput,
    metadata: SessionMetadata,
    _replaceId?: string,
    id?: string,
  ) {
    pause()
    cancelOperation()
    failedGeneration.value = null
    error.value = null
    phase.value = 'generating'
    const epoch = operation
    const job = new AbortController()
    controller = job
    const result = await runtime.worker.generate(input, job.signal)
    if (epoch !== operation) return
    if (result.status !== 'completed') {
      if (result.status !== 'cancelled') failedGeneration.value = { input, metadata, id }
      error.value =
        result.status === 'timed-out'
          ? '出题超时，请重试。'
          : result.status === 'cancelled'
            ? '已取消出题。'
            : '出题失败，请重试。'
      phase.value = session.value ? 'paused' : 'failed'
      return
    }
    await replaceWithPuzzle(result.value, metadata, id, epoch, job.signal)
    if (controller === job) controller = null
    if (epoch === operation && error.value) failedGeneration.value = { input, metadata, id }
  }
  async function retryGeneration() {
    const request = failedGeneration.value
    if (request && phase.value !== 'generating')
      await startGame(request.input, request.metadata, undefined, request.id)
  }
  function cancelLoading() {
    cancelOperation()
    failedGeneration.value = null
    phase.value = session.value ? 'paused' : 'failed'
    error.value = '已取消出题。'
  }
  function dispatch(action: GameAction) {
    if (!editable.value || !session.value) return
    settle()
    const outcome = applySessionAction(session.value, action)
    if (!outcome.changed) return
    session.value = outcome.session
    dirty = true
    if (action.kind !== 'hint-shown' && action.kind !== 'check') {
      cancelOperation()
      hint.value = null
      checkedCells.value = []
      checkedBoard.value = null
    }
    if (action.kind === 'check') {
      checkedBoard.value = board.value.join(',')
      checkedCells.value = board.value.flatMap((digit, cell) =>
        digit !== 0 && digit !== session.value?.puzzle.solution[cell] ? [cell] : [],
      )
    }
    if (outcome.boardComplete) {
      clock.value = pauseClock(clock.value, runtime.monotonicNow())
      tick()
      session.value = completeSession(
        session.value,
        runtime.wallNow().toISOString(),
        elapsedMs.value,
      )
      phase.value = 'completed'
      cancelOperation()
    }
    void save()
  }
  function selectCell(cell: number) {
    if (isCellIndex(cell) && phase.value !== 'paused') selectedCell.value = cell
  }
  function toggleNoteMode() {
    if (editable.value) noteMode.value = !noteMode.value
  }
  async function requestHint() {
    if (!editable.value || !session.value || hintLoading.value) return
    cancelOperation()
    const epoch = operation
    controller = new AbortController()
    hintLoading.value = true
    const analyzed = board.value.join(',')
    const result = await runtime.worker.hint(
      board.value,
      session.value.puzzle.solution,
      controller.signal,
    )
    if (epoch !== operation || analyzed !== board.value.join(',') || !editable.value) return
    hintLoading.value = false
    controller = null
    if (result.status !== 'completed') {
      error.value = '提示暂时无法生成，请重试。'
      return
    }
    hint.value = result.value
    hintBoard = analyzed
    dispatch({ kind: 'hint-shown' })
  }
  function applyHint() {
    if (hint.value?.kind !== 'deduction' || hintBoard !== board.value.join(',')) return
    dispatch({ kind: 'enter', ...hint.value.placement })
  }
  function dismissHint() {
    hint.value = null
  }
  async function retrySave() {
    if (!session.value || readOnly.value) return
    const epoch = operation,
      id = session.value.id
    if (releasing) await releasing
    if (epoch !== operation || session.value?.id !== id) return
    if (!queue) {
      const catalog = await runtime.repository.listSessions()
      if (epoch !== operation || session.value?.id !== id) return
      if (!catalog.ok) {
        handleSave(catalog)
        return
      }
      const current = catalog.value.find((record) => record.session.id === id)
      if ((current?.revision ?? 0) !== committedRevision) {
        handleSave({
          ok: false,
          error: { kind: 'revision-conflict', message: 'Saved revision changed' },
        })
        return
      }
      if (
        !current &&
        session.value.mode !== 'daily' &&
        catalog.value.some((record) => record.session.mode === session.value?.mode)
      ) {
        error.value = '已有其他存档，请重新载入后继续。'
        readOnly.value = true
        pause()
        return
      }
      const acquired = await runtime.ownership.acquireOwnership(id, runtime.ownerId)
      if (epoch !== operation || session.value?.id !== id) {
        if (acquired.ok && acquired.value) await runtime.ownership.releaseOwnership(acquired.value)
        return
      }
      if (!acquired.ok || !acquired.value) {
        if (acquired.ok) readOnly.value = true
        else handleSave(acquired)
        return
      }
      token = acquired.value
      queue = runtime.createSaveQueue(token, current?.revision ?? 0)
      await save()
      return
    }
    const currentQueue = queue
    if (dirty) {
      await save()
      if (epoch !== operation || session.value?.id !== id || queue !== currentQueue) return
      if (saveState.value === 'saved') return
    }
    saveState.value = 'saving'
    const result = await currentQueue.retry()
    if (epoch !== operation || session.value?.id !== id || queue !== currentQueue) return
    if (result.ok) {
      committedRevision = currentQueue.revision
      dirty = false
    }
    handleSave(result)
  }
  async function restartFree() {
    if (!session.value || session.value.mode === 'daily' || readOnly.value) return
    pause()
    await replaceWithPuzzle(session.value.puzzle, session.value.metadata)
  }
  async function startDaily(date: string) {
    pause()
    cancelOperation()
    const epoch = operation
    await queue?.flush()
    if (epoch !== operation) return
    const seed = getDailySeed(date, PUZZLE_VERSION)
    const [catalog, results] = await Promise.all([
      runtime.repository.listSessions(),
      runtime.repository.listResults(),
    ])
    if (epoch !== operation) return
    if (!catalog.ok || !results.ok) {
      error.value = '读取每日挑战失败，请重试。'
      return
    }
    const formalId = `daily:${date}:formal`
    const existing = catalog.value.find((record) => record.session.id === formalId)
    if (existing && !existing.session.completion) {
      const restored = await restoreSession(formalId)
      if (restored !== undefined && restored === operation && !readOnly.value) await resume()
      return
    }
    const formalAttempt =
      !existing && !results.value.some((record) => record.session.id === formalId)
    await startGame(
      { difficulty: 'medium', seed, puzzleVersion: PUZZLE_VERSION },
      { kind: 'daily', challengeDate: date, formalAttempt },
      undefined,
      formalAttempt ? formalId : runtime.createId(),
    )
  }
  async function restartDaily() {
    if (
      !session.value ||
      session.value.mode !== 'daily' ||
      session.value.completion ||
      readOnly.value
    )
      return
    pause()
    settle()
    cancelOperation()
    hint.value = null
    checkedCells.value = []
    session.value = restartDailySession(session.value)
    dirty = true
    selectedCell.value = null
    const epoch = operation
    await save()
    if (epoch === operation) await resume()
  }
  async function periodicSave() {
    tick()
    if (phase.value === 'playing') await save()
  }
  async function renewLease() {
    if (!token) return
    const currentToken = token
    const result = await runtime.ownership.renewOwnership(currentToken)
    if (token !== currentToken) return
    if (result.ok && !result.value)
      handleSave({ ok: false, error: { kind: 'ownership-lost', message: 'Lease expired' } })
    else if (!result.ok) handleSave(result)
  }
  async function leaveGame() {
    pause()
    cancelOperation()
    failedGeneration.value = null
    await release()
  }
  function dropSession() {
    cancelOperation()
    queue?.dispose()
    queue = null
    token = null
    saving++
    session.value = null
    committedRevision = 0
    dirty = false
    phase.value = 'paused'
    hint.value = null
    checkedBoard.value = null
    failedGeneration.value = null
    readOnly.value = false
    saveState.value = 'idle'
    saveMessage.value = null
  }
  const unsubscribe = runtime.ownership.subscribe((notice) => {
    if (notice.kind === 'reset') dropSession()
    else if (notice.sessionId === session.value?.id && token) void renewLease()
  })
  function dispose() {
    unsubscribe()
    void leaveGame()
  }
  return {
    session,
    phase,
    selectedCell,
    noteMode,
    hint,
    hintLoading,
    checkedCells,
    checkIsCurrent,
    canRetryGeneration,
    error,
    saveMessage,
    saveState,
    readOnly,
    board,
    conflicts,
    elapsedMs,
    editable,
    canUndo,
    canRedo,
    tick,
    startGame,
    retryGeneration,
    restoreSession,
    dispatch,
    selectCell,
    toggleNoteMode,
    requestHint,
    applyHint,
    dismissHint,
    pause,
    resume,
    cancelLoading,
    retrySave,
    restartFree,
    startDaily,
    restartDaily,
    periodicSave,
    renewLease,
    leaveGame,
    dropSession,
    dispose,
  }
})
