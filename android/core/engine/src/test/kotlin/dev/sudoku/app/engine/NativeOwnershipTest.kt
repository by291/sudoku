package dev.sudoku.app.engine

import dev.sudoku.app.ffi.BoardQueryDto
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.CandidateComputationDto
import dev.sudoku.app.ffi.CandidateResultDto
import dev.sudoku.app.ffi.MetadataDto
import dev.sudoku.app.ffi.NoHandle
import dev.sudoku.app.ffi.PreparedPuzzle as NativePreparedPuzzle
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.RuleMetadata
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

private const val EXPECTED_ANALYSIS_SLOTS = 2
private const val VIRTUAL_DEADLINE_MS = 50L
private const val WINDOW_FOR_ENTRY_SECONDS = 10L
private const val OCCUPANCY_DEADLINE_MS = 30_000L

/** Exercises native request and handle ownership with explicitly held execution slots. */
@OptIn(ExperimentalCoroutinesApi::class)
class NativeOwnershipTest {
    /** Checks that failed metadata conversion leaves no unpublished handle. */
    @Test
    fun preparationClosesUnpublishedHandleWhenMetadataLinkageFails() {
        val closes = AtomicInteger()
        val native = object : NativePreparedPuzzle(NoHandle) {
            override fun metadata(): MetadataDto =
                throw LinkageError("Metadata downcall unavailable")

            override fun close() {
                closes.incrementAndGet()
            }
        }

        assertFailsWith<LinkageError> { ownPreparedPuzzle(native, NativeExecutionLimits()) }

        assertEquals(1, closes.get())
    }

    /** Checks that request expiry cannot release a synchronous call's executing lease. */
    @Test
    fun preparedCallDeadlineDoesNotReleaseItsExecutingHandle() = runTest {
        val gate = NativeCallGate()
        val closes = AtomicInteger()
        val native = object : NativePreparedPuzzle(NoHandle) {
            override fun isComplete(board: ByteArray): Boolean {
                gate.arriveAndWait()
                assertEquals(0, closes.get())

                return true
            }

            override fun close() {
                closes.incrementAndGet()
            }
        }
        val limits = NativeExecutionLimits(requestDeadlineMs = VIRTUAL_DEADLINE_MS)
        val prepared = OwnedPreparedPuzzle(native, classicMetadata(), limits)
        val query = async { prepared.isComplete(List(81) { 0 }) }
        try {
            runCurrent()
            gate.awaitEntries()

            advanceTimeBy(VIRTUAL_DEADLINE_MS)
            runCurrent()
            assertIs<EngineOutcome.TimedOut>(query.await())
            val closing = async(start = CoroutineStart.UNDISPATCHED) { prepared.close() }

            assertFalse(closing.isCompleted)
            assertEquals(0, closes.get())
            gate.release()
            closing.await()
            assertEquals(1, closes.get())
        } finally {
            gate.release()
            query.cancelAndJoin()
            prepared.close()
        }
    }

    /** Checks that concurrent close calls share a single lease drain and native release. */
    @Test
    fun concurrentCloseWaitsForExecutingLeaseAndReleasesHandleOnce() = runBlocking<Unit> {
        val gate = NativeCallGate()
        val closes = AtomicInteger()
        val native = object : NativePreparedPuzzle(NoHandle) {
            override fun candidates(
                input: BoardQueryDto,
                token: CancellationToken
            ): CandidateComputationDto {
                gate.arriveAndWait()
                assertEquals(0, closes.get())

                return CandidateComputationDto(
                    CandidateResultDto.Complete(List(81) { 511u.toUShort() })
                )
            }

            override fun close() {
                closes.incrementAndGet()
            }
        }
        val limits = NativeExecutionLimits(requestDeadlineMs = OCCUPANCY_DEADLINE_MS)
        val prepared = OwnedPreparedPuzzle(native, classicMetadata(), limits)
        val query = async(start = CoroutineStart.UNDISPATCHED) {
            prepared.candidates(List(81) { 0 })
        }
        try {
            gate.awaitEntries()
            val firstClose = async(start = CoroutineStart.UNDISPATCHED) { prepared.close() }
            val secondClose = async(start = CoroutineStart.UNDISPATCHED) { prepared.close() }

            assertFalse(firstClose.isCompleted)
            assertFalse(secondClose.isCompleted)
            assertEquals(0, closes.get())
            gate.release()
            assertIs<EngineOutcome.Completed<*>>(query.await())
            firstClose.await()
            secondClose.await()

            assertEquals(1, closes.get())
            assertIs<EngineOutcome.Failed>(prepared.isComplete(List(81) { 0 }))
        } finally {
            gate.release()
            query.cancelAndJoin()
            prepared.close()
        }
    }

