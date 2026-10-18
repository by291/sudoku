package dev.sudoku.app.storage

import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal suspend fun <T> storageRead(block: suspend () -> T): StorageOutcome<T> = withContext(Dispatchers.IO) {
    try {
        StorageOutcome.Success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        val kind = if (error is StaleSummaryCursor) {
            StorageFailureKind.REVISION_CONFLICT
        } else if (error is IllegalArgumentException) {
            StorageFailureKind.INVALID_DATA
        } else {
            StorageFailureKind.UNAVAILABLE
        }
        StorageOutcome.Failure(StorageFailure(kind, error.message ?: "Unable to read local data"))
    }
}

internal fun <T> StorageOutcome<T>.value(): T = when (this) {
    is StorageOutcome.Success -> value
    is StorageOutcome.Failure -> throw IllegalStateException(error.message)
}

internal class StaleSummaryCursor : IllegalStateException("Saved list changed; refresh it")
