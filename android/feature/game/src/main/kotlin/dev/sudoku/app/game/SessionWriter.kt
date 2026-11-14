package dev.sudoku.app.game

import dev.sudoku.app.model.BoardLayers
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.HistoryMove
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class SaveState(
    val dirty: Boolean = false,
    val saving: Boolean = false,
    val failure: StorageFailure? = null
)

/** Serialize saves while allowing newer input to stage on the owning dispatcher. */
internal class SessionWriter(
    private val scope: CoroutineScope,
    initialRevision: Long,
    private val write: suspend (GameSession, Long) -> StorageOutcome<SessionRecord>
) {
    private val mutableState = MutableStateFlow(SaveState())
    val state = mutableState.asStateFlow()
    var revision: Long = initialRevision
        private set

    private val writes = Mutex()
    private var pending: GameSession? = null
    private var worker: Job? = null
    private var valid = true

    /** Keep the newest owned snapshot so in-flight writes cannot observe later edits. */
    fun stage(session: GameSession) {
        if (!valid) {
            return
        }

        pending = ownedSnapshot(session)
        mutableState.value = mutableState.value.copy(dirty = true)

        if (worker?.isActive != true) {
            worker = scope.launch { flush() }
        }
    }

    /** Persist the newest pending snapshot and report whether it is safe to release the editor. */
    suspend fun flush(): Boolean = writes.withLock {
        if (!valid) {
            return@withLock false
        }

        while (true) {
            val snapshot = pending ?: break
            pending = null
            mutableState.value = SaveState(dirty = true, saving = true)

            val result = try {
                write(snapshot, revision)
            } catch (cancelled: CancellationException) {
                // A cleanup scope may still flush after the ViewModel's worker is cancelled.
                if (valid) {
                    pending = pending ?: snapshot
                }
                throw cancelled
            }

            // An old save cannot adopt the new dataset or publish completion after invalidation.
            if (!valid) {
                return@withLock false
            }

            when (result) {
                is StorageOutcome.Success -> {
                    revision = result.value.revision
                    mutableState.value = SaveState(dirty = pending != null)
                }
                is StorageOutcome.Failure -> {
                    // A later full snapshot already includes the unsaved edits from this write.
                    pending = pending ?: snapshot
                    mutableState.value = SaveState(dirty = true, failure = result.error)
                    return@withLock false
                }
            }
        }

        true
    }

    /** Prevent a detached writer from publishing late results or saving new snapshots. */
    fun invalidate() {
        valid = false
        pending = null
        mutableState.value = SaveState()
    }
}

private fun ownedSnapshot(session: GameSession): GameSession {
    fun layers(value: BoardLayers) = BoardLayers(value.entries.toList(), value.notes.toList())

    fun history(moves: List<HistoryMove>) = moves.map { move ->
        HistoryMove(layers(move.before), layers(move.after))
    }

    return session.copy(
        entries = session.entries.toList(),
        notes = session.notes.toList(),
        undoStack = history(session.undoStack),
        redoStack = history(session.redoStack)
    )
}
