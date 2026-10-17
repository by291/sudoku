package dev.sudoku.app.engine

import android.os.Build
import android.os.Debug
import android.os.SystemClock
import android.system.Os
import android.system.OsConstants
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.sudoku.app.ffi.BoardQueryDto
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.CandidateResultDto
import dev.sudoku.app.ffi.GenerationOptionsDto
import dev.sudoku.app.ffi.GenerationResultDto
import dev.sudoku.app.ffi.GenerationVersionDto
import dev.sudoku.app.ffi.NativeException
import dev.sudoku.app.ffi.PrepareInputDto
import dev.sudoku.app.ffi.PreparedCountInputDto
import dev.sudoku.app.ffi.SearchOptionsDto
import dev.sudoku.app.ffi.SearchResultDto
import dev.sudoku.app.ffi.WorkOptionsDto
import dev.sudoku.app.ffi.generate
import dev.sudoku.app.ffi.preparePuzzle
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GeneratedPuzzle
import dev.sudoku.app.model.GenerationRequest
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.Variant
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Run this class alone in a fresh instrumentation process to interpret the first call as cold load. */
@RunWith(AndroidJUnit4::class)
class NativeAndroidMetricsTest {
    private val measurements = JSONArray()
    private val json = Json { classDiscriminator = "kind" }

    @Test
    fun recordNativePerformanceWithoutChangingProductionAllowances() = runBlocking<Unit> {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.context
        val corpus = context.assets.open("native-metrics-corpus.json").bufferedReader().use {
            JSONObject(it.readText())
        }
        val report = JSONObject()
            .put("abi", Build.SUPPORTED_ABIS.first())
            .put("pageSizeBytes", Os.sysconf(OsConstants._SC_PAGESIZE))
            .put("fingerprint", Build.FINGERPRINT)
            .put("hardware", Build.HARDWARE)
            .put("generationDeadlineMs", 3_000)
            .put("analysisDeadlineMs", 15_000)
            .put("evidence", "Literal sealed TypeScript fixtures reused; never native-derived expected outputs")
            .put("coldInterpretation", "First engine call is cold only when this class runs alone in a fresh process")
            .put(
                "heapInterpretation",
                "Process-wide allocated native heap observation; no leak or retained-memory proof"
            )
            .put("deviceInterpretation", "Emulator observations do not establish physical-device acceptance")
        try {
            val engine = RustSudokuEngine()
            measure("firstNativeInformationCall") { completed(engine.information()) }
            repeat(5) { measure("warmNativeInformationCall:$it") { completed(engine.information()) } }
            val daily = completed(engine.deriveSeed("daily:2026-10-16".encodeToByteArray().map { it.toUByte() }))
            // Same independent JS BLAKE3 literal as sudoku/core/tests/random.rs; this is reused evidence.
            assertEquals(
                listOf(
                    192, 49, 10, 214, 144, 151, 78, 22, 90, 7, 85, 25, 27, 44, 188, 244,
                    236, 111, 36, 156, 67, 77, 166, 174, 12, 194, 22, 62, 194, 26, 8, 89
                ),
                daily.value.map { it.toInt() }
            )

            val cases = corpus.getJSONArray("cases")
            assertEquals(19, cases.length())
            for (index in 0 until cases.length()) {
                val row = cases.getJSONObject(index)
                val request = row.getJSONObject("input").request()
                repeat(2) { repetition ->
                    val response = measure("generation:${row.getString("id")}:$repetition") {
                        completed(engine.generate(request))
                    }
                    assertGeneration(row, response)
                    measurements.getJSONObject(measurements.length() - 1)
                        .put("workUsed", response.workUsed)
                        .put("sample", if (repetition == 0) "first seed invocation" else "warm same seed")
                }
            }
            arithmeticAndExhaustion(corpus)
            cancellationSamples(cases)
            queueDrain(engine, cases)
            repeatedHandleHeap(cases)
        } finally {
            report.put("measurements", measurements)
            val directory = instrumentation.targetContext.getExternalFilesDir(null)
                ?: instrumentation.targetContext.filesDir
            val output = File(directory, "sudoku-native-metrics.json")
            output.writeText(report.toString(2))
            for (index in 0 until measurements.length()) {
                Log.i(TAG, measurements.getJSONObject(index).toString())
            }
            Log.i(TAG, "report=${output.absolutePath}; abi=${Build.SUPPORTED_ABIS.first()}")
        }
    }

    private fun assertGeneration(row: JSONObject, response: EngineOutcome.Completed<GeneratedPuzzle>) {
        val expected = row.getJSONObject("expected")
        val expectedPuzzle = json.decodeFromString<Puzzle>(expected.getJSONObject("puzzle").toString())
        assertEquals(row.getString("id"), expectedPuzzle, response.value.puzzle)
        assertEquals(
            expected.getJSONObject("metrics").getLong("constructionWork"),
            response.workUsed
        )
    }

