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
import dev.sudoku.app.ffi.PreparedCountInputDto
import dev.sudoku.app.ffi.SearchOptionsDto
import dev.sudoku.app.ffi.SearchResultDto
import dev.sudoku.app.ffi.generate
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.Validation
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.content
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
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Run this class alone in a fresh instrumentation process to interpret the first call as cold load.
 */
@RunWith(AndroidJUnit4::class)
class NativeAndroidMetricsTest {
    private val measurements = JSONArray()

    /** Records device observations when the caller explicitly enables metrics. */
    @Test
    fun recordNativePerformanceWithoutChangingProductionAllowances() = runBlocking<Unit> {
        val arguments = InstrumentationRegistry.getArguments()
        val isEnabled = arguments.getString("runNativeMetrics") == "true"
        assumeTrue("Set runNativeMetrics=true to collect device measurements", isEnabled)

        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val corpus = loadNativeDeviceCorpus()
        val report = JSONObject()
            .put("abi", Build.SUPPORTED_ABIS.first())
            .put("pageSizeBytes", Os.sysconf(OsConstants._SC_PAGESIZE))
            .put("fingerprint", Build.FINGERPRINT)
            .put("hardware", Build.HARDWARE)
            .put("requestDeadlineMs", 3_000)
            .put(
                "evidence",
                "Historical sealed puzzles validate compatibility; repeated generation checks determinism only"
            )
            .put(
                "coldInterpretation",
                "First engine call is cold only when this class runs alone in a fresh process"
            )
            .put(
                "heapInterpretation",
                "Process-wide allocated native heap observation; no leak or retained-memory proof"
            )
            .put(
                "deviceInterpretation",
                "Emulator observations do not establish physical-device acceptance"
            )
        try {
            val engine = RustSudokuEngine()
            measure("firstNativeInformationCall") { completed(engine.information()) }
            repeat(5) {
                measure("warmNativeInformationCall:$it") { completed(engine.information()) }
            }
            val cases = corpus.getJSONArray("cases")
            assertEquals(19, cases.length())
            for (index in 0 until cases.length()) {
                val row = cases.getJSONObject(index)
                val request = row.generationRequest()
                val historical = row.historicalPuzzle()
                assertEquals(
                    Validation.Valid,
                    completed(engine.validatePuzzle(historical.content())).value
                )
                var previous: Puzzle? = null
                repeat(2) { repetition ->
                    val response = measure("generation:${row.getString("id")}:$repetition") {
                        completed(engine.generate(request))
                    }
                    assertEquals(
                        request.seed.joinToString("") {
                            it.toString(16).padStart(2, '0')
                        },
                        response.value.puzzle.seed
                    )
                    if (previous != null) {
                        assertEquals(previous, response.value.puzzle)
                    }
                    previous = response.value.puzzle
                    measurements.getJSONObject(measurements.length() - 1)
                        .put(
                            "sample",
                            if (repetition ==
                                0
                            ) {
                                "first seed invocation"
                            } else {
                                "warm same seed"
                            }
                        )
                }
            }
            arithmeticMeasurements(corpus.getJSONObject("arithmetic").nativeBoardFixture())
            nodeLimitMeasurement(corpus.getJSONObject("nearExhaustion").nativeBoardFixture())
            cancellationSamples(cases)
            nextPreparationAfterCancellation(engine, cases)
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

    private suspend fun arithmeticMeasurements(fixture: NativeBoardFixture) {
        fixture.withPrepared { prepared, token ->
            val result = measure("hardArithmeticCandidates:independentFixture") {
                prepared.candidates(BoardQueryDto(fixture.board), token)
            }
            measurements.getJSONObject(measurements.length() - 1)
                .put("isComplete", result.result is CandidateResultDto.Complete)
            repeat(25) { measure("ownedMetadataRoundTrip:$it") { prepared.metadata().player() } }
        }
    }

    private suspend fun nodeLimitMeasurement(fixture: NativeBoardFixture) {
        val input = PreparedCountInputDto(fixture.board, SearchOptionsDto(nodeLimit = 0u))
        fixture.withPrepared { prepared, token ->
            val response = measure("searchNodeLimit:historicalBoard") {
                prepared.countSolutions(input, token)
            }
            measurements.getJSONObject(measurements.length() - 1)
                .put("nodeLimit", 0)
                .put("isIncomplete", response.result is SearchResultDto.Incomplete)
        }
    }

    private fun cancellationSamples(cases: JSONArray) {
        val row = hardGenerationCase(cases)
        val request = row.generationRequest()
        val version = if (request.variant == Variant.CLASSIC) {
            GenerationVersionDto.CLASSIC_V12
        } else {
            GenerationVersionDto.VARIANTS_V12
        }
        val options =
            GenerationOptionsDto(
                request.variant.native(),
                request.difficulty.native(),
                version,
                null
            )
        val executor = Executors.newSingleThreadExecutor()
        try {
            repeat(3) { sample ->
                val token = CancellationToken()
                val started = CountDownLatch(1)
                val future = executor.submit<JSONObject> {
                    started.countDown()
                    try {
                        val result =
                            generate(request.seed.map { it.toByte() }.toByteArray(), options, token)
                        JSONObject().put(
                            "status",
                            when (result) {
                                is GenerationResultDto.Ready -> "completed-before-signal"
                                is GenerationResultDto.Incomplete -> "incomplete-before-signal"
                                is GenerationResultDto.Failed -> "failed-before-signal"
                            }
                        )
                    } catch (cancelled: NativeException.Cancelled) {
                        JSONObject().put("status", "cancelled")
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
                        .put("sampleValid", result.optString("status") == "cancelled")
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

    private suspend fun nextPreparationAfterCancellation(
        engine: RustSudokuEngine,
        cases: JSONArray
    ) = coroutineScope {
        val request = hardGenerationCase(cases).generationRequest()
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
            JSONObject().put("name", "nextPreparationAfterCancellation")
                .put("facadeCoroutinesPendingAtSignal", activeAtSignal)
                .put(
                    "sampleInterpretation",
                    "Includes queued calls and ends when one later preparation returns"
                )
                .put(
                    "cancelToNextPreparedReturnMs",
                    (SystemClock.elapsedRealtimeNanos() - signalledAt) / NANOS_PER_MS
                )
                .put("sampleValid", activeAtSignal == 2)
        )
    }

    private suspend fun repeatedHandleHeap(cases: JSONArray) {
        val rules = hardGenerationCase(cases).historicalPuzzle().rules
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
            .put(
                "interpretation",
                "Observation includes all process native allocations; no leak-free claim"
            )
    }

    private fun hardGenerationCase(cases: JSONArray): JSONObject = (0 until cases.length()).map {
        cases.getJSONObject(it)
    }.first {
        val input = it.getJSONObject("input")
        input.getString("variant") == "killer" && input.getString("difficulty") == "hard"
    }

    private fun <T> completed(outcome: EngineOutcome<T>): EngineOutcome.Completed<T> =
        when (outcome) {
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
                    .put(
                        "durationMs",
                        (SystemClock.elapsedRealtimeNanos() - startedAt) / NANOS_PER_MS
                    )
            )
        }
    }

    companion object {
        private const val TAG = "SudokuNativeMetrics"
        private const val NANOS_PER_MS = 1_000_000.0
    }
}
