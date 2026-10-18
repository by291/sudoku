package dev.sudoku.app.storage

import dev.sudoku.app.model.StorageOutcome
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.yield

/** One maintenance run resolves pending records; inconclusive rows remain canonical and retryable. */
internal class SummaryMaintenance(private val database: SudokuDatabase, private val details: RecordDetails) {
    private val summaries = database.summaryDao()
    private val maintenance = Mutex()

    private suspend fun epoch() = database.sudokuDao().dataset()?.epoch ?: 0L

    suspend fun backfill(): StorageOutcome<Unit> = maintenance.withLock {
        storageRead {
            val startEpoch = epoch()
            var failure: StorageOutcome.Failure? = null
            for (results in listOf(false, true)) {
                val pending = if (results) summaries.pendingResults() else summaries.pendingSessions()
                if (!pending) {
                    continue
                }

                var after = ""
                while (epoch() == startEpoch) {
                    val id = if (results) summaries.nextResult(after) else summaries.nextSession(after)
                    if (id == null) {
                        break
                    }

                    val outcome = if (results) details.readResult(id) else details.readSession(id)
                    if (outcome is StorageOutcome.Failure) {
                        failure = outcome
                    }
                    after = id
                    yield()
                }
                if (epoch() == startEpoch) {
                    if (results) summaries.pendingResults() else summaries.pendingSessions()
                }
            }
            failure?.let { throw IllegalStateException(it.error.message) }
            Unit
        }
    }
}