    private suspend fun arithmeticAndExhaustion(corpus: JSONObject) {
        val arithmetic = corpus.getJSONObject("arithmetic")
        val input = arithmetic.getJSONObject("input")
        val rules = json.decodeFromString<PuzzleRules>(input.getJSONObject("rules").toString())
        val token = CancellationToken()
        val prepared = preparePuzzle(PrepareInputDto(rules.native(), null), token)
        try {
            val result = measure("hardArithmeticCandidates:independentFixture") {
                prepared.candidates(
                    BoardQueryDto(
                        input.getJSONArray("board").integers().nativeBoard(),
                        WorkOptionsDto(input.getLong("limit").toUInt(), null)
                    ),
                    token
                )
            }
            val expected = arithmetic.getJSONObject("expected")
            when (val candidates = result.result) {
                is CandidateResultDto.Complete -> assertEquals(
                    expected.getJSONObject("candidates").getJSONArray("candidates").integers(),
                    candidates.candidates.map { it.toInt() }
                )
                CandidateResultDto.BudgetExhausted -> {
                    throw AssertionError("Independent candidate fixture must complete")
                }
            }
            assertEquals(expected.getLong("candidateWork"), result.workUsed.toLong())
            measurements.getJSONObject(measurements.length() - 1).put("workUsed", result.workUsed.toLong())
            repeat(25) { measure("ownedMetadataRoundTrip:$it") { prepared.metadata().player() } }
        } finally {
            prepared.close()
            token.close()
        }

        val near = corpus.getJSONObject("nearExhaustion")
        val nearInput = near.getJSONObject("input")
        val nearRules = json.decodeFromString<PuzzleRules>(nearInput.getJSONObject("rules").toString())
        val nearToken = CancellationToken()
        val nearPrepared = preparePuzzle(PrepareInputDto(nearRules.native(), null), nearToken)
        try {
            val response = measure("nearExhaustion:sealedCallerBudgetFixture") {
                nearPrepared.countSolutions(
                    PreparedCountInputDto(
                        nearInput.getJSONArray("board").integers().nativeBoard(),
                        SearchOptionsDto(
                            nearInput.getLong("workLimit").toUInt(),
                            nearInput.getLong("nodeLimit").toUInt(),
                            nearInput.getLong("initialWork").toUInt()
                        )
                    ),
                    nearToken
                )
            }
            val expected = near.getJSONObject("expected")
            assertEquals(expected.getLong("used"), response.workUsed.toLong())
            when (val result = response.result) {
                is SearchResultDto.BudgetExhausted -> {
                    assertEquals(expected.getJSONObject("result").getLong("nodesVisited"), result.nodesVisited.toLong())
                    assertEquals(expected.getJSONObject("result").getLong("workUsed"), result.workUsed.toLong())
                }
                is SearchResultDto.Complete -> throw AssertionError("Independent near-exhaustion fixture is incomplete")
            }
            measurements.getJSONObject(measurements.length() - 1)
                .put("workUsed", response.workUsed.toLong())
                .put("fixtureWorkLimit", nearInput.getLong("workLimit"))
                .put("allowanceInterpretation", "Existing explicit caller-budget fixture; production limits unchanged")
        } finally {
            nearPrepared.close()
            nearToken.close()
        }
    }

