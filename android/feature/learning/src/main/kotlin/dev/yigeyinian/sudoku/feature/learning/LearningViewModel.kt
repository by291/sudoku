package dev.yigeyinian.sudoku.feature.learning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.LessonProgress
import dev.yigeyinian.sudoku.model.Placement
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.isoInstant
import dev.yigeyinian.sudoku.model.learning.ExerciseAnswer
import dev.yigeyinian.sudoku.model.learning.LearningContentRepository
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import dev.yigeyinian.sudoku.model.learning.LessonCursor
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

internal data class ExerciseFeedback(
    val correct: Boolean,
    val explanation: String,
    val nextCursor: LessonCursor?,
    val completed: Boolean
)

internal data class LearningUiState(
    val loading: Boolean = true,
    val catalogue: LessonCatalogue? = null,
    val progress: List<LessonProgress> = emptyList(),
    val settings: Settings = Settings(),
    val epoch: Long? = null,
    val selectedVariant: Variant = Variant.CLASSIC,
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
    val stage get() = cursor?.let { lesson?.stages?.getOrNull(it.stageIndex) }
    val completedIds get() = progress.map { it.lessonId }.toSet()
}

/** Owns one teaching interaction; durable writes settle before a correct answer can expose Next. */
@HiltViewModel
internal class LearningViewModel @Inject constructor(
    private val repository: GameRepository,
    private val content: LearningContentRepository
) : ViewModel() {
    private val mutableState = MutableStateFlow(LearningUiState())
    val uiState = mutableState.asStateFlow()
    private var generation = 0L
    private var loading: Job? = null
    private var requestedLessonId: String? = null

    fun open(lessonId: String? = null) {
        requestedLessonId = lessonId
        loading?.cancel()
        val operation = ++generation
        mutableState.value = LearningUiState(selectedVariant = mutableState.value.selectedVariant, lessonId = lessonId)
        loading = viewModelScope.launch {
            val epoch = repository.readDatasetEpoch()
            val catalogue = content.load()
            val settings = repository.readSettings()
            val progress = repository.readLessonProgress()
            val currentEpoch = repository.readDatasetEpoch()
            if (operation != generation) {
                return@launch
            }
            if (epoch !is StorageOutcome.Success || currentEpoch !is StorageOutcome.Success ||
                settings !is StorageOutcome.Success ||
                progress !is StorageOutcome.Success
            ) {
                failLoad("学习进度暂时无法读取，请重试。")
                return@launch
            }
            if (epoch.value != currentEpoch.value) {
                failLoad("本地资料已更新，请重新读取课程。")
                return@launch
            }
            if (catalogue !is EngineOutcome.Completed) {
                failLoad(contentFailure(catalogue))
                return@launch
            }
            val lesson = lessonId?.let(catalogue.value::lesson)
            if (lessonId != null && lesson == null) {
                failLoad("找不到这节课程，请返回学习列表。")
                return@launch
            }
            val cursor = lessonId?.let { catalogue.value.restoreCursor(it, settings.value.lessonStages?.get(it) ?: 0) }
            mutableState.value = LearningUiState(
                loading = false,
                catalogue = catalogue.value,
                progress = progress.value,
                settings = settings.value,
                epoch = epoch.value,
                selectedVariant = lesson?.practiceVariant ?: mutableState.value.selectedVariant,
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
                open(requestedLessonId)
            }
        }
    }

    fun selectVariant(variant: Variant) {
        mutableState.value = mutableState.value.copy(selectedVariant = variant)
    }

    fun startExercise() {
        if (mutableState.value.stage != null && !mutableState.value.busy) {
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
        if (!result.correct) {
            mutableState.value =
                state.copy(feedback = ExerciseFeedback(false, result.explanation, null, false), error = null)
            return
        }
        val operation = generation
        mutableState.value = state.copy(busy = true, error = null)
        viewModelScope.launch {
            val currentEpoch = repository.readDatasetEpoch()
            if (operation != generation) {
                return@launch
            }
            if (currentEpoch is StorageOutcome.Success && currentEpoch.value != epoch) {
                open(requestedLessonId)
                return@launch
            }
            if (currentEpoch !is StorageOutcome.Success) {
                saveFailed(operation)
                return@launch
            }

            // The completion's first timestamp is a retained fact; review cannot create a replacement.
            val completion = if (result.completed && state.progress.none { it.lessonId == cursor.lessonId }) {
                LessonProgress(cursor.lessonId, isoInstant(Instant.now()))
            } else {
                null
            }
            if (completion != null && repository.writeLessonProgress(completion, epoch) !is StorageOutcome.Success) {
                handleSaveFailure(operation, epoch)
                return@launch
            }
            val latestSettings = repository.readSettings()
            if (operation != generation) {
                return@launch
            }
            if (latestSettings !is StorageOutcome.Success) {
                saveFailed(operation)
                return@launch
            }
            val stages = latestSettings.value.lessonStages.orEmpty().toMutableMap()
            if (result.completed) {
                stages.remove(cursor.lessonId)
            } else {
                stages[cursor.lessonId] = result.cursor.stageIndex
            }
            val nextSettings = latestSettings.value.copy(currentLessonId = cursor.lessonId, lessonStages = stages)
            if (repository.writeSettings(nextSettings, epoch) !is StorageOutcome.Success) {
                handleSaveFailure(operation, epoch)
                return@launch
            }
            val retainedProgress = repository.readLessonProgress()
            val after = repository.readDatasetEpoch()
            if (operation != generation) {
                return@launch
            }
            if (after is StorageOutcome.Success && after.value != epoch) {
                open(requestedLessonId)
                return@launch
            }
            if (after !is StorageOutcome.Success || retainedProgress !is StorageOutcome.Success) {
                saveFailed(operation)
                return@launch
            }
            // Keep the shown stage until the player explicitly chooses Next, even though its cursor is durable.
            mutableState.value = state.copy(
                busy = false,
                settings = nextSettings,
                progress = retainedProgress.value,
                feedback = ExerciseFeedback(true, result.explanation, result.cursor, result.completed),
                error = null
            )
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

    private suspend fun handleSaveFailure(operation: Long, epoch: Long) {
        val current = repository.readDatasetEpoch()
        if (operation != generation) {
            return
        }
        if (current is StorageOutcome.Success && current.value != epoch) {
            open(requestedLessonId)
        } else {
            saveFailed(operation)
        }
    }
}

private fun contentFailure(result: EngineOutcome<*>): String = when (result) {
    is EngineOutcome.BudgetExhausted -> "课程校验尚未完成，请重试。"
    EngineOutcome.Cancelled -> "课程加载已取消，可以重试。"
    EngineOutcome.TimedOut -> "课程校验超时，请重试。"
    is EngineOutcome.Failed -> "课程暂时无法校验，请重试。"
    is EngineOutcome.Completed -> error("Completed catalogue is not a loading failure")
}
