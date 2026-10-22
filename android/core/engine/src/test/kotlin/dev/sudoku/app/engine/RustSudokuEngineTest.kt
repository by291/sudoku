package dev.sudoku.app.engine

import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.DifficultyDto
import dev.sudoku.app.ffi.GenerationOptionsDto
import dev.sudoku.app.ffi.GenerationResultDto
import dev.sudoku.app.ffi.GenerationVersionDto
import dev.sudoku.app.ffi.NativeException
import dev.sudoku.app.ffi.VariantDto
import dev.sudoku.app.model.ArrowClue
import dev.sudoku.app.model.AssessmentIssue
import dev.sudoku.app.model.AssessmentResult
import dev.sudoku.app.model.AssessmentSummary
import dev.sudoku.app.model.AssessmentWorkload
import dev.sudoku.app.model.BoardEdit
import dev.sudoku.app.model.BoardLayers
import dev.sudoku.app.model.Cage
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EditResult
import dev.sudoku.app.model.EngineInformation
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GenerationRequest
import dev.sudoku.app.model.PreparedPuzzle
import dev.sudoku.app.model.PuzzleAssessment
import dev.sudoku.app.model.PuzzleContent
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.RuleViolation
import dev.sudoku.app.model.Validation
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.ViolationCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlinx.coroutines.runBlocking

class RustSudokuEngineTest {
    @Test
    fun invalidJigsawAndOutOfRangeBoardRemainConclusiveValidationFailures() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val solved = List(81) { (it / 9 * 3 + it / 27 + it % 9) % 9 + 1 }
        val invalidInputs = listOf(
            PuzzleContent(
                List(81) {
                    0
                },
                solved,
                PuzzleRules.Jigsaw(List(9) { List(9) { 0 } }),
                Difficulty.EASY
            ),
            PuzzleContent(
                List(81) {
                    10
                },
                solved,
                PuzzleRules.Classic,
                Difficulty.EASY
            )
        )

