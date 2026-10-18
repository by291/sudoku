import { createSessionPersistence } from '@/features/game/stores/sessionPersistence'
import { createSessionTransitions } from '@/features/game/stores/sessionTransitions'
import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import { useGameRuntime } from '@/runtime'
import { restartDailySession } from '@/features/game/model/daily'
import type { HintResult } from '@/sudoku/contracts'
import { isCellIndex } from '@/sudoku/values'
import type { PreparedPuzzle } from '@/sudoku/mainEngine'
import type { RuleMetadata } from '@/sudoku/contracts'
import { useConflictAnalysis } from '@/features/game/composables/useConflictAnalysis'
import type {
  GameAction,
  GameSession,
  SessionPhase,
  SessionActionResult,
} from '@/features/game/model/session'
import {
  applySessionAction,
  commitBoardEdit,
  completeSession,
  sessionBoard,
} from '@/features/game/model/session'
import { pauseClock, readElapsed, resumeClock } from '@/features/game/model/timer'
import type { RunClock } from '@/features/game/model/timer'
import type { OwnershipToken } from '@/storage/ownership'
import type { StorageOutcome } from '@/storage/records'

export const useGameStore = defineStore('game', () => {
  const runtime = useGameRuntime()
  const session = shallowRef<GameSession | null>(null)
  const phase = ref<SessionPhase>('paused')

  const selectedCell = ref<number | null>(null)
  const noteMode = ref(false)

  const hint = shallowRef<HintResult | null>(null)
  const hintLoading = ref(false)
  let hintBoardIdentity = ''

  const checkedCells = ref<readonly number[]>([])
  const checkedBoard = ref<string | null>(null)
  const error = ref<string | null>(null)
  const readOnly = ref(false)

  const clock = shallowRef<RunClock>({ accumulatedMs: 0, runningSince: null })
  const now = ref(runtime.monotonicNow())

  const persistence = createSessionPersistence(runtime)
  const { saveState, saveMessage } = persistence
  const transitions = createSessionTransitions(
    runtime,
    { session, phase, readOnly, error, pause, install, retrySave, activateClock, dropSession },
    persistence,
  )
  const {
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
    restartFree,
    startDaily,
    failedGeneration,
  } = transitions

  function activateClock() {
    clock.value = resumeClock(clock.value, runtime.monotonicNow())
    tick()
  }

  async function retrySave() {
    settle()
    await transitions.retrySave()
  }

  const board = computed(() => (session.value ? sessionBoard(session.value) : Array(81).fill(0)))
  const activeVariant = computed(() => session.value?.puzzle.rules.kind ?? 'classic')
  const prepared = shallowRef<PreparedPuzzle | null>(null)
  const ruleMetadata = shallowRef<RuleMetadata | null>(null)
  const stopPreparing = watch(
    () => session.value?.puzzle,
    (puzzle) => {
      // Replace the owned layout only when the puzzle changes; edits reuse its immutable rules.
      prepared.value?.dispose()
      prepared.value = null
      ruleMetadata.value = null

      if (puzzle) {
        prepared.value = runtime.engine.prepare(puzzle.rules)
        ruleMetadata.value = prepared.value.metadata()
      }
    },
    { flush: 'sync' },
  )

  const editable = computed(() => phase.value === 'playing' && !readOnly.value)
  const conflictAnalysis = useConflictAnalysis(prepared, board, editable, runtime.worker)
  const conflictEvaluation = conflictAnalysis.evaluation
  const conflictAnalysisState = conflictAnalysis.state
  const conflicts = computed(() => [
    ...new Set(conflictEvaluation.value.violations.flatMap((violation) => violation.cells)),
  ])
  const elapsedMs = computed(() => Math.floor(readElapsed(clock.value, now.value)))
  const canUndo = computed(() => editable.value && !!session.value?.undoStack.length)
  const canRedo = computed(() => editable.value && !!session.value?.redoStack.length)
  const checkIsCurrent = computed(() => checkedBoard.value === board.value.join(','))
  const canRetryGeneration = computed(
    () => !!failedGeneration.value && phase.value !== 'generating',
  )

  function tick() {
    now.value = runtime.monotonicNow()
  }

  const notesLoading = ref(false)
  let notesGeneration = 0
  let notesController: AbortController | null = null
  let layerRevision = 0

  function cancelNotes() {
    notesGeneration++
    notesController?.abort()
    notesController = null
    notesLoading.value = false
  }

  // The layer revision ignores elapsed time and assistance facts but fences every playable snapshot.
  const stopNoteRevision = watch(
    [
      () => session.value?.id,
      () => session.value?.puzzle,
      () => session.value?.entries.join(','),
      () => session.value?.notes.join(','),
      editable,
    ],
    () => {
      layerRevision++
      cancelNotes()
    },
    { flush: 'sync' },
  )

  async function requestNotes() {
    const captured = session.value
    const layout = prepared.value
    if (!captured || !layout || !editable.value || notesLoading.value) {
      return
    }

    const revision = layerRevision
    const generation = ++notesGeneration
    const owner = new AbortController()
    notesController = owner
    notesLoading.value = true

    try {
      const result = await runtime.worker.generateNotes(
        {
          givens: captured.puzzle.givens,
          entries: captured.entries,
          notes: captured.notes,
          rules: captured.puzzle.rules,
        },
        owner.signal,
      )

      // Identity and revision both matter: the same session id can be restored with new layers.
      if (
        generation !== notesGeneration ||
        revision !== layerRevision ||
        owner.signal.aborted ||
        !editable.value ||
        session.value?.id !== captured.id ||
        session.value.puzzle !== captured.puzzle
      ) {
        return
      }

      notesController = null
      notesLoading.value = false

      if (result.status !== 'completed') {
        error.value = '候选数暂时无法生成，原有笔记已保留。请重试。'
        return
      }

      // Reuse the normal history, assistance and save path only after the worker result is current.
      commitAction(
        commitBoardEdit(session.value, result.value.computation.result, { kind: 'generate-notes' }),
        { kind: 'generate-notes' },
        layout,
      )
    } catch {
      if (generation === notesGeneration && !owner.signal.aborted) {
        notesController = null
        notesLoading.value = false
        error.value = '候选数暂时无法生成，原有笔记已保留。请重试。'
      }
    }
  }

  function cancelOperation() {
    cancelNotes()
    transitions.cancel()
    hintLoading.value = false
  }

  function settle() {
    tick()
    if (session.value && !session.value.completion) {
      if (session.value.elapsedMs !== elapsedMs.value) {
        persistence.markDirty()
      }

      session.value = { ...session.value, elapsedMs: elapsedMs.value }
    }
  }

  function handleSave(result: StorageOutcome<unknown>) {
    transitions.reportSave(result)
  }

  async function save() {
    if (!session.value || readOnly.value) {
      return
    }

    settle()
    const checkpoint = persistence.capture()
    const result = await persistence.save(session.value)
    if (
      persistence.isCurrent(checkpoint) &&
      !result.ok &&
      (result.error.kind === 'ownership-lost' || result.error.kind === 'revision-conflict')
    ) {
      handleSave(result)
    }
  }

  function pause() {
    if (phase.value !== 'playing') {
      return
    }

    clock.value = pauseClock(clock.value, runtime.monotonicNow())
    phase.value = 'paused'
    settle()
    cancelOperation()
    hint.value = null
    void save()
  }

  async function release() {
    await persistence.release()
  }

  function install(
    next: GameSession,
    nextToken: OwnershipToken | null,
    revision: number,
    paused: boolean,
  ) {
    cancelOperation()
    session.value = next
    persistence.attach(next.id, nextToken, revision)

    selectedCell.value = null
    noteMode.value = false
    hint.value = null
    checkedCells.value = []
    checkedBoard.value = null

    clock.value = { accumulatedMs: next.elapsedMs, runningSince: null }
    tick()
    if (next.completion) {
      phase.value = 'completed'
    } else {
      phase.value = paused ? 'paused' : 'playing'
    }
    if (phase.value === 'playing') {
      clock.value = resumeClock(clock.value, now.value)
    }
  }

  function dispatch(action: GameAction) {
    if (!editable.value || !session.value) {
      return
    }

    settle()
    const layout = prepared.value
    if (!layout) {
      error.value = '数独计算尚未就绪，请重新打开本局。'
      return
    }
    if (action.kind === 'generate-notes' && layout.liveExecution === 'worker') {
      void requestNotes()
      return
    }

    const outcome =
      action.kind === 'enter' ||
      action.kind === 'erase' ||
      action.kind === 'toggle-note' ||
      action.kind === 'generate-notes'
        ? commitBoardEdit(
            session.value,
            layout.edit({
              givens: [...session.value.puzzle.givens],
              entries: [...session.value.entries],
              notes: [...session.value.notes],
              action,
            }).result,
            action,
          )
        : applySessionAction(session.value, action)

    commitAction(outcome, action, layout)
  }

  function commitAction(outcome: SessionActionResult, action: GameAction, layout: PreparedPuzzle) {
    if (outcome.status === 'budget-exhausted') {
      error.value = '候选计算超出预算，原有笔记已保留。请减少空格后重试。'

      return
    }

    if (!outcome.changed) {
      return
    }

    session.value = outcome.session
    persistence.markDirty()
    if (action.kind !== 'hint-shown' && action.kind !== 'check') {
      cancelOperation()
      hint.value = null
      checkedCells.value = []
      checkedBoard.value = null
    }

    if (action.kind === 'check') {
      checkedBoard.value = board.value.join(',')
      checkedCells.value = layout.reviewEntries(board.value, outcome.session.puzzle.solution)
    }

    if (session.value && layout.isComplete(board.value)) {
      clock.value = pauseClock(clock.value, runtime.monotonicNow())
      tick()
      session.value = completeSession(
        session.value,
        runtime.wallNow().toISOString(),
        elapsedMs.value,
        true,
      )
      phase.value = 'completed'
      cancelOperation()
    }

    void save()
  }

  function selectCell(cell: number) {
    if (isCellIndex(cell) && phase.value !== 'paused') {
      selectedCell.value = cell
    }
  }

  function toggleNoteMode() {
    if (editable.value) {
      noteMode.value = !noteMode.value
    }
  }

  async function requestHint() {
    if (!editable.value || !session.value || hintLoading.value) {
      return
    }

    const job = transitions.beginOperation()
    hintLoading.value = true
    const analyzed = board.value.join(',')

    const result = await runtime.worker.hint(
      board.value,
      session.value.puzzle.solution,
      session.value.puzzle.rules,
      job.signal,
    )

    if (!job.isCurrent() || analyzed !== board.value.join(',') || !editable.value) {
      return
    }

    hintLoading.value = false
    job.finish()
    if (result.status !== 'completed') {
      error.value = '提示暂时无法生成，请重试。'

      return
    }

    hint.value = result.value
    hintBoardIdentity = analyzed
    dispatch({ kind: 'hint-shown' })
  }

  function applyHint() {
    if (hint.value?.kind !== 'deduction' || hintBoardIdentity !== board.value.join(',')) {
      return
    }

    dispatch({ kind: 'enter', ...hint.value.placement })
  }

  function dismissHint() {
    hint.value = null
  }

  async function restartDaily() {
    if (
      !session.value ||
      session.value.mode !== 'daily' ||
      session.value.completion ||
      readOnly.value
    ) {
      return
    }

    pause()
    settle()
    cancelOperation()
    hint.value = null
    checkedCells.value = []
    session.value = restartDailySession(session.value)
    persistence.markDirty()
    selectedCell.value = null
    const job = transitions.beginOperation()
    await save()
    if (job.isCurrent()) {
      job.finish()
      await resume()
    }
  }

  async function periodicSave() {
    tick()
    if (phase.value === 'playing') {
      await save()
    }
  }

  async function renewLease() {
    const result = await persistence.renew()
    if (result.ok && !result.value) {
      handleSave({ ok: false, error: { kind: 'ownership-lost', message: 'Lease expired' } })
    } else if (!result.ok) {
      handleSave(result)
    }
  }

  async function leaveGame() {
    pause()
    cancelOperation()
    failedGeneration.value = null
    await release()
  }

  /** A player-requested departure keeps unsaved state attached so failure can be retried. */
  async function prepareLeave(): Promise<boolean> {
    const prepared = await transitions.prepareTransition()
    if (prepared.status !== 'ready') {
      return false
    }

    const checkpoint = persistence.capture()
    const released = await persistence.release()
    // A dataset reset or session replacement during release must not authorize an old navigation.
    return persistence.isCurrent(checkpoint) && released.ok
  }

  async function prepareBackup() {
    if (phase.value === 'generating') {
      cancelLoading()
    }

    const result = await transitions.prepareTransition()

    return result.status === 'ready'
  }

  function dropSession() {
    cancelOperation()
    persistence.reset()
    session.value = null
    phase.value = 'paused'
    hint.value = null
    checkedBoard.value = null
    failedGeneration.value = null
    readOnly.value = false
    saveState.value = 'idle'
    saveMessage.value = null
  }

  const unsubscribe = runtime.ownership.subscribe((notice) => {
    if (notice.kind === 'reset') {
      dropSession()
    } else if (notice.sessionId === session.value?.id && persistence.capture().token) {
      void renewLease()
    }
  })

  let disposed = false

  function dispose() {
    if (disposed) {
      return
    }
    disposed = true

    stopNoteRevision()
    conflictAnalysis.dispose()
    stopPreparing()
    prepared.value?.dispose()
    prepared.value = null
    ruleMetadata.value = null
    unsubscribe()
    void leaveGame()
  }

  onScopeDispose(dispose)

  return {
    ruleMetadata,
    session,
    phase,
    selectedCell,
    noteMode,
    hint,
    hintLoading,
    notesLoading,
    conflictAnalysisState,
    checkedCells,
    checkIsCurrent,
    canRetryGeneration,
    error,
    saveMessage,
    saveState,
    readOnly,
    board,
    conflicts,
    conflictEvaluation,
    activeVariant,
    elapsedMs,
    editable,
    canUndo,
    canRedo,
    tick,
    startGame,
    findFreeSession,
    findSession,
    findPracticeSession,
    retryGeneration,
    restoreSession,
    reloadLatestSession,
    clearActiveSession,
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
    prepareLeave,
    prepareBackup,
    dropSession,
    dispose,
  }
})
