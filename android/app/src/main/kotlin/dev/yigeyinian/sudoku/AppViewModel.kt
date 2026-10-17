package dev.yigeyinian.sudoku

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.StorageOutcome
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
    private val repository: GameRepository,
    private val reads: dev.yigeyinian.sudoku.model.GameReadRepository
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
            when (val snapshot = reads.readBootstrap()) {
                is StorageOutcome.Success -> mutableState.value = AppUiState(
                    ready = true,
                    loading = false,
                    settings = snapshot.value.settings
                )
                is StorageOutcome.Failure -> mutableState.value = mutableState.value.copy(
                    loading = false,
                    error = "本机数据暂时无法读取，请重试。原有进度已保留。"
                )
            }
        }
    }

    /** Maintenance starts only after Home has drawn; failures remain local to pending records. */
    suspend fun maintainSummaries() {
        reads.backfill()
    }

    suspend fun reloadSettings() {
        when (val result = reads.readBootstrap()) {
            is StorageOutcome.Success ->
                mutableState.value =
                    mutableState.value.copy(settings = result.value.settings, error = null)
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
