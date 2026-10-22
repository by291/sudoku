package dev.sudoku.app.engine

import dev.sudoku.app.ffi.BoardEditDto
import dev.sudoku.app.ffi.BoardQueryDto
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.CandidateResultDto
import dev.sudoku.app.ffi.ConflictResultDto
import dev.sudoku.app.ffi.EditInputDto
import dev.sudoku.app.ffi.EditResultDto
import dev.sudoku.app.ffi.HintInputDto
import dev.sudoku.app.ffi.HintResultDto
import dev.sudoku.app.ffi.HintUnavailableDto
import dev.sudoku.app.ffi.PreparedPuzzle as NativePreparedPuzzle
import dev.sudoku.app.ffi.ReviewInputDto
import dev.sudoku.app.ffi.hint
import dev.sudoku.app.model.BoardEdit
import dev.sudoku.app.model.BoardLayers
import dev.sudoku.app.model.EditResult
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.HintResult
import dev.sudoku.app.model.PreparedPuzzle
import dev.sudoku.app.model.RuleMetadata
import dev.sudoku.app.model.RuleViolation
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/** A call leases immutable preparation, with no lock held during native computation. */
internal class OwnedPreparedPuzzle(
    private val native: NativePreparedPuzzle,
    override val metadata: RuleMetadata,
    private val limits: NativeExecutionLimits
) : PreparedPuzzle {
    private val ownership = Any()
    private var closing = false
    private var inFlight = 0
    private val drained = CompletableDeferred<Unit>()
    private var destroyed = false

    private fun acquire(): NativePreparedPuzzle = synchronized(ownership) {
        check(!closing) { "Prepared puzzle is closed" }
        inFlight += 1
        native
    }

    private fun release() = synchronized(ownership) {
        inFlight -= 1
        if (closing && inFlight == 0) {
            drained.complete(Unit)
        }
    }

    private suspend fun <T> use(
        lane: NativeLane,
        operation: (NativePreparedPuzzle, CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> = NativeCalls.run(lane, limits.requestDeadlineMs) { token ->
        val handle = acquire()
        try {
            operation(handle, token)
        } finally {
            release()
        }
    }

    override suspend fun edit(givens: List<Int>, layers: BoardLayers, action: BoardEdit): EngineOutcome<EditResult> =
        guarded {
            require(layers.notes.size == 81) { "Notes require 81 masks" }
            val nativeAction = when (action) {
                is BoardEdit.Enter -> BoardEditDto.Enter(action.cell.nativeCell(), action.digit.nativeDigit())
                is BoardEdit.Erase -> BoardEditDto.Erase(action.cell.nativeCell())
                is BoardEdit.ToggleNote -> BoardEditDto.ToggleNote(
                    action.cell.nativeCell(),
                    action.digit.nativeDigit()
                )
                BoardEdit.GenerateNotes -> BoardEditDto.GenerateNotes
            }
            val input =
                EditInputDto(
                    givens.nativeBoard(),
                    layers.entries.nativeBoard(),
                    layers.notes.map {
                        it.nativeMask()
                    },
                    nativeAction
                )
            use(
                if (action == BoardEdit.GenerateNotes) {
                    NativeLane.ANALYSIS
                } else {
                    NativeLane.INTERACTIVE
                }
            ) { handle, token ->
                val response = handle.edit(input, token)
                when (val result = response.result) {
                    is EditResultDto.Complete -> EngineOutcome.Completed(
                        EditResult(
                            result.entries.playerBoard(),
                            result.notes.map {
                                it.toInt()
                            },
                            result.changed,
                            result.boardComplete
                        )
                    )
                    EditResultDto.Incomplete -> EngineOutcome.Incomplete
                }
            }
        }

    override suspend fun candidates(board: List<Int>): EngineOutcome<List<Int>> = guarded {
        val input = BoardQueryDto(board.nativeBoard())
        use(NativeLane.ANALYSIS) { handle, token ->
            val response = handle.candidates(input, token)
            when (val result = response.result) {
                is CandidateResultDto.Complete -> EngineOutcome.Completed(
                    result.candidates.map {
                        it.toInt()
                    }
                )
                CandidateResultDto.Incomplete -> EngineOutcome.Incomplete
            }
        }
    }

    override suspend fun conflicts(board: List<Int>): EngineOutcome<List<RuleViolation>> = guarded {
        val input = BoardQueryDto(board.nativeBoard())
        use(NativeLane.ANALYSIS) { handle, token ->
            val response = handle.conflicts(input, token)
            when (val result = response.result) {
                is ConflictResultDto.Complete -> EngineOutcome.Completed(
                    result.violations.map {
                        it.player()
                    }
                )
                is ConflictResultDto.Incomplete -> EngineOutcome.Incomplete
            }
        }
    }

    override suspend fun isComplete(board: List<Int>): EngineOutcome<Boolean> = guarded {
        val input = board.nativeBoard()
        use(NativeLane.INTERACTIVE) { handle, _ -> EngineOutcome.Completed(handle.isComplete(input)) }
    }

    override suspend fun reviewEntries(board: List<Int>, solution: List<Int>): EngineOutcome<List<Int>> = guarded {
        val input = ReviewInputDto(board.nativeBoard(), solution.nativeBoard())
        use(NativeLane.INTERACTIVE) { handle, _ ->
            EngineOutcome.Completed(handle.reviewEntries(input).map { it.toInt() })
        }
    }

    override suspend fun hint(board: List<Int>, solution: List<Int>): EngineOutcome<HintResult> = guarded {
        val input = HintInputDto(board.nativeBoard(), solution.nativeBoard(), metadata.rules.native(), null)
        use(NativeLane.ANALYSIS) { _, token ->
            val response = hint(input, token)
            val result = response.result
            if (result is HintResultDto.Unavailable && result.reason == HintUnavailableDto.INCOMPLETE) {
                EngineOutcome.Incomplete
            } else {
                EngineOutcome.Completed(result.player())
            }
        }
    }

    override suspend fun close() {
        synchronized(ownership) {
            closing = true
            if (inFlight == 0) {
                drained.complete(Unit)
            }
        }
        // Coroutine cancellation cannot shorten native lifetime. Closing resumes only after every lease returns.
        withContext(NonCancellable + Dispatchers.IO) {
            drained.await()
            synchronized(ownership) {
                if (!destroyed) {
                    native.close()
                    destroyed = true
                }
            }
        }
    }

    fun discard() {
        NativeCalls.release {
            synchronized(ownership) {
                check(inFlight == 0)
                closing = true
                if (!destroyed) {
                    native.close()
                    destroyed = true
                }
                drained.complete(Unit)
            }
        }
    }
}
