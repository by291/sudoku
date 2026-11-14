package dev.sudoku.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.GameReadRepository
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
    private val reads: GameReadRepository
) : ViewModel() {
    private val mutableState = MutableStateFlow(AppUiState())
    val uiState = mutableState.asStateFlow()

    private val settingsWrites = Mutex()
    private var settingsGeneration = 0L
    private var activeEpoch: Long? = null

    init {
        loadBootstrap()
    }

    /** Retry the failed bootstrap or the last requested theme. */
    fun retry() {
        val failedTheme = mutableState.value.themeFailure
        if (failedTheme != null) {
            setTheme(failedTheme.requested)
        } else {
            loadBootstrap()
        }
    }

    private fun loadBootstrap() {
        val generation = ++settingsGeneration
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(loading = true, bootstrapError = null)

            val snapshot = reads.readBootstrap()
            if (generation != settingsGeneration) {
                return@launch
            }

            when (snapshot) {
                is StorageOutcome.Success -> {
                    activeEpoch = snapshot.value.epoch
                    mutableState.value = AppUiState(
                        ready = true,
                        loading = false,
                        settings = snapshot.value.settings
                    )
                }
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

    /** Load restored settings and prevent older writes from publishing into the new dataset. */
    suspend fun reloadSettings() {
        val generation = ++settingsGeneration

        settingsWrites.withLock {
            val result = reads.readBootstrap()
            if (generation != settingsGeneration) {
                return@withLock
            }

            when (result) {
                is StorageOutcome.Success -> {
                    activeEpoch = result.value.epoch
                    mutableState.value = mutableState.value.copy(
                        settings = result.value.settings,
                        bootstrapError = null,
                        themeFailure = null
                    )
                }
                is StorageOutcome.Failure -> {
                    mutableState.value = mutableState.value.copy(
                        bootstrapError = "设置读取失败：${result.error.message}"
                    )
                }
            }
        }
    }

    /** Apply a theme patch only to the dataset from which the action was requested. */
    fun setTheme(theme: ThemePreference) {
        val generation = settingsGeneration
        val expectedEpoch = activeEpoch

        viewModelScope.launch {
            settingsWrites.withLock {
                if (generation != settingsGeneration || expectedEpoch == null) {
                    return@withLock
                }

                // Storage patches just the theme. The captured epoch rejects a restored dataset.
                val result = repository.updateSettings(SettingsUpdate.Theme(theme), expectedEpoch)
                if (generation != settingsGeneration) {
                    return@withLock
                }

                mutableState.value = when (result) {
                    is StorageOutcome.Success ->
                        mutableState.value.copy(settings = result.value, themeFailure = null)
                    is StorageOutcome.Failure ->
                        mutableState.value.copy(
                            themeFailure = ThemeFailure(theme, "设置保存失败：${result.error.message}")
                        )
                }
            }
        }
    }
}
