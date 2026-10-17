package dev.yigeyinian.sudoku.game

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.yigeyinian.sudoku.model.ResultRecord
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.challengeDate
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

internal data class GameEntryUiState(
    val loading: Boolean = true,
    val hasLoadedSnapshot: Boolean = false,
    val sessions: List<SessionRecord> = emptyList(),
    val results: List<ResultRecord> = emptyList(),
    val today: String = challengeDate(Instant.now()),
    val error: String? = null
)

@HiltViewModel
internal class GameEntryViewModel @Inject constructor(private val loader: GameEntryLoader) : ViewModel() {
    val uiState = loader.uiState
    private var loading: Job? = null
    private var hasOpened = false

    fun open() {
        // Consume the bootstrap snapshot once; returning from another route must reload saved changes.
        if (hasOpened || !uiState.value.hasLoadedSnapshot) {
            refresh()
        }
        hasOpened = true
    }

    fun refreshIfDateChanged() {
        if (uiState.value.today != challengeDate(Instant.now())) {
            refresh()
        }
    }

    fun refresh() {
        loading?.cancel()
        loading = viewModelScope.launch { loader.prepareHome() }
    }
}
