package dev.sudoku.app.engine

import dev.sudoku.app.ffi.BoardQueryDto
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.CandidateResultDto
import dev.sudoku.app.ffi.CandidateWorkDto
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
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking

class NativeOwnershipTest {
    @Test
    fun concurrentCloseWaitsForExecutingLeaseAndReleasesHandleOnce() = runBlocking<Unit> {
        val entered = CountDownLatch(1)
        val finish = CountDownLatch(1)
        val closes = AtomicInteger()
        val native = object : NativePreparedPuzzle(NoHandle) {
            override fun candidates(input: BoardQueryDto, token: CancellationToken): CandidateWorkDto {
                entered.countDown()
                check(finish.await(5, TimeUnit.SECONDS))
                assertEquals(0, closes.get())
                return CandidateWorkDto(CandidateResultDto.Complete(List(81) { 511u.toUShort() }), 0u)
            }

            override fun close() {
                closes.incrementAndGet()
            }
        }
        val metadata =
            RuleMetadata(
                PuzzleRules.Classic,
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList()
            )
        val prepared = OwnedPreparedPuzzle(native, metadata, NativeExecutionLimits())
        val query = async { prepared.candidates(List(81) { 0 }) }
        try {
            assertTrue(kotlinx.coroutines.withContext(Dispatchers.IO) { entered.await(5, TimeUnit.SECONDS) })
            val firstClose = async(start = CoroutineStart.UNDISPATCHED) { prepared.close() }
            val secondClose = async(start = CoroutineStart.UNDISPATCHED) { prepared.close() }

            assertFalse(firstClose.isCompleted)
            assertFalse(secondClose.isCompleted)
            assertEquals(0, closes.get())
            finish.countDown()
            assertIs<EngineOutcome.Completed<*>>(query.await())
            firstClose.await()
            secondClose.await()

            assertEquals(1, closes.get())
            assertIs<EngineOutcome.Failed>(prepared.isComplete(List(81) { 0 }))
        } finally {
            finish.countDown()
            query.cancelAndJoin()
            prepared.close()
        }
    }

    @Test
    fun cancelledQueuedCallNeverEntersItsOperation() = runBlocking<Unit> {
        val entered = CountDownLatch(1)
        val finish = CountDownLatch(1)
        val calls = AtomicInteger()
        val occupying = async {
            NativeCalls.run(NativeLane.INTERACTIVE, 5_000) {
                entered.countDown()
                check(finish.await(5, TimeUnit.SECONDS))
                EngineOutcome.Completed(Unit)
            }
        }
        try {
            assertTrue(kotlinx.coroutines.withContext(Dispatchers.IO) { entered.await(5, TimeUnit.SECONDS) })
            val queued = async(start = CoroutineStart.UNDISPATCHED) {
                NativeCalls.run(NativeLane.INTERACTIVE, 5_000) {
                    calls.incrementAndGet()
                    EngineOutcome.Completed(Unit)
                }
            }

            queued.cancelAndJoin()
            finish.countDown()
            occupying.await()
            // A following operation drains the same FIFO lane after the rejected queued call.
            NativeCalls.run(NativeLane.INTERACTIVE, 5_000) { EngineOutcome.Completed(Unit) }

            assertEquals(0, calls.get())
        } finally {
            finish.countDown()
            occupying.cancelAndJoin()
        }
    }

    @Test
    fun preparedResourceReturnedAfterCancellationIsDiscardedExactlyOnce() = runBlocking<Unit> {
        val entered = CountDownLatch(1)
        val finish = CountDownLatch(1)
        val discarded = CountDownLatch(1)
        val closes = AtomicInteger()
        val native = object : NativePreparedPuzzle(NoHandle) {
            override fun close() {
                closes.incrementAndGet()
                discarded.countDown()
            }
        }
        val prepared = OwnedPreparedPuzzle(
            native,
            RuleMetadata(
                PuzzleRules.Classic,
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList()
            ),
            NativeExecutionLimits()
        )
        val preparing = async {
            NativeCalls.run(NativeLane.ANALYSIS, 5_000, discard = { it.discard() }) {
                entered.countDown()
                check(finish.await(5, TimeUnit.SECONDS))
                EngineOutcome.Completed(prepared)
            }
        }
        try {
            assertTrue(kotlinx.coroutines.withContext(Dispatchers.IO) { entered.await(5, TimeUnit.SECONDS) })

            preparing.cancelAndJoin()
            finish.countDown()

            assertTrue(kotlinx.coroutines.withContext(Dispatchers.IO) { discarded.await(5, TimeUnit.SECONDS) })
            assertEquals(1, closes.get())
            prepared.close()
            assertEquals(1, closes.get())
        } finally {
            finish.countDown()
            preparing.cancelAndJoin()
            prepared.close()
        }
    }
}