    /** Checks that cancellation removes a queued operation before it can execute. */
    @Test
    fun cancelledQueuedCallNeverEntersItsOperation() = runBlocking<Unit> {
        val gate = NativeCallGate()
        val calls = AtomicInteger()
        val occupying = async(start = CoroutineStart.UNDISPATCHED) {
            occupyLane(NativeLane.INTERACTIVE, gate, OCCUPANCY_DEADLINE_MS)
        }
        try {
            gate.awaitEntries()
            val queued = async(start = CoroutineStart.UNDISPATCHED) {
                countInteractiveCall(calls, OCCUPANCY_DEADLINE_MS)
            }

            queued.cancelAndJoin()
            gate.release()
            assertIs<EngineOutcome.Completed<Unit>>(occupying.await())
            // The following operation drains the same lane after the rejected queued call.
            assertIs<EngineOutcome.Completed<Unit>>(drainInteractiveLane())

            assertEquals(0, calls.get())
        } finally {
            gate.release()
            occupying.cancelAndJoin()
        }
    }

    /** Checks that expiry includes time spent waiting behind an executing call. */
    @Test
    fun deadlineIncludesQueueWaitAndPreventsExpiredOperationFromStarting() = runTest {
        val gate = NativeCallGate()
        val calls = AtomicInteger()
        val occupying = async(Dispatchers.Default) {
            occupyLane(NativeLane.INTERACTIVE, gate, OCCUPANCY_DEADLINE_MS)
        }
        try {
            gate.awaitEntries()
            val queued = async { countInteractiveCall(calls, VIRTUAL_DEADLINE_MS) }

            runCurrent()
            advanceTimeBy(VIRTUAL_DEADLINE_MS)
            runCurrent()

            assertIs<EngineOutcome.TimedOut>(queued.await())
            gate.release()
            assertIs<EngineOutcome.Completed<Unit>>(occupying.await())
            val drained = async(Dispatchers.Default) { drainInteractiveLane() }
            assertIs<EngineOutcome.Completed<Unit>>(drained.await())
            assertEquals(0, calls.get())
        } finally {
            gate.release()
            occupying.cancelAndJoin()
        }
    }

    /** Checks that expiry signals execution and disposes of a result delivered after expiry. */
    @Test
    fun timeoutSignalsTokenAndDiscardsLateConvertedResult() = runTest {
        val gate = NativeCallGate()
        val entered = CountDownLatch(1)
        val signalled = CountDownLatch(1)
        val discarded = CountDownLatch(1)
        val request = async {
            NativeCalls.run(
                lane = NativeLane.ANALYSIS,
                deadlineMs = VIRTUAL_DEADLINE_MS,
                discard = { _: Unit -> discarded.countDown() }
            ) { token ->
                entered.countDown()
                // Poll the actual native token on the executing call's side of the cancellation.
                while (!token.isCancelled() && !gate.isReleased) {
                    Thread.sleep(1)
                }
                if (token.isCancelled()) {
                    signalled.countDown()
                }
                gate.arriveAndWait()

                EngineOutcome.Completed(Unit)
            }
        }
        try {
            runCurrent()
            entered.awaitSignal()

            advanceTimeBy(VIRTUAL_DEADLINE_MS)
            runCurrent()

            assertIs<EngineOutcome.TimedOut>(request.await())
            signalled.awaitSignal()
            assertEquals(1L, discarded.count)
            gate.release()
            discarded.awaitSignal()
        } finally {
            gate.release()
            request.cancelAndJoin()
        }
    }

