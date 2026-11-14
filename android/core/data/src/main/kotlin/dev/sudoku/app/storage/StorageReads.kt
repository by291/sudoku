package dev.sudoku.app.storage

import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal suspend fun <T> storageRead(block: suspend () -> T): StorageOutcome<T> =
    withContext(Dispatchers.IO) {
        try {
            StorageOutcome.Success(block())
        } catch (error: CancellationException) {
            throw error
        } catch (error: StorageReadFailure) {
            StorageOutcome.Failure(error.failure)
        } catch (error: Exception) {
            val kind = if (error is StaleSummaryCursor || error is StaleRecordSnapshot) {
                StorageFailureKind.REVISION_CONFLICT
            } else if (error is IllegalArgumentException) {
                StorageFailureKind.INVALID_DATA
            } else {
                StorageFailureKind.UNAVAILABLE
            }
            val message = error.message ?: "Unable to read local data"
            StorageOutcome.Failure(StorageFailure(kind, message))
        }
    }

internal fun <T> StorageOutcome<T>.value(): T = when (this) {
    is StorageOutcome.Success -> value
    is StorageOutcome.Failure -> throw StorageReadFailure(error)
}

internal class StaleSummaryCursor : IllegalStateException("Saved list changed; refresh it")

internal class StaleRecordSnapshot : IllegalStateException("Saved record changed")

private class StorageReadFailure(val failure: StorageFailure) :
    IllegalStateException(failure.message)
