package dev.sudoku.app.engine

import androidx.test.platform.app.InstrumentationRegistry
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.PrepareInputDto
import dev.sudoku.app.ffi.PreparedPuzzle
import dev.sudoku.app.ffi.preparePuzzle
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GenerationRequest
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.Variant
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject

private val fixtureJson = Json { classDiscriminator = "kind" }

internal class NativeBoardFixture(private val rules: PuzzleRules, val board: ByteArray) {
    /** Keeps the token and native preparation alive through the supplied operation. */
    suspend fun <Result> withPrepared(
        operation: suspend (PreparedPuzzle, CancellationToken) -> Result
    ): Result = CancellationToken().use { token ->
        preparePuzzle(PrepareInputDto(rules.native()), token).use { prepared ->
            operation(prepared, token)
        }
    }
}

/** Reads the sealed evidence shared by packaged-device tests and metrics. */
internal fun loadNativeDeviceCorpus(): JSONObject {
    val assets = InstrumentationRegistry.getInstrumentation().context.assets

    return assets.open("native-metrics-corpus.json").bufferedReader().use { reader ->
        JSONObject(reader.readText())
    }
}

internal fun JSONArray.caseById(id: String): JSONObject {
    for (index in 0 until length()) {
        val row = getJSONObject(index)
        if (row.getString("id") == id) {
            return row
        }
    }

    error("Missing native device fixture: $id")
}

internal fun JSONObject.historicalPuzzle(): Puzzle {
    val puzzle = getJSONObject("expected").getJSONObject("puzzle")

    return fixtureJson.decodeFromString<Puzzle>(puzzle.toString())
}

internal fun JSONObject.generationRequest(): GenerationRequest {
    val input = getJSONObject("input")
    val variant = input.getString("variant")
    val difficulty = input.getString("difficulty")
    val seed = input.getJSONArray("seed").integers()

    return GenerationRequest(
        variant = Variant.entries.first { it.wireName == variant },
        difficulty = Difficulty.entries.first { it.name.lowercase() == difficulty },
        seed = seed.map { it.toUByte() }
    )
}

internal fun JSONObject.nativeBoardFixture(): NativeBoardFixture {
    val input = getJSONObject("input")
    val rules = fixtureJson.decodeFromString<PuzzleRules>(input.getJSONObject("rules").toString())
    val board = input.getJSONArray("board").integers()

    return NativeBoardFixture(rules, board.nativeBoard())
}

internal fun JSONArray.integers(): List<Int> = (0 until length()).map { getInt(it) }
