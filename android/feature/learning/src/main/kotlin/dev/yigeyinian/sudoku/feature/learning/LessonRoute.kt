package dev.yigeyinian.sudoku.feature.learning

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.model.GameLaunch

@Composable
fun LessonRoute(lessonId: String, onPractice: (GameLaunch.Practice) -> Unit, onBack: () -> Unit) {
    val model: LearningViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(lessonId, model) { model.open(lessonId) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.checkDataset() }

    LessonScreen(
        state = state,
        onCell = model::selectCell,
        onDigit = model::enterDigit,
        onSubmit = model::submit,
        onNext = model::nextStage,
        onStart = model::startExercise,
        onGuide = model::showGuide,
        onClear = model::clearAnswer,
        onPractice = onPractice,
        onBack = onBack,
        onRetry = { model.open(lessonId) }
    )
}
