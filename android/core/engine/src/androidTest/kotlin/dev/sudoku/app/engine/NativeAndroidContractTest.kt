package dev.sudoku.app.engine

import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.sudoku.app.ffi.BoardQueryDto
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.CandidateResultDto
import dev.sudoku.app.ffi.NativeException
import dev.sudoku.app.ffi.PrepareInputDto
import dev.sudoku.app.ffi.PreparedCountInputDto
import dev.sudoku.app.ffi.RulesDto
import dev.sudoku.app.ffi.SearchOptionsDto
import dev.sudoku.app.ffi.SearchResultDto
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
import dev.sudoku.app.model.Validation
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.ViolationCode
import dev.sudoku.app.model.content
import dev.sudoku.app.model.variant
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

private const val HISTORICAL_CLASSIC_CASE = "full:0"
private const val HISTORICAL_KILLER_CASE = "full:640"

/** Exercises the native contract through the packaged Android bridge. */
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
                    AssessmentIssue.Violation(
                        RuleViolation("row:0", listOf(0, 1), ViolationCode.Duplicate)
                    ),
                    AssessmentIssue.Violation(
                        RuleViolation("box:0", listOf(0, 1), ViolationCode.Duplicate)
                    )
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
                val prepared = (
                    engine.prepare(
                        rule
                    ) as EngineOutcome.Completed<PreparedPuzzle>
                    ).value
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

    /** Checks all bytes of the daily seed against the independent BLAKE3 fixture. */
    @Test
    fun packagedSeedMatchesIndependentDailyDigest() = runBlocking<Unit> {
        val material = "daily:2026-10-16".encodeToByteArray().map { it.toUByte() }
        // Reuses the independent JavaScript BLAKE3 literal in sudoku/core/tests/random.rs.
        val expected = listOf(
            192,
            49,
            10,
            214,
            144,
            151,
            78,
            22,
            90,
            7,
            85,
            25,
            27,
            44,
            188,
            244,
            236,
            111,
            36,
            156,
            67,
            77,
            166,
            174,
            12,
            194,
            22,
            62,
            194,
            26,
            8,
            89
        )

        val response = RustSudokuEngine().deriveSeed(material) as EngineOutcome.Completed

        assertEquals(expected, response.value.map { it.toInt() })
    }

    /** Checks that arithmetic support crosses UniFFI with all sealed candidate masks intact. */
    @Test
    fun packagedArithmeticCandidatesMatchTheSealedBoard() = runBlocking<Unit> {
        val arithmetic = loadNativeDeviceCorpus().getJSONObject("arithmetic")
        val fixture = arithmetic.nativeBoardFixture()
        val expectedCandidates = arithmetic.getJSONObject("expected").getJSONObject("candidates")
        val expectedMasks = expectedCandidates.getJSONArray("candidates").integers()

        val result = fixture.withPrepared { prepared, token ->
            prepared.candidates(BoardQueryDto(fixture.board), token).result
        }

        assertTrue(
            "Sealed arithmetic board must complete, received $result",
            result is CandidateResultDto.Complete
        )
        val masks = (result as CandidateResultDto.Complete).candidates.map { it.toInt() }
        assertEquals(expectedMasks, masks)
    }

    /** Checks that a zero-node search returns a typed incomplete result through UniFFI. */
    @Test
    fun packagedZeroNodeSearchRemainsIncomplete() = runBlocking<Unit> {
        val nearExhaustion = loadNativeDeviceCorpus().getJSONObject("nearExhaustion")
        val fixture = nearExhaustion.nativeBoardFixture()
        val input = PreparedCountInputDto(fixture.board, SearchOptionsDto(nodeLimit = 0u))

        val result = fixture.withPrepared { prepared, token ->
            prepared.countSolutions(input, token).result
        }

        assertEquals(SearchResultDto.Incomplete(nodesVisited = 0u), result)
    }

    /** Checks that sealed Classic and Killer puzzles remain valid after bridge upgrades. */
    @Test
    fun packagedValidationAcceptsHistoricalClassicAndKillerPuzzles() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val cases = loadNativeDeviceCorpus().getJSONArray("cases")

        for (id in listOf(HISTORICAL_CLASSIC_CASE, HISTORICAL_KILLER_CASE)) {
            val historical = cases.caseById(id).historicalPuzzle()
            val result = engine.validatePuzzle(historical.content())

            assertEquals(id, EngineOutcome.Completed(Validation.Valid), result)
        }
    }

    /** Checks packaged Killer generation identity and validation from one sealed request seed. */
    @Test
    fun packagedVariantGenerationReturnsAPlayableKillerPuzzle() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val cases = loadNativeDeviceCorpus().getJSONArray("cases")
        val row = cases.caseById(HISTORICAL_KILLER_CASE)
        val expectedSeed = row.historicalPuzzle().seed

        val response = engine.generate(row.generationRequest()) as EngineOutcome.Completed
        val generated = response.value.puzzle

        assertEquals(expectedSeed, generated.seed)
        assertEquals("sudoku-variants-v12", generated.puzzleVersion)
        assertEquals(Variant.KILLER, generated.rules.variant)
        assertEquals(Difficulty.EASY, generated.difficulty)
        assertEquals(
            EngineOutcome.Completed(Validation.Valid),
            engine.validatePuzzle(generated.content())
        )
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