    private fun cancellationSamples(cases: JSONArray) {
        val row = mostExpensive(cases)
        val input = row.getJSONObject("input")
        val request = input.request()
        val version = if (request.variant == Variant.CLASSIC) {
            GenerationVersionDto.CLASSIC_V11
        } else {
            GenerationVersionDto.VARIANTS_V11
        }
        val options = GenerationOptionsDto(request.variant.native(), request.difficulty.native(), version, null)
        val executor = Executors.newSingleThreadExecutor()
        try {
            repeat(3) { sample ->
                val token = CancellationToken()
                val started = CountDownLatch(1)
                val future = executor.submit<JSONObject> {
                    started.countDown()
                    try {
                        val result = generate(request.seed.map { it.toByte() }.toByteArray(), options, token)
                        JSONObject().put(
                            "status",
                            when (result) {
                                is GenerationResultDto.Ready -> "completed-before-signal"
                                is GenerationResultDto.BudgetExhausted -> "exhausted-before-signal"
                                is GenerationResultDto.Failed -> "failed-before-signal"
                            }
                        )
                    } catch (cancelled: NativeException.Cancelled) {
                        JSONObject().put("status", "cancelled")
                            .put("workBeforeCancellation", cancelled.workUsed.toLong())
                    }
                }
                try {
                    assertTrue(started.await(5, TimeUnit.SECONDS))
                    Thread.sleep(5)
                    val signalledAt = SystemClock.elapsedRealtimeNanos()
                    token.cancel()
                    val result = future.get(15, TimeUnit.SECONDS)
                    val latency = (SystemClock.elapsedRealtimeNanos() - signalledAt) / NANOS_PER_MS
                    result.put("name", "nativeCheckpointCancellation:$sample")
                        .put("signalToNativeReturnMs", latency)
                        .put("fixtureId", row.getString("id"))
                        .put("within100msObserved", latency <= 100.0)
                        .put("sampleValid", result.optLong("workBeforeCancellation", 0) > 0)
                    measurements.put(result)
                } finally {
                    // Keep the token alive until its synchronous call actually returns.
                    if (!future.isDone) {
                        token.cancel()
                        future.get(15, TimeUnit.SECONDS)
                    }
                    token.close()
                }
            }
        } finally {
            executor.shutdown()
            assertTrue(executor.awaitTermination(15, TimeUnit.SECONDS))
        }
    }

    private suspend fun queueDrain(engine: RustSudokuEngine, cases: JSONArray) = coroutineScope {
        val request = mostExpensive(cases).getJSONObject("input").request()
        val first = async(Dispatchers.Default) { engine.generate(request) }
        val second = async(Dispatchers.Default) { engine.generate(request) }
        delay(5)
        val activeAtSignal = listOf(first, second).count { !it.isCompleted }
        val signalledAt = SystemClock.elapsedRealtimeNanos()
        first.cancelAndJoin()
        second.cancelAndJoin()
        val prepared = completed(engine.prepare(PuzzleRules.Classic))
        prepared.value.close()
        measurements.put(
            JSONObject().put("name", "boundedAnalysisQueueDrain")
                .put("facadeCoroutinesPendingAtSignal", activeAtSignal)
                .put("sampleInterpretation", "Includes queued calls; direct samples establish native checkpoints")
                .put("cancelToNextPreparedReturnMs", (SystemClock.elapsedRealtimeNanos() - signalledAt) / NANOS_PER_MS)
                .put("sampleValid", activeAtSignal == 2)
        )
    }

    private suspend fun repeatedHandleHeap(cases: JSONArray) {
        val rules = json.decodeFromString<Puzzle>(
            mostExpensive(cases).getJSONObject("expected").getJSONObject("puzzle").toString()
        ).rules
        val engine = RustSudokuEngine()
        val before = Debug.getNativeHeapAllocatedSize()
        measure("repeatedPreparedHandleClose:50") {
            repeat(50) {
                val prepared = completed(engine.prepare(rules)).value
                assertEquals(81, prepared.metadata.duplicatePeers.size)
                prepared.close()
            }
        }
        val after = Debug.getNativeHeapAllocatedSize()
        measurements.getJSONObject(measurements.length() - 1)
            .put("nativeHeapBeforeBytes", before)
            .put("nativeHeapAfterBytes", after)
            .put("nativeHeapDeltaBytes", after - before)
            .put("interpretation", "Observation includes all process native allocations; no leak-free claim")
    }

    private fun mostExpensive(cases: JSONArray): JSONObject = (0 until cases.length()).map {
        cases.getJSONObject(it)
    }.maxBy {
        it.getJSONObject("expected").getJSONObject("metrics").getLong("constructionWork")
    }

    private fun JSONObject.request(): GenerationRequest = GenerationRequest(
        Variant.entries.first { it.wireName == getString("variant") },
        Difficulty.entries.first { it.name.lowercase() == getString("difficulty") },
        getJSONArray("seed").integers().map { it.toUByte() }
    )

    private fun JSONArray.integers(): List<Int> = (0 until length()).map { getInt(it) }

    private fun <T> completed(outcome: EngineOutcome<T>): EngineOutcome.Completed<T> = when (outcome) {
        is EngineOutcome.Completed -> outcome
        else -> throw AssertionError("Native operation did not complete: $outcome")
    }

    private suspend fun <T> measure(name: String, action: suspend () -> T): T {
        val startedAt = SystemClock.elapsedRealtimeNanos()
        return try {
            action()
        } finally {
            measurements.put(
                JSONObject().put("name", name)
                    .put("durationMs", (SystemClock.elapsedRealtimeNanos() - startedAt) / NANOS_PER_MS)
            )
        }
    }

    companion object {
        private const val TAG = "SudokuNativeMetrics"
        private const val NANOS_PER_MS = 1_000_000.0
    }
}
