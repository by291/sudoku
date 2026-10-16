package dev.yigeyinian.sudoku.engine

import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.yigeyinian.sudoku.ffi.CancellationToken
import dev.yigeyinian.sudoku.ffi.NativeException
import dev.yigeyinian.sudoku.ffi.PrepareInputDto
import dev.yigeyinian.sudoku.ffi.RulesDto
import dev.yigeyinian.sudoku.ffi.preparePuzzle
import dev.yigeyinian.sudoku.model.ArrowClue
import dev.yigeyinian.sudoku.model.BoardEdit
import dev.yigeyinian.sudoku.model.BoardLayers
import dev.yigeyinian.sudoku.model.Cage
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.EngineInformation
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GeneratedPuzzle
import dev.yigeyinian.sudoku.model.GenerationRequest
import dev.yigeyinian.sudoku.model.PreparedPuzzle
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.Variant
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeAndroidContractTest {
    @Test
    fun packagedNativeLibraryLoadsAndOwnsSixPreparedVariants() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val information = (engine.information() as EngineOutcome.Completed<EngineInformation>).value
        assertEquals("1", information.bridgeVersion)
        assertEquals("sudoku-v11", information.puzzleVersion)
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
        assertEquals(7216L, response.workUsed)
        assertEquals(seedHex, response.value.puzzle.seed)
    }

    @Test
    fun independentCancellationRemainsDistinctFromExhaustion() {
        val token = CancellationToken()
        try {
            token.cancel()
            try {
                preparePuzzle(PrepareInputDto(RulesDto.Classic, 0u), token)
                throw AssertionError("Cancelled preparation must not succeed")
            } catch (expected: NativeException.Cancelled) {
                assertEquals(0UL, expected.workUsed)
            }
        } finally {
            token.close()
        }
    }
}