    /** Checks that both analysis slots become available after timed-out execution returns. */
    @Test
    fun bothAnalysisSlotsDrainAfterExecutingRequestsTimeOut() = runTest {
        val expired = NativeCallGate(EXPECTED_ANALYSIS_SLOTS)
        val following = NativeCallGate(EXPECTED_ANALYSIS_SLOTS)
        val active = List(EXPECTED_ANALYSIS_SLOTS) {
            async { occupyLane(NativeLane.ANALYSIS, expired, VIRTUAL_DEADLINE_MS) }
        }
        try {
            runCurrent()
            expired.awaitEntries()

            advanceTimeBy(VIRTUAL_DEADLINE_MS)
            runCurrent()

            for (request in active) {
                assertIs<EngineOutcome.TimedOut>(request.await())
            }
            expired.release()

            // Hold each follower until both have entered so a single surviving slot cannot pass.
            val probes = List(EXPECTED_ANALYSIS_SLOTS) {
                async(Dispatchers.Default) {
                    occupyLane(NativeLane.ANALYSIS, following, OCCUPANCY_DEADLINE_MS)
                }
            }
            following.awaitEntries()
            following.release()

            for (probe in probes) {
                assertIs<EngineOutcome.Completed<Unit>>(probe.await())
            }
        } finally {
            expired.release()
            following.release()
            for (request in active) {
                request.cancelAndJoin()
            }
        }
    }

    /** Checks that cancelling a caller still disposes of the unpublished prepared handle. */
    @Test
    fun preparedResourceReturnedAfterCancellationIsDiscardedExactlyOnce() = runBlocking<Unit> {
        val gate = NativeCallGate()
        val discarded = CountDownLatch(1)
        val closes = AtomicInteger()
        val native = object : NativePreparedPuzzle(NoHandle) {
            override fun close() {
                closes.incrementAndGet()
                discarded.countDown()
            }
        }
        val prepared = OwnedPreparedPuzzle(native, classicMetadata(), NativeExecutionLimits())
        val preparing = async(start = CoroutineStart.UNDISPATCHED) {
            NativeCalls.run(
                lane = NativeLane.ANALYSIS,
                deadlineMs = OCCUPANCY_DEADLINE_MS,
                discard = { it.discard() }
            ) {
                gate.arriveAndWait()
                EngineOutcome.Completed(prepared)
            }
        }
        try {
            gate.awaitEntries()

            preparing.cancelAndJoin()
            gate.release()

            discarded.awaitSignal()
            assertEquals(1, closes.get())
            prepared.close()
            assertEquals(1, closes.get())
        } finally {
            gate.release()
            preparing.cancelAndJoin()
            prepared.close()
        }
    }
}

private class NativeCallGate(expectedEntries: Int = 1) {
    private val entered = CountDownLatch(expectedEntries)
    private val finished = CountDownLatch(1)
    val isReleased: Boolean
        get() = finished.count == 0L

    fun arriveAndWait() {
        entered.countDown()
        finished.await()
    }

    fun awaitEntries() = entered.awaitSignal()

    fun release() = finished.countDown()
}

private fun CountDownLatch.awaitSignal() {
    assertTrue(await(WINDOW_FOR_ENTRY_SECONDS, TimeUnit.SECONDS), "Native call did not signal")
}

private suspend fun drainInteractiveLane() =
    NativeCalls.run(NativeLane.INTERACTIVE, OCCUPANCY_DEADLINE_MS) { EngineOutcome.Completed(Unit) }

private suspend fun countInteractiveCall(calls: AtomicInteger, deadlineMs: Long) =
    NativeCalls.run(NativeLane.INTERACTIVE, deadlineMs) {
        calls.incrementAndGet()
        EngineOutcome.Completed(Unit)
    }

private suspend fun occupyLane(lane: NativeLane, gate: NativeCallGate, deadlineMs: Long) =
    NativeCalls.run(lane, deadlineMs) {
        gate.arriveAndWait()
        EngineOutcome.Completed(Unit)
    }

private fun classicMetadata() = RuleMetadata(
    rules = PuzzleRules.Classic,
    units = emptyList(),
    constraints = emptyList(),
    cellUnits = emptyList(),
    cellConstraints = emptyList(),
    duplicatePeers = emptyList(),
    relatedCells = emptyList()
)
