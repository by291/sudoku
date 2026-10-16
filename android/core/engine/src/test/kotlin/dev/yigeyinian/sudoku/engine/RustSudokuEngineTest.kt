package dev.yigeyinian.sudoku.engine

import dev.yigeyinian.sudoku.model.BoardEdit
import dev.yigeyinian.sudoku.model.BoardLayers
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.PuzzleRules
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlinx.coroutines.runBlocking

class RustSudokuEngineTest {
    @Test
    fun actualNativeLibraryReportsVersionsAndRejectsMalformedBoards() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val information = assertIs<EngineOutcome.Completed<*>>(engine.information()).value
        assertEquals("sudoku-v11", (information as dev.yigeyinian.sudoku.model.EngineInformation).puzzleVersion)
        val prepared = assertIs<EngineOutcome.Completed<dev.yigeyinian.sudoku.model.PreparedPuzzle>>(
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
        val prepared = assertIs<EngineOutcome.Completed<dev.yigeyinian.sudoku.model.PreparedPuzzle>>(
            engine.prepare(PuzzleRules.Classic)
        ).value
        val layers = BoardLayers(List(81) { 0 }, List(81) { 0 })

        val changed = assertIs<EngineOutcome.Completed<dev.yigeyinian.sudoku.model.EditResult>>(
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
        val workload = dev.yigeyinian.sudoku.model.AssessmentWorkload(
            0,
            0,
            0,
            0,
            emptyMap(),
            null,
            null,
            0
        )
        val summary = dev.yigeyinian.sudoku.model.AssessmentSummary(
            "sudoku-rating-v2",
            dev.yigeyinian.sudoku.model.Variant.CLASSIC,
            dev.yigeyinian.sudoku.model.Difficulty.EASY,
            workload
        )
        val malformed = listOf(
            dev.yigeyinian.sudoku.model.PuzzleAssessment.Rated(
                summary.copy(workload = workload.copy(steps = 4_294_967_296L))
            ),
            dev.yigeyinian.sudoku.model.PuzzleAssessment.Rated(
                summary.copy(workload = workload.copy(techniqueCounts = mapOf("unknown-technique" to 1L)))
            ),
            dev.yigeyinian.sudoku.model.PuzzleAssessment.Unavailable("unknown-reason", emptyList())
        )

        for (value in malformed) {
            val result = engine.validateAssessment(
                value,
                dev.yigeyinian.sudoku.model.Variant.CLASSIC,
                dev.yigeyinian.sudoku.model.Difficulty.EASY
            )
            val completed = assertIs<EngineOutcome.Completed<dev.yigeyinian.sudoku.model.PuzzleAssessment?>>(result)
            val unavailable = assertIs<dev.yigeyinian.sudoku.model.PuzzleAssessment.Unavailable>(completed.value)
            assertEquals("invalid-summary", unavailable.reason)
        }
    }
}

class NativeCancellationTest {
    @Test
    fun independentTokenStopsAnExecutingNativeGeneration() {
        val token = dev.yigeyinian.sudoku.ffi.CancellationToken()
        val started = java.util.concurrent.CountDownLatch(1)
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            val future = executor.submit<dev.yigeyinian.sudoku.ffi.GenerationResultDto> {
                started.countDown()
                dev.yigeyinian.sudoku.ffi.generate(
                    ByteArray(32) { 42 },
                    dev.yigeyinian.sudoku.ffi.GenerationOptionsDto(
                        dev.yigeyinian.sudoku.ffi.VariantDto.KILLER,
                        dev.yigeyinian.sudoku.ffi.DifficultyDto.HARD,
                        dev.yigeyinian.sudoku.ffi.GenerationVersionDto.VARIANTS_V11,
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
            assertIs<dev.yigeyinian.sudoku.ffi.NativeException.Cancelled>(error.cause)
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
            dev.yigeyinian.sudoku.model.GenerationRequest(
                dev.yigeyinian.sudoku.model.Variant.KILLER,
                dev.yigeyinian.sudoku.model.Difficulty.HARD,
                List(32) { 42.toUByte() }
            )
        )

        assertIs<EngineOutcome.TimedOut>(result)
        val prepared = assertIs<EngineOutcome.Completed<dev.yigeyinian.sudoku.model.PreparedPuzzle>>(
            engine.prepare(PuzzleRules.Classic)
        ).value
        prepared.close()
    }
}