        for (input in invalidInputs) {
            val outcome = engine.validatePuzzle(input)

            assertIs<EngineOutcome.Completed<Validation>>(outcome).also {
                assertIs<Validation.Invalid>(it.value)
            }
        }
    }

    @Test
    fun historicalUnavailableStringsRemainUnchanged() = runBlocking<Unit> {
        for (reason in listOf("invalid-input", "budget-exhausted", "incomplete")) {
            val value = PuzzleAssessment.Unavailable(reason, listOf("原始历史文本", "  keep whitespace  "))

            val response = RustSudokuEngine().validateAssessment(value, Variant.CLASSIC, Difficulty.EASY)

            assertEquals(value, assertIs<EngineOutcome.Completed<PuzzleAssessment?>>(response).value)
        }
    }

    @Test
    fun immediatelyPreviousNativeBridgeIsRejected() {
        val current = dev.sudoku.app.ffi.engineInfo()

        assertEquals(3u, compatibleInformation(current).bridgeVersion)
        assertFailsWith<IllegalStateException> {
            compatibleInformation(current.copy(bridgeVersion = 2u))
        }
    }

    @Test
    fun actualAssessmentRetainsTypedClueFactsAndCellOrdering() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val duplicate = List(81) { cell -> if (cell == 0 || cell == 1) 1 else 0 }
        val cages = listOf(Cage(listOf(1, 0), 3)) + (2..80).map { Cage(listOf(it), 1) }
        val cases = listOf(
            Triple(PuzzleRules.Classic, duplicate, RuleViolation("row:0", listOf(0, 1), ViolationCode.Duplicate)),
            Triple(
                PuzzleRules.Killer(cages),
                List(81) { cell ->
                    when (cell) {
                        0 -> 8
                        1 -> 9
                        else -> 0
                    }
                },
                RuleViolation("cage:0", listOf(1, 0), ViolationCode.CageTotal(0, 3))
            ),
            Triple(
                PuzzleRules.Thermo(listOf(listOf(10, 1, 0))),
                List(81) { cell ->
                    when (cell) {
                        10 -> 3
                        1 -> 2
                        0 -> 1
                        else -> 0
                    }
                },
                RuleViolation("thermo:0", listOf(10, 1, 0), ViolationCode.ThermoOrder(0))
            ),
            Triple(
                PuzzleRules.Arrow(listOf(ArrowClue(10, listOf(1, 0)))),
                List(81) { cell ->
                    when (cell) {
                        10 -> 5
                        1 -> 2
                        0 -> 1
                        else -> 0
                    }
                },
                RuleViolation("arrow:0", listOf(10, 1, 0), ViolationCode.ArrowTotal(0))
            )
        )

        for ((rules, board, violation) in cases) {
            val outcome = assertIs<EngineOutcome.Completed<AssessmentResult>>(engine.assess(board, rules))
            val invalid = assertIs<AssessmentResult.Invalid>(outcome.value)

            kotlin.test.assertTrue(AssessmentIssue.Violation(violation) in invalid.issues)
        }
    }

    @Test
    fun actualNativeLibraryReportsVersionsAndRejectsMalformedBoards() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val information = assertIs<EngineOutcome.Completed<*>>(engine.information()).value
        assertEquals("sudoku-v12", (information as EngineInformation).puzzleVersion)
        val prepared = assertIs<EngineOutcome.Completed<PreparedPuzzle>>(
            engine.prepare(PuzzleRules.Classic)
        ).value

        assertIs<EngineOutcome.InvalidInput>(prepared.isComplete(List(80) { 0 }))
        assertEquals(20, prepared.metadata.duplicatePeers[0].size)
        prepared.close()
        assertIs<EngineOutcome.Failed>(prepared.isComplete(List(81) { 0 }))
    }

    @Test
    fun nativeEditingOwnsTheSnapshotAndReturnsAllCandidateMasks() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val prepared = assertIs<EngineOutcome.Completed<PreparedPuzzle>>(
            engine.prepare(PuzzleRules.Classic)
        ).value
        val layers = BoardLayers(List(81) { 0 }, List(81) { 0 })

        val changed = assertIs<EngineOutcome.Completed<EditResult>>(
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
        val workload = AssessmentWorkload(
            0,
            0,
            0,
            0,
            emptyMap(),
            null,
            null,
            0
        )
        val summary = AssessmentSummary(
            "sudoku-rating-v2",
            Variant.CLASSIC,
            Difficulty.EASY,
            workload
        )
        val malformed = listOf(
            PuzzleAssessment.Rated(
                summary.copy(workload = workload.copy(steps = 4_294_967_296L))
            ),
            PuzzleAssessment.Rated(
                summary.copy(workload = workload.copy(techniqueCounts = mapOf("unknown-technique" to 1L)))
            ),
            PuzzleAssessment.Unavailable("unknown-reason", emptyList())
        )

        for (value in malformed) {
            val result = engine.validateAssessment(
                value,
                Variant.CLASSIC,
                Difficulty.EASY
            )
            val completed = assertIs<EngineOutcome.Completed<PuzzleAssessment?>>(result)
            val unavailable = assertIs<PuzzleAssessment.Unavailable>(completed.value)
            assertEquals("invalid-summary", unavailable.reason)
        }
    }
}

class NativeCancellationTest {
    @Test
    fun independentTokenStopsAnExecutingNativeGeneration() {
        val token = CancellationToken()
        val started = java.util.concurrent.CountDownLatch(1)
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            val future = executor.submit<GenerationResultDto> {
                started.countDown()
                dev.sudoku.app.ffi.generate(
                    ByteArray(32) { 42 },
                    GenerationOptionsDto(
                        VariantDto.KILLER,
                        DifficultyDto.HARD,
                        GenerationVersionDto.VARIANTS_V12,
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
            assertIs<NativeException.Cancelled>(error.cause)
        } finally {
            executor.shutdown()
            check(executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS))
            token.close()
        }
    }

    @Test
    fun requestDeadlineIsDistinctAndTheLaneDrains() = runBlocking<Unit> {
        val engine = RustSudokuEngine(NativeExecutionLimits(requestDeadlineMs = 1))
        assertIs<EngineOutcome.Completed<*>>(RustSudokuEngine().information())
        val result = engine.generate(
            GenerationRequest(
                Variant.KILLER,
                Difficulty.HARD,
                List(32) { 42.toUByte() }
            )
        )

        assertIs<EngineOutcome.TimedOut>(result)
        val prepared = assertIs<EngineOutcome.Completed<PreparedPuzzle>>(
            RustSudokuEngine().prepare(PuzzleRules.Classic)
        ).value
        prepared.close()
    }
}
