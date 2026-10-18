package dev.sudoku.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.SettingsUpdate
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.ThemePreference
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
    val bootstrapError: String? = null,
    val themeFailure: ThemeFailure? = null
) {
    val error: String? get() = bootstrapError ?: themeFailure?.message
}

internal data class ThemeFailure(val requested: ThemePreference, val message: String)

/** Owns readiness and global preferences; feature ViewModels own player workflows. */
@HiltViewModel
internal class AppViewModel @Inject constructor(
    private val repository: GameRepository,
    private val reads: dev.sudoku.app.model.GameReadRepository
) : ViewModel() {
    private val mutableState = MutableStateFlow(AppUiState())
    val uiState = mutableState.asStateFlow()

    private val settingsWrites = Mutex()

    init {
        loadBootstrap()
    }

    fun retry() {
        val failedTheme = mutableState.value.themeFailure
        if (failedTheme != null) {
            setTheme(failedTheme.requested)
        } else {
            loadBootstrap()
        }
    }

    private fun loadBootstrap() {
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(loading = true, bootstrapError = null)
            when (val snapshot = reads.readBootstrap()) {
                is StorageOutcome.Success -> mutableState.value = AppUiState(
                    ready = true,
                    loading = false,
                    settings = snapshot.value.settings
                )
                is StorageOutcome.Failure -> mutableState.value = mutableState.value.copy(
                    loading = false,
                    bootstrapError = "本机数据暂时无法读取，请重试。原有进度已保留。"
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
                    mutableState.value.copy(settings = result.value.settings, bootstrapError = null)
            is StorageOutcome.Failure ->
                mutableState.value =
                    mutableState.value.copy(bootstrapError = "设置读取失败：${result.error.message}")
        }
    }

    fun setTheme(theme: ThemePreference) {
        viewModelScope.launch {
            settingsWrites.withLock {
                val epoch = repository.readDatasetEpoch()
                if (epoch !is StorageOutcome.Success) {
                    mutableState.value = mutableState.value.copy(themeFailure = ThemeFailure(theme, "设置暂时不可保存，请重试。"))
                    return@withLock
                }

                when (val result = repository.updateSettings(SettingsUpdate.Theme(theme), epoch.value)) {
                    is StorageOutcome.Success ->
                        mutableState.value =
                            mutableState.value.copy(settings = result.value, themeFailure = null)
                    is StorageOutcome.Failure ->
                        mutableState.value =
                            mutableState.value.copy(
                                themeFailure = ThemeFailure(theme, "设置保存失败：${result.error.message}")
                            )
                }
            }
        }
    }
}
