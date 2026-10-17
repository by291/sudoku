package dev.sudoku.app.game

import dev.sudoku.app.model.BackupExport
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.BoardEdit
import dev.sudoku.app.model.BoardLayers
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EditResult
import dev.sudoku.app.model.EditorToken
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GameLaunch
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.PreviousSession
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.ResultRecord
import dev.sudoku.app.model.RuleMetadata
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SudokuEngine
import dev.sudoku.app.model.createSession
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameControllerTest {
    @Test
    fun restoredSessionIsPausedAndLeavingFlushesWithoutCountingInvisibleTime() = runTest {
        val repository = ControllerRepository()
        val controller =
            GameController(
                ControllerEngine(),
                repository,
                repository.reads,
                backgroundScope,
                "saved",
                {},
                { testScheduler.currentTime }
            )
        controller.open(GameLaunch.Free(dev.sudoku.app.model.Variant.CLASSIC, Difficulty.EASY))
        runCurrent()

        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
        advanceTimeBy(2_000)
        runCurrent()
        assertEquals(50L, controller.uiState.value.elapsedMs)
        assertTrue(controller.leave())
        assertEquals(50L, repository.records.single().session.elapsedMs)
    }

    @Test
    fun leavingAnActiveGameDoesNotPublishPreparationFeedback() = runTest {
        val repository = ControllerRepository()
        val controller = GameController(
            ControllerEngine(),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.resume()
        runCurrent()
        val messages = mutableListOf<String?>()
        backgroundScope.launch(start = CoroutineStart.UNDISPATCHED) {
            controller.uiState.collect { messages += it.message }
        }

        assertTrue(controller.leave())
        runCurrent()

        assertTrue("Leaving must not insert a cancellation caption above the board", messages.all { it == null })
        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
    }

    @Test
    fun failedLeaveKeepsTheSessionPausedAndCanBeRetried() = runTest {
        val repository = ControllerRepository()
        val controller = GameController(
            ControllerEngine(),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.resume()
        runCurrent()
        repository.ownershipLost = true

        assertFalse(controller.leave())
        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
        assertEquals("saved", controller.uiState.value.session?.id)
        assertEquals(null, controller.uiState.value.message)
        assertTrue(controller.uiState.value.error != null)

        repository.ownershipLost = false
        assertTrue(controller.leave())
    }

    @Test
    fun oldGeneratedNotesCannotOverwriteANewerEntryOrAddAssistance() = runTest {
        val repository = ControllerRepository()
        val prepared = ControllerPrepared()
        val controller =
            GameController(ControllerEngine(prepared), repository, repository.reads, backgroundScope, "saved", {
            }, { testScheduler.currentTime })
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.resume()
        runCurrent()
        controller.generateNotes()
        runCurrent()
        assertTrue(controller.uiState.value.notesPending)

        controller.selectCell(0)
        controller.enterDigit(5)
        runCurrent()
        prepared.notes.complete(EngineOutcome.Completed(EditResult(List(81) { 0 }, List(81) { 511 }, true, false)))
        runCurrent()

        assertEquals(5, controller.uiState.value.session?.entries?.first())
        assertEquals(List(81) { 0 }, controller.uiState.value.session?.notes)
        assertEquals(0L, controller.uiState.value.session?.assistance?.candidateCount)
        assertFalse(controller.uiState.value.notesPending)
    }

    @Test
    fun pauseSettlesMonotonicTimeAndBlocksLateHintAssistance() = runTest {
        val repository = ControllerRepository()
        val prepared = ControllerPrepared()
        val controller =
            GameController(ControllerEngine(prepared), repository, repository.reads, backgroundScope, "saved", {
            }, { testScheduler.currentTime })
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.resume()
        runCurrent()
        advanceTimeBy(1_250)
        controller.requestHint()
        runCurrent()
        controller.pause()
        runCurrent()
        prepared.hints.complete(EngineOutcome.Completed(dev.sudoku.app.model.HintResult.ReviewEntry(0)))
        runCurrent()

        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
        assertEquals(1_300L, controller.uiState.value.elapsedMs)
        assertEquals(0L, controller.uiState.value.session?.assistance?.hintCount)
    }

    @Test
    fun loadRejectsARevisionChangedDuringNativePreparation() = runTest {
        val repository = ControllerRepository()
        val gate = CompletableDeferred<Unit>()
        val prepared = ControllerPrepared()
        val controller = GameController(
            ControllerEngine(
                prepared,
                gate
            ),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        repository.records[0] = repository.records[0].copy(revision = 2)

        gate.complete(Unit)
        runCurrent()

        assertEquals(GamePhase.EMPTY, controller.uiState.value.phase)
        assertTrue(controller.uiState.value.error?.contains("保存版本已变化") == true)
        assertTrue(prepared.closed)
    }

    @Test
    fun explicitRetryRecoversLostOwnershipOnlyForTheSameSavedRevision() = runTest {
        val repository = ControllerRepository()
        val controller = GameController(
            ControllerEngine(),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.resume()
        runCurrent()
        repository.ownershipLost = true
        controller.selectCell(0)
        controller.enterDigit(5)
        runCurrent()
        assertTrue(controller.uiState.value.save.failure != null)

        controller.retrySave()
        runCurrent()

        assertEquals(2, repository.claimCalls)
        assertEquals(5, repository.records.single().session.entries[0])
        assertFalse(controller.uiState.value.save.dirty)
    }

    @Test
    fun retryPreservesUnsavedInputWhenAnotherEditorAdvancedTheSavedRevision() = runTest {
        val repository = ControllerRepository()
        val controller = GameController(
            ControllerEngine(),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.resume()
        runCurrent()
        repository.ownershipLost = true
        controller.selectCell(0)
        controller.enterDigit(5)
        runCurrent()
        repository.records[0] = repository.records[0].copy(revision = 2)

        controller.retrySave()
        runCurrent()

        assertEquals(1, repository.claimCalls)
        assertEquals(0, repository.records.single().session.entries[0])
        assertEquals(5, controller.uiState.value.session?.entries?.get(0))
        assertTrue(controller.uiState.value.save.dirty)
    }

    @Test
    fun practiceSetupAsksBeforeReplacingTheExistingLearningSave() = runTest {
        val repository = ControllerRepository()
        val prior = repository.records.single()
        repository.records[0] = prior.copy(
            session = prior.session.copy(
                mode = dev.sudoku.app.model.GameMode.LEARNING,
                metadata = SessionMetadata.Learning("prior-lesson")
            )
        )
        val launch = GameLaunch.Practice(
            "next-lesson",
            dev.sudoku.app.model.Variant.CLASSIC,
            Difficulty.EASY
        )
        val controller = GameController(
            ControllerEngine(),
            repository,
            repository.reads,
            backgroundScope,
            null,
            {},
            { testScheduler.currentTime }
        )

        controller.open(launch)
        runCurrent()

        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
        assertEquals("saved", controller.uiState.value.session?.id)
        assertEquals(launch, controller.uiState.value.practiceReplacement)
        controller.cancelPracticeReplacement()
        assertEquals(null, controller.uiState.value.practiceReplacement)
        assertEquals("saved", repository.records.single().session.id)
    }

    @Test
    fun pauseDuringGenerationCommitInstallsTheSavedSessionWithoutAutoResume() = runTest {
        val gate = CompletableDeferred<Unit>()
        val repository = ControllerRepository(gate)
        val generated = dev.sudoku.app.model.GeneratedPuzzle(
            repository.records.single().session.puzzle.copy(difficulty = Difficulty.MEDIUM, seed = "11".repeat(32)),
            null
        )
        val controller = GameController(
            ControllerEngine(generated = generated),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        val phases = mutableListOf<GamePhase>()
        backgroundScope.launch(start = CoroutineStart.UNDISPATCHED) {
            controller.uiState.collect { phases += it.phase }
        }
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.startNew(GameLaunch.Daily(dev.sudoku.app.model.Variant.CLASSIC, "2026-10-17"))
        runCurrent()
        assertTrue(repository.commitStarted.isCompleted)
        assertTrue(controller.uiState.value.preparationCommitting)

        controller.pause()
        runCurrent()
        assertEquals(GamePhase.PREPARING, controller.uiState.value.phase)
        assertTrue(controller.uiState.value.message?.contains("保存") == true)
        gate.complete(Unit)
        runCurrent()
        advanceTimeBy(1_000)
        runCurrent()

        assertEquals("daily:2026-10-17:formal", controller.uiState.value.session?.id)
        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
        assertFalse(controller.uiState.value.preparationCommitting)
        assertFalse(phases.contains(GamePhase.PLAYING))
        assertEquals(0L, controller.uiState.value.elapsedMs)
    }

    @Test
    fun leavingDuringGenerationCommitFlushesTheCommittedSessionWhileItRemainsPaused() = runTest {
        val gate = CompletableDeferred<Unit>()
        val repository = ControllerRepository(gate)
        val generated = dev.sudoku.app.model.GeneratedPuzzle(
            repository.records.single().session.puzzle.copy(difficulty = Difficulty.MEDIUM, seed = "11".repeat(32)),
            null
        )
        val controller = GameController(
            ControllerEngine(generated = generated),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        val phases = mutableListOf<GamePhase>()
        backgroundScope.launch(start = CoroutineStart.UNDISPATCHED) {
            controller.uiState.collect { phases += it.phase }
        }
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.startNew(GameLaunch.Daily(dev.sudoku.app.model.Variant.CLASSIC, "2026-10-17"))
        runCurrent()
        assertTrue(controller.uiState.value.preparationCommitting)

        val leaving = async { controller.leave() }
        runCurrent()
        assertFalse(leaving.isCompleted)
        gate.complete(Unit)
        runCurrent()

        assertTrue(leaving.await())
        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
        assertEquals("daily:2026-10-17:formal", controller.uiState.value.session?.id)
        assertFalse(controller.uiState.value.preparationCommitting)
        assertFalse(phases.contains(GamePhase.PLAYING))
        assertTrue(repository.records.any { it.session.id == "daily:2026-10-17:formal" })
    }

    @Test
    fun pauseDuringRestartCommitPreventsTheReplacementFromAutoResuming() = runTest {
        val gate = CompletableDeferred<Unit>()
        val repository = ControllerRepository(gate)
        val controller = GameController(
            ControllerEngine(),
            repository,
            repository.reads,
            backgroundScope,
            "saved",
            {},
            { testScheduler.currentTime }
        )
        val phases = mutableListOf<GamePhase>()
        backgroundScope.launch(start = CoroutineStart.UNDISPATCHED) {
            controller.uiState.collect { phases += it.phase }
        }
        controller.open(GameLaunch.Resume("saved"))
        runCurrent()
        controller.restart()
        runCurrent()
        assertTrue(repository.commitStarted.isCompleted)
        assertTrue(controller.uiState.value.preparationCommitting)

        controller.pause()
        gate.complete(Unit)
        runCurrent()

        assertEquals(GamePhase.PAUSED, controller.uiState.value.phase)
        assertTrue(controller.uiState.value.session?.id != "saved")
        assertFalse(controller.uiState.value.preparationCommitting)
        assertFalse(phases.contains(GamePhase.PLAYING))
    }
}

private class ControllerEngine(
    private val prepared: ControllerPrepared = ControllerPrepared(),
    private val prepareGate: CompletableDeferred<Unit>? = null,
    private val generated: dev.sudoku.app.model.GeneratedPuzzle? = null
) : SudokuEngine by unsupportedEngine() {
    override suspend fun deriveSeed(material: List<UByte>): EngineOutcome<List<UByte>> =
        EngineOutcome.Completed(List(32) { 1.toUByte() })

    override suspend fun generate(
        request: dev.sudoku.app.model.GenerationRequest
    ): EngineOutcome<dev.sudoku.app.model.GeneratedPuzzle> =
        EngineOutcome.Completed(generated ?: throw UnsupportedOperationException("No generation fixture"))

    override suspend fun prepare(rules: PuzzleRules): EngineOutcome<dev.sudoku.app.model.PreparedPuzzle> {
        prepareGate?.await()
        return EngineOutcome.Completed(prepared)
    }
}

private fun unsupportedEngine(): SudokuEngine = java.lang.reflect.Proxy.newProxyInstance(
    SudokuEngine::class.java.classLoader,
    arrayOf(SudokuEngine::class.java)
) { _, method, _ -> throw UnsupportedOperationException(method.name) } as SudokuEngine

private class ControllerPrepared : dev.sudoku.app.model.PreparedPuzzle {
    override val metadata =
        RuleMetadata(
            PuzzleRules.Classic,
            emptyList(),
            emptyList(),
            List(81) {
                emptyList()
            },
            List(81) { emptyList() },
            List(81) { emptyList() },
            List(81) { emptyList() }
        )
    val notes = CompletableDeferred<EngineOutcome<EditResult>>()
    val hints = CompletableDeferred<EngineOutcome<dev.sudoku.app.model.HintResult>>()
    override suspend fun edit(givens: List<Int>, layers: BoardLayers, action: BoardEdit): EngineOutcome<EditResult> =
        when (action) {
            BoardEdit.GenerateNotes -> notes.await()
            is BoardEdit.Enter -> EngineOutcome.Completed(
                EditResult(
                    List(81) {
                        if (it ==
                            0
                        ) {
                            5
                        } else {
                            0
                        }
                    },
                    layers.notes,
                    true,
                    false
                )
            )
            else -> throw UnsupportedOperationException()
        }
    override suspend fun candidates(board: List<Int>) = throw UnsupportedOperationException()
    override suspend fun conflicts(board: List<Int>) =
        EngineOutcome.Completed(emptyList<dev.sudoku.app.model.RuleViolation>())
    override suspend fun isComplete(board: List<Int>) = EngineOutcome.Completed(false)
    override suspend fun reviewEntries(board: List<Int>, solution: List<Int>) =
        EngineOutcome.Completed(emptyList<Int>())
    override suspend fun hint(board: List<Int>, solution: List<Int>) = hints.await()
    var closed = false
    override suspend fun close() {
        closed = true
    }
}

private class ControllerRepository(private val commitGate: CompletableDeferred<Unit>? = null) : GameRepository {
    override val datasetEpochs = kotlinx.coroutines.flow.MutableSharedFlow<Long>(replay = 1)
    val reads = object : dev.sudoku.app.model.GameReadRepository by (
        java.lang.reflect.Proxy.newProxyInstance(
            dev.sudoku.app.model.GameReadRepository::class.java.classLoader,
            arrayOf(dev.sudoku.app.model.GameReadRepository::class.java)
        ) { _, method, _ ->
            error("Unexpected controller query: ${method.name}")
        } as dev.sudoku.app.model.GameReadRepository
        ) {
        override suspend fun readSession(id: String) = StorageOutcome.Success(records.find { it.session.id == id })
        override suspend fun readResult(id: String) = StorageOutcome.Success<ResultRecord?>(null)
        override suspend fun readSlot(mode: dev.sudoku.app.model.GameMode, variant: dev.sudoku.app.model.Variant) =
            StorageOutcome.Success(records.singleOrNull { it.session.mode == mode })
    }
    val commitStarted = CompletableDeferred<Unit>()

    val records =
        mutableListOf(
            SessionRecord(
                revision = 1,
                session = createSession(
                    Puzzle(
                        List(81) { 0 },
                        List(81) {
                            it % 9 +
                                1
                        },
                        PuzzleRules.Classic,
                        Difficulty.EASY,
                        "00".repeat(32),
                        "sudoku-v11"
                    ),
                    SessionMetadata.Free,
                    "saved",
                    "2026-10-16T00:00:00.000Z"
                ).copy(elapsedMs = 50)
            )
        )
    private var generation = 0L
    var ownershipLost = false
    var claimCalls = 0

    override suspend fun claimEditor(sessionId: String, ownerId: String): StorageOutcome<EditorToken> {
        claimCalls += 1
        ownershipLost = false
        return StorageOutcome.Success(EditorToken(ownerId, sessionId, 0, ++generation))
    }
    override suspend fun releaseEditor(token: EditorToken) = StorageOutcome.Success(Unit)
    override suspend fun writeSession(
        session: GameSession,
        expectedRevision: Long,
        token: EditorToken
    ): StorageOutcome<SessionRecord> {
        if (ownershipLost) {
            return StorageOutcome.Failure(
                dev.sudoku.app.model.StorageFailure(
                    dev.sudoku.app.model.StorageFailureKind.OWNERSHIP_LOST,
                    "Editor changed"
                )
            )
        }
        if (session.id != "saved") {
            commitStarted.complete(Unit)
            commitGate?.await()
        }
        val record = SessionRecord(revision = expectedRevision + 1, session = session)
        records.removeAll { it.session.id == session.id }
        records += record
        return StorageOutcome.Success(record)
    }
    override suspend fun replaceActiveSession(
        session: GameSession,
        token: EditorToken,
        previous: PreviousSession?
    ): StorageOutcome<SessionRecord> {
        commitStarted.complete(Unit)
        commitGate?.await()
        val record = SessionRecord(revision = 1, session = session)
        records.removeAll { it.session.id == previous?.id }
        records += record
        return StorageOutcome.Success(record)
    }
    override suspend fun listSessions() = StorageOutcome.Success(records.toList())
    override suspend fun listResults() = StorageOutcome.Success(emptyList<ResultRecord>())
    override suspend fun readSettings() = StorageOutcome.Success(Settings())
    override suspend fun writeSettings(settings: Settings, expectedEpoch: Long) = StorageOutcome.Success(Unit)
    override suspend fun readLessonProgress() = StorageOutcome.Success(emptyList<LessonProgress>())
    override suspend fun writeLessonProgress(progress: LessonProgress, expectedEpoch: Long) =
        StorageOutcome.Success(Unit)
    override suspend fun readDatasetEpoch() = StorageOutcome.Success(0L)
    override suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport> =
        throw UnsupportedOperationException()
    override suspend fun previewBackup(text: String): StorageOutcome<BackupPreview> =
        throw UnsupportedOperationException()
    override suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit> =
        throw UnsupportedOperationException()
    override suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit> = throw UnsupportedOperationException()
    override suspend fun countQuarantined() = StorageOutcome.Success(0)
    override suspend fun removeQuarantined() = StorageOutcome.Success(Unit)
}
