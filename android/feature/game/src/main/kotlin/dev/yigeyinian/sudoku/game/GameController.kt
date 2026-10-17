package dev.yigeyinian.sudoku.game

import dev.yigeyinian.sudoku.model.BoardEdit
import dev.yigeyinian.sudoku.model.BoardLayers
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.EditResult
import dev.yigeyinian.sudoku.model.EditorToken
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.GameMode
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.GameSession
import dev.yigeyinian.sudoku.model.HintResult
import dev.yigeyinian.sudoku.model.PreparedPuzzle
import dev.yigeyinian.sudoku.model.PreviousSession
import dev.yigeyinian.sudoku.model.SessionClock
import dev.yigeyinian.sudoku.model.SessionFactAction
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.StorageFailure
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.SudokuEngine
import dev.yigeyinian.sudoku.model.applySessionAction
import dev.yigeyinian.sudoku.model.commitBoardEdit
import dev.yigeyinian.sudoku.model.completeSession
import dev.yigeyinian.sudoku.model.createSession
import dev.yigeyinian.sudoku.model.dailyFormalId
import dev.yigeyinian.sudoku.model.dailySeedMaterial
import dev.yigeyinian.sudoku.model.isoInstant
import dev.yigeyinian.sudoku.model.restartDailySession
import dev.yigeyinian.sudoku.model.sessionBoard
import dev.yigeyinian.sudoku.model.variant
import java.security.SecureRandom
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Owns one complete player workflow; native analysis and persistence never own mutable UI state. */
internal class GameController(
    private val engine: SudokuEngine,
    private val repository: GameRepository,
    private val scope: CoroutineScope,
    private val restoredSessionId: String?,
    private val rememberSession: (String?) -> Unit,
    private val monotonicMs: () -> Long = android.os.SystemClock::elapsedRealtime,
    private val currentInstant: () -> Instant = Instant::now
) {
    private val mutableState = MutableStateFlow(GameUiState())
    val uiState = mutableState.asStateFlow()
    private val actions = Mutex()
    private val ownerId = UUID.randomUUID().toString()
    private var opened = false
    private var prepared: PreparedPuzzle? = null
    private var editor: EditorToken? = null
    private var writer: SessionWriter? = null
    private var saveObserver: Job? = null
    private var clock: SessionClock? = null
    private var ticker: Job? = null
    private var transition: Job? = null
    private var transitionGeneration = 0L
    private var boardRevision = 0L
    private var analysisGeneration = 0L
    private var datasetEpoch: Long? = null
    private var hintFence: AnalysisFence? = null
    private var notesJob: Job? = null
    private var hintJob: Job? = null
    private var conflictsJob: Job? = null
    private var retrySeed: Pair<GameLaunch, List<UByte>>? = null

    fun open(launch: GameLaunch) {
        if (opened) {
            return
        }
        opened = true
        beginTransition { generation ->
            val epoch = storage(repository.readDatasetEpoch())
            datasetEpoch = epoch
            val settings = storage(repository.readSettings())
            update { it.copy(settings = settings) }
            val intent = restoredSessionId?.let(GameLaunch::Resume) ?: launch
            val records = storage(repository.listSessions())
            when (intent) {
                is GameLaunch.Resume -> {
                    val record = records.find { it.session.id == intent.sessionId }
                    if (record != null) {
                        load(record, epoch)
                    } else {
                        val result = storage(repository.listResults()).find { it.session.id == intent.sessionId }
                            ?: throw WorkflowFailure("找不到这局已保存的数独，请返回重新选择。")
                        load(SessionRecord(revision = 0, session = result.session), epoch, readOnly = true)
                    }
                }
                is GameLaunch.Free -> generateSession(intent, epoch, records, generation)
                is GameLaunch.Daily -> openDaily(intent, epoch, records, generation)
                is GameLaunch.Practice -> {
                    val existing = records.firstOrNull { it.session.mode == GameMode.LEARNING }
                    if (existing == null) {
                        generateSession(intent, epoch, records, generation)
                    } else {
                        load(existing, epoch)
                        update { it.copy(practiceReplacement = intent) }
                    }
                }
            }
        }
    }

    fun startNew(launch: GameLaunch) {
        beginTransition { generation ->
            val epoch = storage(repository.readDatasetEpoch())
            datasetEpoch = epoch
            val records = storage(repository.listSessions())
            if (launch is GameLaunch.Daily) {
                openDaily(
                    launch,
                    epoch,
                    records,
                    generation
                )
            } else if (launch is GameLaunch.Resume) {
                val record = records.find { it.session.id == launch.sessionId } ?: throw WorkflowFailure("找不到已保存的对局。")
                load(record, epoch)
            } else {
                generateSession(launch, epoch, records, generation)
            }
        }
    }

    fun confirmPracticeReplacement() {
        val intent = mutableState.value.practiceReplacement ?: return
        update { it.copy(practiceReplacement = null) }
        startNew(intent)
    }

    fun cancelPracticeReplacement() {
        update { it.copy(practiceReplacement = null) }
    }

    private fun beginTransition(operation: suspend (Long) -> Unit) {
        transitionGeneration += 1
        val generation = transitionGeneration
        transition?.cancel()
        invalidateAnalysis()
        transition = scope.launch {
            try {
                val canSwitch = actions.withLock {
                    pauseCurrent()
                    writer?.flush() ?: true
                }
                if (!canSwitch) {
                    throw WorkflowFailure("当前进度尚未保存，请重试保存后再切换。")
                }
                if (generation != transitionGeneration) {
                    return@launch
                }
                currentCoroutineContext().ensureActive()
                update { it.copy(phase = GamePhase.PREPARING, error = null, message = null) }
                operation(generation)
                currentCoroutineContext().ensureActive()
            } catch (cancelled: CancellationException) {
                // Before commit, cancellation retains the old puzzle; started writes settle in commitPreparation.
            } catch (failure: WorkflowFailure) {
                if (generation == transitionGeneration) {
                    update { it.copy(error = failure.message) }
                }
            } catch (failure: Exception) {
                if (generation == transitionGeneration) {
                    update { it.copy(error = failure.message ?: "无法准备对局，请重试。") }
                }
            } finally {
                if (generation == transitionGeneration && mutableState.value.phase == GamePhase.PREPARING) {
                    update { it.copy(phase = settledPhase(it.session)) }
                }
            }
        }
    }

    fun cancelPreparation() {
        // A transition may still be flushing the old save before it publishes PREPARING.
        // Always fence that work, but show cancellation feedback only for an actual preparation.
        transitionGeneration += 1
        transition?.cancel()
        transition = null
        if (mutableState.value.phase != GamePhase.PREPARING) {
            return
        }
        update {
            if (it.preparationCommitting) {
                it.copy(phase = GamePhase.PREPARING, message = "正在完成已开始的保存，完成后对局将保持暂停。")
            } else {
                it.copy(phase = settledPhase(it.session), message = "已取消准备，现有进度保持不变。")
            }
        }
    }

    private suspend fun openDaily(
        launch: GameLaunch.Daily,
        epoch: Long,
        records: List<SessionRecord>,
        generation: Long
    ) {
        val formalId = dailyFormalId(launch.date, launch.variant)
        val unfinished = records.find { it.session.id == formalId && it.session.completion == null }
        if (unfinished != null) {
            load(unfinished, epoch)
            return
        }
        generateSession(launch, epoch, records, generation)
    }

    private suspend fun generateSession(
        launch: GameLaunch,
        epoch: Long,
        records: List<SessionRecord>,
        generation: Long
    ) {
        val variant = when (launch) {
            is GameLaunch.Free -> launch.variant
            is GameLaunch.Daily -> launch.variant
            is GameLaunch.Practice -> launch.variant
            is GameLaunch.Resume -> throw WorkflowFailure("继续对局需要已保存的题目。")
        }
        val difficulty = when (launch) {
            is GameLaunch.Free -> launch.difficulty
            is GameLaunch.Practice -> launch.difficulty
            is GameLaunch.Daily -> Difficulty.MEDIUM
            is GameLaunch.Resume -> throw WorkflowFailure("对局参数无效。")
        }
        val seed = retrySeed?.takeIf { it.first == launch }?.second ?: if (launch is GameLaunch.Daily) {
            engineValue(engine.deriveSeed(dailySeedMaterial(launch.date)))
        } else {
            withContext(Dispatchers.IO) { ByteArray(32).also { SecureRandom().nextBytes(it) }.map { it.toUByte() } }
        }
        retrySeed = launch to seed.toList()
        val generated = engineValue(
            engine.generate(
                dev.yigeyinian.sudoku.model.GenerationRequest(
                    variant,
                    difficulty,
                    seed
                )
            )
        )
        currentCoroutineContext().ensureActive()
        val metadata = when (launch) {
            is GameLaunch.Free -> SessionMetadata.Free
            is GameLaunch.Practice -> SessionMetadata.Learning(launch.lessonId)
            is GameLaunch.Daily -> {
                val formalId = dailyFormalId(launch.date, variant)
                val completed = records.any {
                    it.session.id == formalId &&
                        it.session.completion != null
                } ||
                    storage(repository.listResults()).any { it.session.id == formalId }
                SessionMetadata.Daily(launch.date, !completed)
            }
            is GameLaunch.Resume -> throw WorkflowFailure("对局参数无效。")
        }
        val id = if (metadata is SessionMetadata.Daily &&
            metadata.formalAttempt
        ) {
            dailyFormalId(
                metadata.challengeDate,
                variant
            )
        } else {
            UUID.randomUUID().toString()
        }
        val session = createSession(generated.puzzle, metadata, id, nowText(), generated.assessment)
        val handle = engineValue(engine.prepare(session.puzzle.rules))
        var installed = false
        try {
            currentCoroutineContext().ensureActive()
            ensureEpoch(epoch)
            val previous = previousSlot(session, records)
            actions.withLock {
                currentCoroutineContext().ensureActive()
                commitPreparation(generation) {
                    val saved = persistReplacement(session, previous, epoch)
                    install(saved.first, handle, saved.second, epoch)
                    installed = true
                    retrySeed = null
                }
            }
            resumeAfterPreparation(generation)
        } finally {
            if (!installed) {
                withContext(NonCancellable) { handle.close() }
            }
        }
    }

    /** Once persistence starts, cancellation may stop auto-resume but must finish adopting the committed identity. */
    private suspend fun commitPreparation(generation: Long, operation: suspend () -> Unit) {
        update { it.copy(preparationCommitting = true) }
        try {
            withContext(NonCancellable) { operation() }
        } finally {
            update { state ->
                val superseded = generation != transitionGeneration
                state.copy(
                    preparationCommitting = false,
                    phase = if (superseded) settledPhase(state.session) else state.phase,
                    message = if (superseded) "保存流程已结束，对局保持暂停。" else state.message
                )
            }
        }
    }

    private fun resumeAfterPreparation(generation: Long) {
        if (generation == transitionGeneration) {
            resume(generation)
        }
    }

    private fun previousSlot(session: GameSession, records: List<SessionRecord>): SessionRecord? =
        if (session.mode == GameMode.DAILY) {
            null
        } else {
            records.singleOrNull {
                it.session.mode == session.mode &&
                    (
                        session.mode != GameMode.FREE ||
                            it.session.puzzle.rules.variant == session.puzzle.rules.variant
                        )
            }
        }

    private suspend fun persistReplacement(
        session: GameSession,
        previous: SessionRecord?,
        epoch: Long
    ): Pair<
        SessionRecord,
        EditorToken
        > {
        val oldSession = mutableState.value.session
        val oldRevision = writer?.revision
        try {
            val previousToken = if (previous != null) {
                val token = storage(repository.claimEditor(previous.session.id, ownerId))
                if (token.epoch != epoch) {
                    throw WorkflowFailure("数据已更新，请返回重新打开对局。")
                }
                PreviousSession(previous.session.id, previous.revision, token)
            } else {
                null
            }
            val token = storage(repository.claimEditor(session.id, ownerId))
            if (token.epoch != epoch) {
                throw WorkflowFailure("数据已更新，请返回重新打开对局。")
            }
            val saved = if (session.mode == GameMode.DAILY) {
                storage(
                    repository.writeSession(
                        session,
                        0,
                        token
                    )
                )
            } else {
                storage(
                    repository.replaceActiveSession(
                        session,
                        token,
                        previousToken
                    )
                )
            }
            return saved to token
        } catch (failure: Exception) {
            // Claiming the target fences the previous editor; recover its token before permitting more saves.
            if (oldSession != null && oldRevision != null) {
                recoverEditor(oldSession, oldRevision, epoch)
            }
            throw failure
        }
    }

    private suspend fun load(record: SessionRecord, epoch: Long, readOnly: Boolean = false) {
        val handle = engineValue(engine.prepare(record.session.puzzle.rules))
        var installed = false
        val oldSession = mutableState.value.session
        val oldRevision = writer?.revision
        try {
            actions.withLock {
                currentCoroutineContext().ensureActive()
                ensureEpoch(epoch)
                // Claiming and adopting a saved revision is one transition from the caller's perspective.
                withContext(NonCancellable) {
                    var claimed: EditorToken? = null
                    try {
                        if (readOnly) {
                            editor?.let { storage(repository.releaseEditor(it)) }
                        } else {
                            claimed = storage(repository.claimEditor(record.session.id, ownerId))
                            if (claimed.epoch != epoch) {
                                throw WorkflowFailure("数据已更新，请重新打开对局。")
                            }
                            val current = storage(repository.listSessions()).find { it.session.id == record.session.id }
                            if (current?.revision != record.revision) {
                                throw WorkflowFailure("保存版本已变化，请重新打开最新的对局。")
                            }
                        }
                        ensureEpoch(epoch)
                        install(record, handle, claimed, epoch)
                        installed = true
                    } catch (failure: Exception) {
                        if (claimed != null) {
                            repository.releaseEditor(claimed)
                        }
                        if (oldSession != null &&
                            oldRevision != null
                        ) {
                            recoverEditor(
                                oldSession,
                                oldRevision,
                                epoch
                            )
                        }
                        throw failure
                    }
                }
            }
        } finally {
            if (!installed) {
                withContext(NonCancellable) { handle.close() }
            }
        }
    }

    private fun install(record: SessionRecord, handle: PreparedPuzzle, token: EditorToken?, epoch: Long) {
        val oldHandle = prepared
        writer?.invalidate()
        saveObserver?.cancel()
        ticker?.cancel()
        invalidateAnalysis()
        prepared = handle
        editor = token
        datasetEpoch = epoch
        clock = SessionClock(record.session.elapsedMs)
        mutableState.value = GameUiState(
            phase = settledPhase(record.session),
            session = record.session,
            metadata = handle.metadata,
            elapsedMs = record.session.elapsedMs,
            settings = mutableState.value.settings
        )
        rememberSession(record.session.id)
        if (token != null) {
            attachWriter(record.revision, token)
        } else {
            writer = null
        }
        if (oldHandle != null) {
            scope.launch(start = CoroutineStart.UNDISPATCHED) { oldHandle.close() }
        }
    }

    private fun attachWriter(revision: Long, token: EditorToken) {
        writer?.invalidate()
        saveObserver?.cancel()
        val next = SessionWriter(
            scope,
            revision
        ) {
                snapshot,
                expected
            ->
            repository.writeSession(
                snapshot,
                expected,
                token
            )
        }
        writer = next
        editor = token
        saveObserver = scope.launch { next.state.collectLatest { save -> update { it.copy(save = save) } } }
    }

    private suspend fun recoverEditor(session: GameSession, revision: Long, epoch: Long): Boolean {
        val currentEpoch = repository.readDatasetEpoch()
        val records = repository.listSessions()
        val unchanged = currentEpoch is StorageOutcome.Success && currentEpoch.value == epoch &&
            records is StorageOutcome.Success &&
            records.value.find { it.session.id == session.id }?.revision == revision
        if (!unchanged) {
            loseEditor("保存版本或数据集已变化，当前未保存进度仍保留在页面中；请勿覆盖较新的记录。")
            return false
        }
        val result = repository.claimEditor(session.id, ownerId)
        if (result is StorageOutcome.Success && result.value.epoch == epoch) {
            attachWriter(revision, result.value)
            return true
        }
        loseEditor("无法恢复编辑权，当前未保存进度仍保留在页面中。")
        return false
    }

    private fun loseEditor(message: String) {
        saveObserver?.cancel()
        writer?.invalidate()
        editor = null
        update {
            it.copy(
                save = SaveState(
                    dirty = true,
                    failure = StorageFailure(
                        StorageFailureKind.OWNERSHIP_LOST,
                        message
                    )
                ),
                error = message
            )
        }
    }

    fun selectCell(cell: Int) {
        if (cell !in 0..80) {
            return
        }
        update { it.copy(selectedCell = cell) }
    }

    fun toggleNotes() {
        if (mutableState.value.editable) {
            update { it.copy(noteMode = !it.noteMode) }
        }
    }

    fun enterDigit(digit: Int) = editDigit(digit, mutableState.value.noteMode)

    fun toggleNote(digit: Int) = editDigit(digit, asNote = true)

    private fun editDigit(digit: Int, asNote: Boolean) {
        val state = mutableState.value
        val cell = state.selectedCell ?: return
        if (digit !in 1..9 || !state.inputEditable) {
            return
        }
        queueEdit(if (asNote) BoardEdit.ToggleNote(cell, digit) else BoardEdit.Enter(cell, digit))
    }

    fun erase() {
        val state = mutableState.value
        val cell = state.selectedCell ?: return
        if (state.inputEditable) {
            queueEdit(BoardEdit.Erase(cell))
        }
    }

    private fun queueEdit(action: BoardEdit, expected: AnalysisFence? = null) {
        scope.launch {
            actions.withLock {
                if (!mutableState.value.editable || (expected != null && !matches(expected))) {
                    return@withLock
                }
                val session = mutableState.value.session ?: return@withLock
                val handle = prepared ?: return@withLock
                when (
                    val result = handle.edit(
                        session.puzzle.givens,
                        BoardLayers(
                            session.entries,
                            session.notes
                        ),
                        action
                    )
                ) {
                    is EngineOutcome.Completed -> commitEdit(result.value, action)
                    else -> showEngineFailure(result)
                }
            }
        }
    }

    private fun commitEdit(result: EditResult, action: BoardEdit) {
        val session = mutableState.value.session ?: return
        val outcome = commitBoardEdit(session, result, action)
        if (!outcome.changed) {
            return
        }
        invalidateAnalysis()
        val next = timed(outcome.session)
        val completed = if (result.boardComplete) {
            val elapsed = clock?.pause(monotonicMs()) ?: next.elapsedMs
            completeSession(next, nowText(), elapsed, true)
        } else {
            next
        }
        update {
            it.copy(
                session = completed,
                elapsedMs = completed.elapsedMs,
                phase = if (completed.completion != null) GamePhase.COMPLETED else it.phase,
                reviewCells = emptySet(),
                error = null,
                message = null
            )
        }
        writer?.stage(completed)
        if (completed.completion != null) {
            ticker?.cancel()
        } else {
            refreshConflicts()
        }
    }

    fun undo() = history(SessionFactAction.UNDO)
    fun redo() = history(SessionFactAction.REDO)

    private fun history(action: SessionFactAction) {
        scope.launch {
            actions.withLock {
                val session = mutableState.value.session ?: return@withLock
                if (!mutableState.value.editable) {
                    return@withLock
                }
                val next = applySessionAction(session, action)
                if (next.changed) {
                    invalidateAnalysis()
                    val snapshot = timed(next.session)
                    update {
                        it.copy(
                            session = snapshot,
                            elapsedMs = snapshot.elapsedMs,
                            reviewCells = emptySet(),
                            message = null,
                            error = null
                        )
                    }
                    writer?.stage(snapshot)
                    refreshConflicts()
                }
            }
        }
    }

    fun resume() = resume(null)

    private fun resume(expectedGeneration: Long?) {
        scope.launch {
            actions.withLock {
                if (expectedGeneration != null && expectedGeneration != transitionGeneration) {
                    return@withLock
                }
                if (mutableState.value.phase != GamePhase.PAUSED || editor == null) {
                    return@withLock
                }
                val epoch = repository.readDatasetEpoch()
                if (epoch !is StorageOutcome.Success || epoch.value != editor?.epoch) {
                    writer?.invalidate()
                    editor = null
                    update { it.copy(error = "本机数据或编辑权已变化，请重新打开已保存的对局。") }
                    return@withLock
                }
                // An epoch read can suspend after the user has already paused or left this preparation.
                if (expectedGeneration != null && expectedGeneration != transitionGeneration) {
                    return@withLock
                }
                clock?.resume(monotonicMs())
                update { it.copy(phase = GamePhase.PLAYING, error = null) }
                startTicker()
                refreshConflicts()
            }
        }
    }

    fun pause() {
        if (mutableState.value.phase == GamePhase.PREPARING) {
            cancelPreparation()
        } else {
            transitionGeneration += 1
        }
        scope.launch { actions.withLock { pauseCurrent() } }
    }

    private fun pauseCurrent() {
        val session = mutableState.value.session ?: return
        invalidateAnalysis()
        val elapsed = clock?.pause(monotonicMs()) ?: session.elapsedMs
        ticker?.cancel()
        val snapshot = session.copy(elapsedMs = elapsed)
        update { it.copy(phase = settledPhase(snapshot), session = snapshot, elapsedMs = elapsed) }
        if (editor != null) {
            writer?.stage(snapshot)
        }
    }

    private fun startTicker() {
        ticker?.cancel()
        ticker = scope.launch {
            var savedAt = monotonicMs()
            while (true) {
                delay(250)
                val activeClock = clock ?: break
                if (!activeClock.isRunning) {
                    break
                }
                val now = monotonicMs()
                update { it.copy(elapsedMs = activeClock.elapsedAt(now)) }
                if (now - savedAt >= 5_000) {
                    val session = mutableState.value.session ?: break
                    val snapshot = timed(session)
                    update { it.copy(session = snapshot) }
                    writer?.stage(snapshot)
                    savedAt = now
                }
            }
        }
    }

    fun generateNotes() {
        if (!mutableState.value.editable || mutableState.value.notesPending) {
            return
        }
        val session = mutableState.value.session ?: return
        val handle = prepared ?: return
        val fence = fence() ?: return
        update { it.copy(notesPending = true, error = null) }
        notesJob = scope.launch {
            val result = handle.edit(
                session.puzzle.givens,
                BoardLayers(
                    session.entries,
                    session.notes
                ),
                BoardEdit.GenerateNotes
            )
            currentCoroutineContext().ensureActive()
            actions.withLock {
                if (!isCurrent(fence)) {
                    return@withLock
                }
                update { it.copy(notesPending = false) }
                when (result) {
                    is EngineOutcome.Completed -> commitEdit(result.value, BoardEdit.GenerateNotes)
                    else -> showEngineFailure(result)
                }
            }
        }
    }

    fun requestHint() {
        if (!mutableState.value.editable || mutableState.value.hintPending) {
            return
        }
        val session = mutableState.value.session ?: return
        val handle = prepared ?: return
        val fence = fence() ?: return
        update { it.copy(hintPending = true, error = null) }
        hintJob = scope.launch {
            val result = handle.hint(sessionBoard(session), session.puzzle.solution)
            currentCoroutineContext().ensureActive()
            actions.withLock {
                if (!isCurrent(fence)) {
                    return@withLock
                }
                update { it.copy(hintPending = false) }
                when (result) {
                    is EngineOutcome.Completed -> {
                        when (val hint = result.value) {
                            is HintResult.Deduction -> {
                                val current = mutableState.value.session ?: return@withLock
                                val assisted = timed(
                                    applySessionAction(
                                        current,
                                        SessionFactAction.HINT_SHOWN
                                    ).session
                                )
                                hintFence = fence
                                update { it.copy(session = assisted, hint = hint, hintStep = 0) }
                                writer?.stage(assisted)
                            }
                            is HintResult.ReviewEntry -> update {
                                it.copy(
                                    reviewCells = setOf(hint.cell),
                                    message = "请先检查标记格的填写，再继续推理。"
                                )
                            }
                            is HintResult.Unavailable -> {
                                val message = if (hint.reason == "complete") {
                                    "当前棋盘已完成。"
                                } else {
                                    "暂时没有可用的逻辑提示，请继续尝试。"
                                }
                                update { it.copy(message = message) }
                            }
                        }
                    }
                    else -> showEngineFailure(result)
                }
            }
        }
    }

    fun nextHint() {
        update { state ->
            state.copy(hintStep = (state.hintStep + 1).coerceAtMost(state.hint?.steps?.lastIndex ?: 0))
        }
    }

    fun applyHint() {
        val hint = mutableState.value.hint ?: return
        val expected = hintFence ?: return
        if (!matches(expected) || !mutableState.value.editable) {
            dismissHint()
            return
        }
        queueEdit(BoardEdit.Enter(hint.placement.cell, hint.placement.digit), expected)
        dismissHint()
    }

    fun dismissHint() {
        hintFence = null
        update { it.copy(hint = null, hintStep = 0) }
    }

    fun checkEntries() {
        scope.launch {
            actions.withLock {
                val session = mutableState.value.session ?: return@withLock
                val handle = prepared ?: return@withLock
                if (!mutableState.value.editable) {
                    return@withLock
                }
                when (val result = handle.reviewEntries(sessionBoard(session), session.puzzle.solution)) {
                    is EngineOutcome.Completed -> {
                        val snapshot = timed(applySessionAction(session, SessionFactAction.CHECK).session)
                        update {
                            it.copy(
                                session = snapshot,
                                reviewCells = result.value.toSet(),
                                message = if (result.value.isEmpty()) "当前填写均正确；本次检查已记为辅助。" else "已标记需要检查的填写；本次检查已记为辅助。"
                            )
                        }
                        writer?.stage(snapshot)
                    }
                    else -> showEngineFailure(result)
                }
            }
        }
    }

    private fun refreshConflicts() {
        conflictsJob?.cancel()
        val session = mutableState.value.session ?: return
        val handle = prepared ?: return
        if (!mutableState.value.editable ||
            !mutableState.value.settings.highlightConflicts
        ) {
            update {
                it.copy(
                    conflicts = emptySet(),
                    conflictPending = false
                )
            }
            return
        }
        val fence = fence() ?: return
        update { it.copy(conflictPending = true, conflicts = emptySet()) }
        conflictsJob = scope.launch {
            val result = handle.conflicts(sessionBoard(session))
            currentCoroutineContext().ensureActive()
            actions.withLock {
                if (!isCurrent(fence)) {
                    return@withLock
                }
                update { it.copy(conflictPending = false) }
                when (result) {
                    is EngineOutcome.Completed -> {
                        val cells = result.value.flatMap { violation -> violation.cells }.toSet()
                        update { it.copy(conflicts = cells) }
                    }
                    else -> update { it.copy(message = "当前规则检查尚未完成，填写和笔记保持不变。") }
                }
            }
        }
    }

    fun restart() {
        scope.launch {
            actions.withLock {
                val session = mutableState.value.session ?: return@withLock
                pauseCurrent()
                if (writer?.flush() == false) {
                    update { it.copy(error = "请先重试保存，再重新开始。") }
                    return@withLock
                }
                if (session.mode == GameMode.DAILY && session.completion == null) {
                    val snapshot = restartDailySession(timed(session))
                    clock = SessionClock(snapshot.elapsedMs)
                    update {
                        it.copy(
                            session = snapshot,
                            elapsedMs = snapshot.elapsedMs,
                            phase = GamePhase.PAUSED,
                            reviewCells = emptySet(),
                            conflicts = emptySet(),
                            message = "已清空填写；累计用时和辅助记录已保留。"
                        )
                    }
                    writer?.stage(snapshot)
                } else {
                    beginTransition { generation ->
                        val epoch = storage(repository.readDatasetEpoch())
                        val records = storage(repository.listSessions())
                        val previousMetadata = session.metadata
                        val metadata = if (previousMetadata is SessionMetadata.Daily) {
                            previousMetadata.copy(formalAttempt = false)
                        } else {
                            previousMetadata
                        }
                        val restarted = createSession(
                            session.puzzle,
                            metadata,
                            UUID.randomUUID().toString(),
                            nowText(),
                            session.assessment
                        )
                        val handle = engineValue(engine.prepare(restarted.puzzle.rules))
                        var installed = false
                        try {
                            ensureEpoch(epoch)
                            actions.withLock {
                                currentCoroutineContext().ensureActive()
                                commitPreparation(generation) {
                                    val saved = persistReplacement(restarted, previousSlot(restarted, records), epoch)
                                    install(saved.first, handle, saved.second, epoch)
                                    installed = true
                                }
                            }
                            resumeAfterPreparation(generation)
                        } finally {
                            if (!installed) {
                                withContext(NonCancellable) { handle.close() }
                            }
                        }
                    }
                }
            }
        }
    }

    fun retrySave() {
        scope.launch {
            actions.withLock {
                val session = mutableState.value.session ?: return@withLock
                val epoch = datasetEpoch ?: return@withLock
                val failure = mutableState.value.save.failure?.kind
                if (editor == null ||
                    failure == StorageFailureKind.OWNERSHIP_LOST ||
                    failure == StorageFailureKind.REVISION_CONFLICT
                ) {
                    val revision = writer?.revision ?: return@withLock
                    if (!recoverEditor(session, revision, epoch)) {
                        return@withLock
                    }
                    writer?.stage(timed(session))
                }
                writer?.flush()
            }
        }
    }

    fun setShowTimer(show: Boolean) = settings { it.copy(showTimer = show) }
    fun setHighlightConflicts(show: Boolean) = settings { it.copy(highlightConflicts = show) }

    private fun settings(transform: (Settings) -> Settings) {
        scope.launch {
            actions.withLock {
                val epoch = datasetEpoch ?: storage(repository.readDatasetEpoch())
                val next = transform(mutableState.value.settings)
                when (val result = repository.writeSettings(next, epoch)) {
                    is StorageOutcome.Success -> {
                        update { it.copy(settings = next) }
                        refreshConflicts()
                    }
                    is StorageOutcome.Failure -> update { it.copy(error = "设置保存失败：${result.error.message}") }
                }
            }
        }
    }

    suspend fun leave(): Boolean {
        cancelPreparation()
        return actions.withLock {
            pauseCurrent()
            if (writer?.flush() == false) {
                update { it.copy(error = "当前进度尚未保存，请重试保存后再返回。") }
                return@withLock false
            }
            val token = editor
            if (token != null) {
                when (val result = repository.releaseEditor(token)) {
                    is StorageOutcome.Failure -> {
                        update { it.copy(error = "无法释放编辑权：${result.error.message}") }
                        return@withLock false
                    }
                    is StorageOutcome.Success -> editor = null
                }
            }
            writer?.invalidate()
            prepared?.close()
            prepared = null
            true
        }
    }

    fun dispose() {
        transitionGeneration += 1
        invalidateAnalysis()
        transition?.cancel()
        ticker?.cancel()
        val handle = prepared
        val token = editor
        prepared = null
        editor = null
        // The route normally calls leave; this resource scope also closes after abrupt ViewModel disposal.
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            handle?.close()
            if (token != null) {
                repository.releaseEditor(token)
            }
        }
    }

    private fun invalidateAnalysis() {
        boardRevision += 1
        analysisGeneration += 1
        notesJob?.cancel()
        hintJob?.cancel()
        conflictsJob?.cancel()
        hintFence = null
        update {
            it.copy(notesPending = false, hintPending = false, conflictPending = false, hint = null, hintStep = 0)
        }
    }

    private fun fence(): AnalysisFence? {
        val session = mutableState.value.session ?: return null
        return AnalysisFence(
            session.id,
            session.puzzle.seed,
            boardRevision,
            analysisGeneration,
            datasetEpoch ?: return null
        )
    }

    private fun matches(fence: AnalysisFence): Boolean {
        val state = mutableState.value
        return state.editable &&
            state.session?.id == fence.sessionId &&
            state.session.puzzle.seed == fence.puzzleSeed &&
            boardRevision == fence.boardRevision &&
            analysisGeneration == fence.generation &&
            datasetEpoch == fence.epoch
    }

    private suspend fun isCurrent(fence: AnalysisFence): Boolean {
        if (!matches(fence)) {
            return false
        }
        val result = repository.readDatasetEpoch()
        if (result !is StorageOutcome.Success || result.value != fence.epoch) {
            invalidateAnalysis()
            pauseCurrent()
            writer?.invalidate()
            editor = null
            update { it.copy(error = "本机数据已变化，请返回重新打开对局。") }
            return false
        }
        return matches(fence)
    }

    private suspend fun ensureEpoch(expected: Long) {
        if (storage(repository.readDatasetEpoch()) != expected) {
            throw WorkflowFailure("本机数据已变化，本次操作未安装。请重新打开对局。")
        }
        currentCoroutineContext().ensureActive()
    }

    private fun timed(session: GameSession): GameSession =
        session.copy(elapsedMs = clock?.elapsedAt(monotonicMs()) ?: session.elapsedMs)
    private fun nowText(): String = isoInstant(currentInstant())
    private fun settledPhase(session: GameSession?): GamePhase = when {
        session == null -> GamePhase.EMPTY
        session.completion != null -> GamePhase.COMPLETED
        else -> GamePhase.PAUSED
    }
    private fun update(transform: (GameUiState) -> GameUiState) {
        mutableState.value = transform(mutableState.value)
    }
    private fun showEngineFailure(result: EngineOutcome<*>) {
        update { it.copy(error = engineMessage(result)) }
    }
    private fun engineMessage(result: EngineOutcome<*>): String = when (result) {
        is EngineOutcome.BudgetExhausted -> "计算已达到工作上限，当前进度保持不变。"
        EngineOutcome.Cancelled -> "计算已取消，当前进度保持不变。"
        EngineOutcome.TimedOut -> "计算超时，请重试；重试会使用同一题目种子。"
        is EngineOutcome.Failed -> "数独引擎暂不可用：${result.message}"
        is EngineOutcome.Completed -> "计算已完成。"
    }
    private fun <T> engineValue(result: EngineOutcome<T>): T = when (result) {
        is EngineOutcome.Completed -> result.value
        EngineOutcome.Cancelled -> throw CancellationException("Native computation cancelled")
        else -> throw WorkflowFailure(engineMessage(result))
    }
    private fun <T> storage(result: StorageOutcome<T>): T = when (result) {
        is StorageOutcome.Success -> result.value
        is StorageOutcome.Failure -> throw WorkflowFailure("本机数据操作失败：${result.error.message}")
    }
}

private data class AnalysisFence(
    val sessionId: String,
    val puzzleSeed: String,
    val boardRevision: Long,
    val generation: Long,
    val epoch: Long
)
private class WorkflowFailure(message: String) : IllegalStateException(message)
