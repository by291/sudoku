package dev.yigeyinian.sudoku.engine

import dev.yigeyinian.sudoku.ffi.CancellationToken
import dev.yigeyinian.sudoku.ffi.NativeException
import dev.yigeyinian.sudoku.model.EngineOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

/** Deadlines include dispatch, owned conversion, native computation, and result validation. */
data class NativeExecutionLimits(val generationDeadlineMs: Long = 3_000, val analysisDeadlineMs: Long = 15_000) {
    init {
        require(generationDeadlineMs > 0 && analysisDeadlineMs > 0)
    }
}

// These application-wide lanes bound executing synchronous calls across all engine instances.
internal object NativeCalls {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val interactive = Dispatchers.IO.limitedParallelism(1)
    private val analysis = Dispatchers.IO.limitedParallelism(2)

    suspend fun <T> run(
        long: Boolean,
        deadlineMs: Long,
        discard: (T) -> Unit = {},
        operation: (CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> {
        return try {
            withTimeout(deadlineMs) {
                suspendCancellableCoroutine { continuation ->
                    val cancellation = TokenOwner()
                    continuation.invokeOnCancellation { cancellation.cancel() }
                    scope.launch(if (long) analysis else interactive) {
                        // Cancelled queued work never enters native computation.
                        if (!continuation.isActive) {
                            return@launch
                        }
                        val result = try {
                            val token = cancellation.create()
                            operation(token)
                        } catch (failure: NativeException.Cancelled) {
                            EngineOutcome.Cancelled
                        } catch (failure: NativeException.BudgetExhausted) {
                            EngineOutcome.BudgetExhausted(failure.workUsed.toLong())
                        } catch (failure: Exception) {
                            EngineOutcome.Failed(failure.message ?: "Native engine operation failed")
                        } catch (failure: LinkageError) {
                            EngineOutcome.Failed(failure.message ?: "Native engine library could not load")
                        } finally {
                            cancellation.close()
                        }
                        continuation.resume(result) { _, rejected, _ ->
                            if (rejected is EngineOutcome.Completed) {
                                discard(rejected.value)
                            }
                        }
                    }
                }
            }
        } catch (timeout: TimeoutCancellationException) {
            EngineOutcome.TimedOut
        } catch (cancelled: CancellationException) {
            EngineOutcome.Cancelled
        }
    }

    fun release(operation: () -> Unit) {
        scope.launch(interactive) { operation() }
    }

    /** The tiny lock guards token lifetime only; long computation never holds it. */
    private class TokenOwner {
        private var token: CancellationToken? = null
        private var cancelled = false

        @Synchronized fun create(): CancellationToken {
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

        @Synchronized private fun signal() {
            cancelled = true
            token?.cancel()
        }

        @Synchronized fun close() {
            token?.close()
            token = null
        }
    }
}
