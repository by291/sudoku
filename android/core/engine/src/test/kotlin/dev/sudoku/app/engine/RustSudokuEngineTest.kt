package dev.sudoku.app.engine

import dev.sudoku.app.model.BoardEdit
import dev.sudoku.app.model.BoardLayers
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.PuzzleRules
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlinx.coroutines.runBlocking

class RustSudokuEngineTest {
    @Test
    fun actualNativeLibraryReportsVersionsAndRejectsMalformedBoards() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val information = assertIs<EngineOutcome.Completed<*>>(engine.information()).value
        assertEquals("sudoku-v11", (information as dev.sudoku.app.model.EngineInformation).puzzleVersion)
        val prepared = assertIs<EngineOutcome.Completed<dev.sudoku.app.model.PreparedPuzzle>>(
            engine.prepare(PuzzleRules.Classic)
        ).value

        assertIs<EngineOutcome.Failed>(prepared.isComplete(List(80) { 0 }))
        assertEquals(20, prepared.metadata.duplicatePeers[0].size)
        prepared.close()
        assertIs<EngineOutcome.Failed>(prepared.isComplete(List(81) { 0 }))
    }

    @Test
    fun nativeEditingOwnsTheSnapshotAndReturnsAllCandidateMasks() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val prepared = assertIs<EngineOutcome.Completed<dev.sudoku.app.model.PreparedPuzzle>>(
            engine.prepare(PuzzleRules.Classic)
        ).value
        val layers = BoardLayers(List(81) { 0 }, List(81) { 0 })

        val changed = assertIs<EngineOutcome.Completed<dev.sudoku.app.model.EditResult>>(
            prepared.edit(
                List(81) {
                    0
                },
                layers,
                BoardEdit.Enter(0, 5)
            )
        ).value
        val candidates = assertIs<EngineOutcome.Completed<List<Int>>>(prepared.candidates(changed.entries)).value

        assertEquals(5, changed.entries[0])
        assertEquals(0, layers.entries[0])
        assertEquals(0, candidates[0])
        assertEquals(511 - 16, candidates[1])
        prepared.close()
    }

    @Test
    fun malformedOptionalMetadataDowngradesThroughRustWithoutBlockingPlayableData() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val workload = dev.sudoku.app.model.AssessmentWorkload(
            0,
            0,
            0,
            0,
            emptyMap(),
            null,
            null,
            0
        )
        val summary = dev.sudoku.app.model.AssessmentSummary(
            "sudoku-rating-v2",
            dev.sudoku.app.model.Variant.CLASSIC,
            dev.sudoku.app.model.Difficulty.EASY,
            workload
        )
        val malformed = listOf(
            dev.sudoku.app.model.PuzzleAssessment.Rated(
                summary.copy(workload = workload.copy(steps = 4_294_967_296L))
            ),
            dev.sudoku.app.model.PuzzleAssessment.Rated(
                summary.copy(workload = workload.copy(techniqueCounts = mapOf("unknown-technique" to 1L)))
            ),
            dev.sudoku.app.model.PuzzleAssessment.Unavailable("unknown-reason", emptyList())
        )

        for (value in malformed) {
            val result = engine.validateAssessment(
                value,
                dev.sudoku.app.model.Variant.CLASSIC,
                dev.sudoku.app.model.Difficulty.EASY
            )
            val completed = assertIs<EngineOutcome.Completed<dev.sudoku.app.model.PuzzleAssessment?>>(result)
            val unavailable = assertIs<dev.sudoku.app.model.PuzzleAssessment.Unavailable>(completed.value)
            assertEquals("invalid-summary", unavailable.reason)
        }
    }
}

class NativeCancellationTest {
    @Test
    fun independentTokenStopsAnExecutingNativeGeneration() {
        val token = dev.sudoku.app.ffi.CancellationToken()
        val started = java.util.concurrent.CountDownLatch(1)
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            val future = executor.submit<dev.sudoku.app.ffi.GenerationResultDto> {
                started.countDown()
                dev.sudoku.app.ffi.generate(
                    ByteArray(32) { 42 },
                    dev.sudoku.app.ffi.GenerationOptionsDto(
                        dev.sudoku.app.ffi.VariantDto.KILLER,
                        dev.sudoku.app.ffi.DifficultyDto.HARD,
                        dev.sudoku.app.ffi.GenerationVersionDto.VARIANTS_V11,
                        null
                    ),
                    token
                )
            }
            check(started.await(5, java.util.concurrent.TimeUnit.SECONDS))
            Thread.sleep(10)
            token.cancel()

            val error = kotlin.test.assertFailsWith<java.util.concurrent.ExecutionException> {
                future.get(5, java.util.concurrent.TimeUnit.SECONDS)
            }
            assertIs<dev.sudoku.app.ffi.NativeException.Cancelled>(error.cause)
        } finally {
            executor.shutdown()
            check(executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS))
            token.close()
        }
    }

    @Test
    fun generationDeadlineIsDistinctAndTheLaneDrains() = runBlocking<Unit> {
        val engine = RustSudokuEngine(NativeExecutionLimits(generationDeadlineMs = 1))
        assertIs<EngineOutcome.Completed<*>>(engine.information())
        val result = engine.generate(
            dev.sudoku.app.model.GenerationRequest(
                dev.sudoku.app.model.Variant.KILLER,
                dev.sudoku.app.model.Difficulty.HARD,
                List(32) { 42.toUByte() }
            )
        )

        assertIs<EngineOutcome.TimedOut>(result)
        val prepared = assertIs<EngineOutcome.Completed<dev.sudoku.app.model.PreparedPuzzle>>(
            engine.prepare(PuzzleRules.Classic)
        ).value
        prepared.close()
    }
}
