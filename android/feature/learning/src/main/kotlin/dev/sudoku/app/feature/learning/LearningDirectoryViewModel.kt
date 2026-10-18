package dev.sudoku.app.feature.learning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.learning.LessonDirectoryEntry
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

internal data class LearningDirectoryState(
    val loading: Boolean = true,
    val directory: List<LessonDirectoryEntry> = emptyList(),
    val progress: List<LessonProgress> = emptyList(),
    val settings: Settings = Settings(),
    val epoch: Long? = null,
    val selectedVariant: Variant = Variant.CLASSIC,
    val error: String? = null
)

/** Directory choices and personal progress never own a lesson answer or an exercise cursor. */
@HiltViewModel
internal class LearningDirectoryViewModel @Inject constructor(private val loader: LearningSnapshotLoader) :
    ViewModel() {
    private val mutableState = MutableStateFlow(LearningDirectoryState(directory = loader.snapshot.directory))
    val uiState = mutableState.asStateFlow()
    private var generation = 0L
    private var observedEpoch: Long? = null
    private var loading: Job? = null

    fun selectVariant(variant: Variant) {
        mutableState.value = mutableState.value.copy(selectedVariant = variant)
    }

    fun open() {
        loading?.cancel()
        val operation = ++generation
        mutableState.value = mutableState.value.copy(error = null)
        loading = viewModelScope.launch {
            val epoch = loader.readEpoch()
            if (operation != generation) {
                return@launch
            }
            if (epoch is StorageOutcome.Success && mutableState.value.epoch?.let { it != epoch.value } == true) {
                // A hidden directory may miss replacement observations; erase its personal facts
                // before a potentially slow progress read can expose the replacement dataset.
                mutableState.value = LearningDirectoryState(
                    directory = loader.snapshot.directory,
                    selectedVariant = mutableState.value.selectedVariant
                )
            }
            val loaded = loader.read()
            if (operation != generation) {
                return@launch
            }
            // An epoch can be observed after the loader captures its final read but before
            // delivery. Unknown presentation state must not erase that independent fence.
            if (loaded.epoch != null && observedEpoch?.let { it != loaded.epoch } == true) {
                invalidate()
                open()
                return@launch
            }
            mutableState.value = LearningDirectoryState(
                loading = false,
                directory = loaded.directory,
                progress = loaded.progress,
                settings = loaded.settings,
                epoch = loaded.epoch,
                selectedVariant = mutableState.value.selectedVariant,
                error = loaded.error
            )
        }
    }

    /** A visible return rereads facts; epoch changes immediately discard the old dataset's progress. */
    suspend fun observe() {
        open()
        loader.datasetEpochs.collect { epoch ->
            val previous = observedEpoch
            observedEpoch = epoch
            if ((previous != null && previous != epoch) || mutableState.value.epoch?.let { it != epoch } == true) {
                invalidate()
                open()
            }
        }
    }

    private fun invalidate() {
        loading?.cancel()
        generation++
        mutableState.value = LearningDirectoryState(
            directory = loader.snapshot.directory,
            selectedVariant = mutableState.value.selectedVariant
        )
    }
}
