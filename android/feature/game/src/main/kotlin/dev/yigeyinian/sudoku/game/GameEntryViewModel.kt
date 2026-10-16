package dev.yigeyinian.sudoku.game

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.ResultRecord
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.challengeDate
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

internal data class GameEntryUiState(
    val loading: Boolean = true,
    val sessions: List<SessionRecord> = emptyList(),
    val results: List<ResultRecord> = emptyList(),
    val today: String = challengeDate(Instant.now()),
    val error: String? = null
)

@HiltViewModel
internal class GameEntryViewModel @Inject constructor(private val repository: GameRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(GameEntryUiState())
    val uiState = mutableState.asStateFlow()
    private var loading: Job? = null

    fun refresh() {
        loading?.cancel()
        loading = viewModelScope.launch {
            mutableState.value =
                mutableState.value.copy(loading = true, today = challengeDate(Instant.now()), error = null)
            val sessions = repository.listSessions()
            val results = repository.listResults()
            if (sessions is StorageOutcome.Success && results is StorageOutcome.Success) {
                mutableState.value =
                    mutableState.value.copy(loading = false, sessions = sessions.value, results = results.value)
            } else {
                mutableState.value = mutableState.value.copy(loading = false, error = "存档暂时无法读取，请重试后再开始，避免覆盖原有进度。")
            }
        }
    }
}
