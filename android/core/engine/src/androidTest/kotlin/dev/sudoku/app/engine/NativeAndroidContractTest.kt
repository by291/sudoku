package dev.sudoku.app.engine

import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.NativeException
import dev.sudoku.app.ffi.PrepareInputDto
import dev.sudoku.app.ffi.RulesDto
import dev.sudoku.app.ffi.preparePuzzle
import dev.sudoku.app.model.ArrowClue
import dev.sudoku.app.model.AssessmentIssue
import dev.sudoku.app.model.AssessmentResult
import dev.sudoku.app.model.BoardEdit
import dev.sudoku.app.model.BoardLayers
import dev.sudoku.app.model.Cage
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EngineInformation
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GeneratedPuzzle
import dev.sudoku.app.model.GenerationRequest
import dev.sudoku.app.model.PreparedPuzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.RuleViolation
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.ViolationCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeAndroidContractTest {
    @Test
    fun packagedNativeAssessmentRetainsStructuredDuplicateFacts() = runBlocking<Unit> {
        val board = List(81) { cell -> if (cell == 0 || cell == 1) 1 else 0 }

        val response = RustSudokuEngine().assess(board, PuzzleRules.Classic)
        assertTrue(response is EngineOutcome.Completed)
        val result = (response as EngineOutcome.Completed<AssessmentResult>).value

        assertEquals(
            AssessmentResult.Invalid(
                listOf(
                    AssessmentIssue.Violation(RuleViolation("row:0", listOf(0, 1), ViolationCode.Duplicate)),
                    AssessmentIssue.Violation(RuleViolation("box:0", listOf(0, 1), ViolationCode.Duplicate))
                )
            ),
            result
        )
    }

    @Test
    fun packagedNativeLibraryLoadsAndOwnsSixPreparedVariants() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val information = (engine.information() as EngineOutcome.Completed<EngineInformation>).value
        assertEquals("3", information.bridgeVersion)
        assertEquals("sudoku-v12", information.puzzleVersion)
        val rules = listOf(
            PuzzleRules.Classic,
            PuzzleRules.Diagonal,
            PuzzleRules.Jigsaw(
                List(9) { box ->
                    List(9) { cell -> (box / 3 * 3 + cell / 3) * 9 + box % 3 * 3 + cell % 3 }
                }
            ),
            PuzzleRules.Killer(
                List(81) { cell ->
                    Cage(
                        listOf(cell),
                        (cell / 9 * 3 + cell / 9 / 3 + cell % 9) % 9 + 1
                    )
                }
            ),
            PuzzleRules.Thermo(listOf(listOf(0, 1, 2))),
            PuzzleRules.Arrow(listOf(ArrowClue(2, listOf(1, 0))))
        )
        repeat(3) {
            for (rule in rules) {
                val prepared = (engine.prepare(rule) as EngineOutcome.Completed<PreparedPuzzle>).value
                assertEquals(81, prepared.metadata.duplicatePeers.size)
                val result = prepared.edit(
                    List(81) { 0 },
                    BoardLayers(
                        List(81) { 0 },
                        List(81) { 0 }
                    ),
                    BoardEdit.Enter(
                        0,
                        1
                    )
                )
                assertTrue(result is EngineOutcome.Completed)
                prepared.close()
                assertTrue(prepared.isComplete(List(81) { 0 }) is EngineOutcome.Failed)
            }
        }
    }

    @Test
    fun generationRetainsIndependentLiteralGivensAndWork() = runBlocking<Unit> {
        val seedHex = "1c20bea0d54b250248cb31eabd82f1fb9000f1f15f6cfb457c76340f024503e6"
        val seed = seedHex.chunked(2).map { it.toInt(16).toUByte() }
        val response = RustSudokuEngine().generate(
            GenerationRequest(
                Variant.CLASSIC,
                Difficulty.EASY,
                seed
            )
        ) as EngineOutcome.Completed<GeneratedPuzzle>
        // Literal source: sealed generation-v11-full.jsonl.gz, full:0; reused independent evidence.
        val expected = listOf(
            0,
            0,
            0,
            0,
            4,
            0,
            7,
            9,
            0,
            0,
            4,
            0,
            2,
            0,
            0,
            8,
            5,
            0,
            9,
            8,
            0,
            7,
            0,
            6,
            2,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            4,
            0,
            0,
            7,
            3,
            4,
            0,
            8,
            1,
            0,
            6,
            0,
            2,
            0,
            9,
            5,
            0,
            0,
            3,
            0,
            0,
            4,
            0,
            2,
            0,
            1,
            0,
            9,
            0,
            8,
            1,
            0,
            0,
            8,
            7,
            0,
            0,
            0,
            0,
            8,
            7,
            6,
            4,
            0,
            0,
            0,
            0,
            3
        )
        assertEquals(expected, response.value.puzzle.givens)
        assertEquals(seedHex, response.value.puzzle.seed)
    }

    @Test
    fun independentCancellationPreventsPreparation() {
        val token = CancellationToken()
        try {
            token.cancel()
            try {
                preparePuzzle(PrepareInputDto(RulesDto.Classic), token)
                throw AssertionError("Cancelled preparation must not succeed")
            } catch (expected: NativeException.Cancelled) {
                assertTrue(token.isCancelled())
            }
        } finally {
            token.close()
        }
    }
}
