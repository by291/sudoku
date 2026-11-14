package dev.sudoku.app.storage

import androidx.room.withTransaction
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.yield

/** Resolves missing projections while leaving inconclusive records canonical and retryable. */
internal class SummaryMaintenance(
    private val database: SudokuDatabase,
    private val details: RecordDetails
) {
    private enum class Collection { SESSIONS, RESULTS }

    private val summaries = database.summaryDao()
    private val maintenance = Mutex()

    private suspend fun epoch() = database.sudokuDao().dataset()?.epoch ?: 0L

    /** Fences every capture to the epoch this maintenance run started with. */
    suspend fun backfill(): StorageOutcome<Unit> = maintenance.withLock {
        storageRead {
            val startEpoch = epoch()
            var failure: StorageOutcome.Failure? = null

            for (collection in Collection.entries) {
                val outcome = backfillCollection(collection, startEpoch)
                if (outcome != null) {
                    failure = outcome
                }
            }

            if (failure != null) {
                failure.value()
            }
        }
    }

    private suspend fun backfillCollection(
        collection: Collection,
        startEpoch: Long
    ): StorageOutcome.Failure? {
        if (!hasPending(collection, startEpoch)) {
            return null
        }

        var after: String? = null
        var failure: StorageOutcome.Failure? = null
        while (epoch() == startEpoch) {
            // Null starts before all keys, including invalid empty identities.
            val id = when (collection) {
                Collection.SESSIONS -> summaries.nextSession(after)
                Collection.RESULTS -> summaries.nextResult(after)
            } ?: break

            val outcome = when (collection) {
                Collection.SESSIONS -> details.readSession(id, expectedEpoch = startEpoch)
                Collection.RESULTS -> details.readResult(id, expectedEpoch = startEpoch)
            }
            // Invalid data has already been quarantined under its source fence.
            if (outcome is StorageOutcome.Failure &&
                outcome.error.kind != StorageFailureKind.INVALID_DATA
            ) {
                failure = outcome
            }

            after = id
            yield()
        }

        hasPending(collection, startEpoch)
        return failure
    }

    private suspend fun hasPending(collection: Collection, startEpoch: Long): Boolean =
        database.withTransaction {
            // Coverage itself is durable and must not be updated by a superseded run.
            if (epoch() != startEpoch) {
                return@withTransaction false
            }

            when (collection) {
                Collection.SESSIONS -> summaries.pendingSessions()
                Collection.RESULTS -> summaries.pendingResults()
            }
        }
}
