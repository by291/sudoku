package dev.yigeyinian.sudoku

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.SudokuEngine
import dev.yigeyinian.sudoku.model.ThemePreference
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class AppUiState(
    val ready: Boolean = false,
    val loading: Boolean = true,
    val settings: Settings = Settings(),
    val error: String? = null
)

/** Owns readiness and global preferences; feature ViewModels own player workflows. */
@HiltViewModel
internal class AppViewModel @Inject constructor(
    private val engine: SudokuEngine,
    private val repository: GameRepository
) : ViewModel() {
    private val mutableState = MutableStateFlow(AppUiState())
    val uiState = mutableState.asStateFlow()

    private val settingsWrites = Mutex()

    init {
        retry()
    }

    fun retry() {
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(loading = true, error = null)
            when (val information = engine.information()) {
                is EngineOutcome.Completed -> {
                    val value = information.value
                    if (value.bridgeVersion != "1" || value.puzzleVersion != "sudoku-v11" ||
                        value.variantPuzzleVersion != "sudoku-variants-v11" ||
                        value.ratingVersion != "sudoku-rating-v2"
                    ) {
                        mutableState.value = mutableState.value.copy(loading = false, error = "计算组件版本不匹配，请重新安装完整应用。")
                        return@launch
                    }
                }
                else -> {
                    mutableState.value = mutableState.value.copy(loading = false, error = "数独计算组件加载失败，存档已保留，请重试。")
                    return@launch
                }
            }
            reloadSettings()
            mutableState.value = mutableState.value.copy(ready = true, loading = false)
        }
    }

    suspend fun reloadSettings() {
        when (val result = repository.readSettings()) {
            is StorageOutcome.Success ->
                mutableState.value =
                    mutableState.value.copy(settings = result.value, error = null)
            is StorageOutcome.Failure ->
                mutableState.value =
                    mutableState.value.copy(error = "设置读取失败：${result.error.message}")
        }
    }

    fun setTheme(theme: ThemePreference) {
        viewModelScope.launch {
            settingsWrites.withLock {
                val epoch = repository.readDatasetEpoch()
                val settings = repository.readSettings()
                if (epoch !is StorageOutcome.Success || settings !is StorageOutcome.Success) {
                    mutableState.value = mutableState.value.copy(error = "设置暂时不可保存，请重试。")
                    return@withLock
                }

                val updated = settings.value.copy(theme = theme)
                when (val result = repository.writeSettings(updated, epoch.value)) {
                    is StorageOutcome.Success ->
                        mutableState.value =
                            mutableState.value.copy(settings = updated, error = null)
                    is StorageOutcome.Failure ->
                        mutableState.value =
                            mutableState.value.copy(error = "设置保存失败：${result.error.message}")
                }
            }
        }
    }
}
