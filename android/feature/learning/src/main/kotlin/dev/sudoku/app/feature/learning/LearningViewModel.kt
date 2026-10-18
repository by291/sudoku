package dev.sudoku.app.feature.learning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.LearningProgressRepository
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.Placement
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.learning.ExerciseAnswer
import dev.sudoku.app.model.learning.ExerciseSubmission
import dev.sudoku.app.model.learning.LessonCatalogue
import dev.sudoku.app.model.learning.LessonCursor
import dev.sudoku.app.model.learning.directoryEntry
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

internal sealed interface ExerciseFeedback {
    val explanation: String
    val correct: Boolean get() = this is Saved
    val nextCursor: LessonCursor? get() = (this as? Saved)?.transition?.cursor
    val completed: Boolean get() = (this as? Saved)?.transition is ExerciseSubmission.Completed

    data class Incorrect(override val explanation: String) : ExerciseFeedback

    data class Saved(val transition: ExerciseSubmission.Accepted) : ExerciseFeedback {
        override val explanation get() = transition.explanation
    }
}

internal data class LearningUiState(
    val loading: Boolean = true,
    val catalogue: LessonCatalogue? = null,
    val directory: List<dev.sudoku.app.model.learning.LessonDirectoryEntry> = catalogue?.lessons?.map {
        it.directoryEntry()
    }.orEmpty(),
    val progress: List<LessonProgress> = emptyList(),
    val settings: Settings = Settings(),
    val epoch: Long? = null,
    val lessonId: String? = null,
    val cursor: LessonCursor? = null,
    val exerciseStarted: Boolean = false,
    val selectedCell: Int? = null,
    val placement: Placement? = null,
    val removals: Set<Placement> = emptySet(),
    val feedback: ExerciseFeedback? = null,
    val busy: Boolean = false,
    val error: String? = null
) {
    val lesson get() = lessonId?.let { catalogue?.lesson(it) }
    val lessonEntry get() = directory.firstOrNull { it.id == lessonId }
    val exerciseReady get() = !loading && epoch != null && cursor != null
    val stage get() = cursor?.let { lesson?.stages?.getOrNull(it.stageIndex) }
    val completedIds get() = progress.map { it.lessonId }.toSet()
}

