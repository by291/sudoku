package dev.sudoku.app.game

import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.StorageOutcome
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Scoped to its ViewModel so a new activity uses the latest bootstrap rather than an older Home cache. */
class GameEntryLoader @Inject constructor(
    internal val reads: GameReadRepository,
    internal val repository: dev.sudoku.app.model.GameRepository
) {
    private val initial = reads.bootstrap.value
    private val mutableState = MutableStateFlow(
        GameEntryUiState(
            epoch = initial?.epoch,
            loading = initial == null,
            hasLoadedSnapshot = initial != null,
            singleSaveId = initial?.home?.singleSaveId,
            hasSaves = initial?.home?.let { it.hasSaves || it.pending } ?: false
        )
    )
    internal val uiState = mutableState.asStateFlow()

    internal fun update(transform: (GameEntryUiState) -> GameEntryUiState) {
        mutableState.value = transform(mutableState.value)
    }

    private var generation = 0L
    private var observedEpoch = initial?.epoch

    internal fun invalidate(epoch: Long) {
        if (observedEpoch == null || epoch > checkNotNull(observedEpoch)) {
            observedEpoch = epoch
            generation++
            mutableState.value = GameEntryUiState(epoch = epoch)
        }
    }

    suspend fun prepareHome(): StorageOutcome<Unit> {
        val operation = ++generation
        val result = reads.readBootstrap()
        // A completed query may have waited behind a newer refresh or dataset replacement.
        if (operation != generation || (
                result is StorageOutcome.Success &&
                    observedEpoch?.let { result.value.epoch < it } == true
                )
        ) {
            return StorageOutcome.Failure(
                dev.sudoku.app.model.StorageFailure(
                    dev.sudoku.app.model.StorageFailureKind.REVISION_CONFLICT,
                    "Home snapshot changed"
                )
            )
        }
        return when (result) {
            is StorageOutcome.Success -> {
                val snapshot = result.value
                if (observedEpoch != snapshot.epoch) {
                    mutableState.value = GameEntryUiState(epoch = snapshot.epoch)
                }
                observedEpoch = snapshot.epoch
                update {
                    it.copy(
                        epoch = snapshot.epoch,
                        loading = false,
                        hasLoadedSnapshot = true,
                        singleSaveId = snapshot.home.singleSaveId,
                        hasSaves = snapshot.home.hasSaves || snapshot.home.pending,
                        error = null
                    )
                }
                StorageOutcome.Success(Unit)
            }
            is StorageOutcome.Failure -> {
                update { it.copy(loading = false, error = "存档暂时无法读取，请重试。") }
                result
            }
        }
    }
}
