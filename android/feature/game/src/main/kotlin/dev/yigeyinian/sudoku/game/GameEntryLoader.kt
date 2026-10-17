package dev.yigeyinian.sudoku.game

import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.challengeDate
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Shares the feature-owned home snapshot between application bootstrap and the home route. */
@Singleton
class GameEntryLoader @Inject constructor(private val repository: GameRepository) {
    private val mutableState = MutableStateFlow(GameEntryUiState())
    internal val uiState = mutableState.asStateFlow()
    private val reads = Mutex()

    /** Reads all free/daily saves and completion records before publishing one complete UI snapshot. */
    suspend fun prepareHome(): StorageOutcome<Unit> = reads.withLock {
        mutableState.value = mutableState.value.copy(loading = true, error = null)
        val today = challengeDate(Instant.now())
        try {
            coroutineScope {
                // listSessions includes both free and daily saves; do not issue the same query twice.
                val sessionsRead = async { repository.listSessions() }
                val resultsRead = async { repository.listResults() }
                val sessions = sessionsRead.await()
                val results = resultsRead.await()
                val failure = when {
                    sessions is StorageOutcome.Failure -> sessions
                    results is StorageOutcome.Failure -> results
                    else -> null
                }
                if (failure != null) {
                    mutableState.value = mutableState.value.copy(
                        error = "存档暂时无法读取，请重试后再开始，避免覆盖原有进度。"
                    )
                    return@coroutineScope failure
                }

                if (sessions is StorageOutcome.Success && results is StorageOutcome.Success) {
                    // A partial refresh could incorrectly offer a new daily attempt over an existing save.
                    mutableState.value = mutableState.value.copy(
                        loading = false,
                        hasLoadedSnapshot = true,
                        sessions = sessions.value,
                        results = results.value,
                        today = today
                    )
                }
                StorageOutcome.Success(Unit)
            }
        } finally {
            mutableState.value = mutableState.value.copy(loading = false)
        }
    }
}
