package dev.sudoku.app.engine

import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.NativeException
import dev.sudoku.app.model.EngineOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

/** Deadlines cover queueing and execution, including result conversion inside the lane.
 * Input snapshots are captured before dispatch and are outside this execution deadline. */
data class NativeExecutionLimits(val requestDeadlineMs: Long = 3_000) {
    init {
        require(requestDeadlineMs > 0)
    }
}

internal enum class NativeLane { INTERACTIVE, ANALYSIS }

// These application-wide lanes bound executing synchronous calls across all engine instances.
internal object NativeCalls {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val interactive = Dispatchers.IO.limitedParallelism(1)
    private val analysis = Dispatchers.IO.limitedParallelism(2)

    /** Run a synchronous call within its queueing and execution budget in milliseconds. */
    suspend fun <T> run(
        lane: NativeLane,
        deadlineMs: Long,
        discard: (T) -> Unit = {},
        operation: (CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> = try {
        withTimeout(deadlineMs) {
            awaitNativeResult(lane, discard, operation)
        }
    } catch (timeout: TimeoutCancellationException) {
        EngineOutcome.TimedOut
    } catch (cancelled: CancellationException) {
        EngineOutcome.Cancelled
    }

    private suspend fun <T> awaitNativeResult(
        lane: NativeLane,
        discard: (T) -> Unit,
        operation: (CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> = suspendCancellableCoroutine { continuation ->
        val cancellation = TokenOwner()
        continuation.invokeOnCancellation { cancellation.cancel() }
        val dispatcher = when (lane) {
            NativeLane.ANALYSIS -> analysis
            NativeLane.INTERACTIVE -> interactive
        }

        // Application scope keeps executing native calls alive until they release their resources.
        scope.launch(dispatcher) {
            if (!continuation.isActive) {
                return@launch
            }

            val result = execute(cancellation, operation)

            // Prompt cancellation can reject delivery even after the native call completed.
            continuation.resume(result) { _, rejected, _ ->
                if (rejected is EngineOutcome.Completed) {
                    discard(rejected.value)
                }
            }
        }
    }

    private fun <T> execute(
        cancellation: TokenOwner,
        operation: (CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> = try {
        val token = cancellation.create()
        operation(token)
    } catch (failure: NativeException.InvalidInput) {
        EngineOutcome.InvalidInput(failure.reason)
    } catch (failure: NativeException.Cancelled) {
        EngineOutcome.Cancelled
    } catch (failure: NativeException.Incomplete) {
        EngineOutcome.Incomplete
    } catch (failure: Exception) {
        EngineOutcome.Failed(failure.message ?: "Native engine operation failed")
    } catch (failure: LinkageError) {
        EngineOutcome.Failed(failure.message ?: "Native engine library could not load")
    } finally {
        // The token must remain valid until the synchronous operation returns.
        cancellation.close()
    }

    /** Retire an unpublished native resource on the interactive dispatcher. */
    fun release(operation: () -> Unit) {
        scope.launch(interactive) { operation() }
    }

    /** The tiny lock guards token lifetime only; long computation never holds it. */
    private class TokenOwner {
        private var token: CancellationToken? = null
        private var cancelled = false

        @Synchronized
        fun create(): CancellationToken {
            val created = CancellationToken()
            token = created

            if (cancelled) {
                created.cancel()
            }

            return created
        }

        fun cancel() {
            // Use the independent IO lane even if all computation lanes are occupied.
            scope.launch(Dispatchers.IO) { signal() }
        }

        @Synchronized
        private fun signal() {
            cancelled = true
            token?.cancel()
        }

        @Synchronized
        fun close() {
            token?.close()
            token = null
        }
    }
}