/** Owns one teaching interaction; durable writes settle before a correct answer can expose Next. */
@HiltViewModel
internal class LearningViewModel @Inject constructor(
    private val repository: LearningProgressRepository,
    private val loader: LearningSnapshotLoader
) : ViewModel() {
    private val mutableState = MutableStateFlow(LearningUiState(directory = loader.snapshot.directory))
    val uiState = mutableState.asStateFlow()
    private var generation = 0L
    private var observedEpoch: Long? = null
    private var loading: Job? = null
    private var submission: Job? = null
    private val progressWriter = LearningProgressWriter(repository)
    private var requestedLessonId: String? = null

    init {
        viewModelScope.launch {
            loader.datasetEpochs.collect { epoch ->
                val previous = observedEpoch
                observedEpoch = epoch
                if ((previous != null && previous != epoch) ||
                    (mutableState.value.epoch != null && mutableState.value.epoch != epoch)
                ) {
                    invalidatePersonalState()
                    requestedLessonId?.let(::open)
                }
            }
        }
    }

    private fun invalidatePersonalState() {
        loading?.cancel()
        submission?.cancel()
        generation++
        loader.invalidate()
        mutableState.value = LearningUiState(
            catalogue = mutableState.value.catalogue,
            directory = loader.snapshot.directory,
            lessonId = requestedLessonId
        )
    }

    fun open(lessonId: String) {
        requestedLessonId = lessonId
        loading?.cancel()
        submission?.cancel()
        val operation = ++generation
        mutableState.value = LearningUiState(
            catalogue = mutableState.value.catalogue.takeIf { mutableState.value.lessonId == lessonId },
            lessonId = lessonId,
            directory = loader.snapshot.directory
        )
        loading = viewModelScope.launch {
            val loaded = loader.read(lessonId) { catalogue ->
                if (operation == generation) {
                    mutableState.value = mutableState.value.copy(catalogue = catalogue)
                }
            }
            if (operation != generation) {
                return@launch
            }
            if (loaded.epoch != null && observedEpoch?.let { loaded.epoch != it } == true) {
                invalidatePersonalState()
                requestedLessonId?.let(::open)
                return@launch
            }
            val catalogue = loaded.catalogue
            if (loaded.error != null) {
                failLoad(checkNotNull(loaded.error))
                return@launch
            }
            val lesson = catalogue?.lesson(lessonId)
            if (lesson == null) {
                failLoad("找不到这节课程，请返回学习列表。")
                return@launch
            }
            val cursor = catalogue.restoreCursor(lessonId, loaded.settings.lessonStages?.get(lessonId) ?: 0)
            mutableState.value = LearningUiState(
                loading = false,
                catalogue = catalogue,
                directory = loaded.directory,
                progress = loaded.progress,
                settings = loaded.settings,
                epoch = loaded.epoch,
                lessonId = lessonId,
                cursor = cursor
            )
        }
    }

    fun checkDataset() {
        if (mutableState.value.loading) {
            return
        }
        viewModelScope.launch {
            val epoch = repository.readDatasetEpoch()
            if (epoch is StorageOutcome.Success && epoch.value != mutableState.value.epoch) {
                invalidatePersonalState()
                requestedLessonId?.let(::open)
            }
        }
    }

    fun startExercise() {
        if (mutableState.value.exerciseReady && mutableState.value.stage != null && !mutableState.value.busy) {
            mutableState.value = mutableState.value.copy(exerciseStarted = true, error = null)
        }
    }

    fun showGuide() {
        if (!mutableState.value.busy) {
            mutableState.value = mutableState.value.copy(exerciseStarted = false)
        }
    }

    fun selectCell(cell: Int) {
        val state = mutableState.value
        if (state.busy || state.feedback?.correct == true || cell !in 0 until 81) {
            return
        }
        mutableState.value = state.copy(selectedCell = cell)
    }

    fun enterDigit(digit: Int) {
        val state = mutableState.value
        val stage = state.stage ?: return
        val cell = state.selectedCell ?: return
        if (!state.exerciseStarted || state.busy || state.feedback?.correct == true || digit !in 1..9 ||
            stage.board[cell] != 0
        ) {
            return
        }
        when (stage.answer) {
            is ExerciseAnswer.Place ->
                mutableState.value =
                    state.copy(placement = Placement(cell, digit), feedback = null, error = null)
            is ExerciseAnswer.Eliminate -> {
                // Mark only authored candidates; this is answer editing, never candidate inference.
                if (stage.candidates[cell] and (1 shl (digit - 1)) == 0) {
                    return
                }
                val pair = Placement(cell, digit)
                val removals = if (pair in state.removals) state.removals - pair else state.removals + pair
                mutableState.value = state.copy(removals = removals, feedback = null, error = null)
            }
        }
    }

    fun clearAnswer() {
        if (!mutableState.value.busy && mutableState.value.feedback?.correct != true) {
            mutableState.value =
                mutableState.value.copy(placement = null, removals = emptySet(), feedback = null, error = null)
        }
    }

    fun submit() {
        val state = mutableState.value
        val cursor = state.cursor ?: return
        val stage = state.stage ?: return
        val catalogue = state.catalogue ?: return
        val epoch = state.epoch ?: return
        if (!state.exerciseStarted || state.busy || state.feedback?.correct == true) {
            return
        }
        val answer = when (stage.answer) {
            is ExerciseAnswer.Place -> state.placement?.let { ExerciseAnswer.Place(it) }
            is ExerciseAnswer.Eliminate -> state.removals.takeIf {
                it.isNotEmpty()
            }?.let { ExerciseAnswer.Eliminate(it.toList()) }
        }
        if (answer == null) {
            mutableState.value = state.copy(error = "请先选择格子和数字，再提交答案。")
            return
        }
        val result = catalogue.submit(cursor, answer)
        if (result is ExerciseSubmission.Rejected) {
            mutableState.value =
                state.copy(feedback = ExerciseFeedback.Incorrect(result.explanation), error = null)
            return
        }
        val operation = generation
        mutableState.value = state.copy(busy = true, error = null)
        if (result !is ExerciseSubmission.Accepted) {
            return
        }
        submission = viewModelScope.launch {
            when (val saved = progressWriter.save(result, epoch, state.progress)) {
                LearningWriteResult.DatasetChanged -> {
                    if (operation == generation) {
                        invalidatePersonalState()
                        requestedLessonId?.let(::open)
                    }
                }
                is LearningWriteResult.Failed -> saveFailed(operation)
                is LearningWriteResult.Saved -> if (operation == generation) {
                    // The committed cursor authorizes Next, but explicit player input changes the shown stage.
                    mutableState.value = state.copy(
                        busy = false,
                        settings = saved.settings,
                        progress = saved.progress,
                        feedback = ExerciseFeedback.Saved(result),
                        error = null
                    )
                }
            }
        }
    }

    fun nextStage() {
        val state = mutableState.value
        val feedback = state.feedback ?: return
        if (!feedback.correct || state.busy) {
            return
        }
        mutableState.value =
            state.copy(
                cursor = feedback.nextCursor,
                selectedCell = null,
                placement = null,
                removals = emptySet(),
                feedback = null,
                error = null
            )
    }

    private fun failLoad(message: String) {
        mutableState.value = mutableState.value.copy(loading = false, error = message)
    }

    private fun saveFailed(operation: Long) {
        if (operation == generation) {
            mutableState.value = mutableState.value.copy(busy = false, error = "答题正确，但学习进度尚未保存。请再次提交以重试。")
        }
    }
}
