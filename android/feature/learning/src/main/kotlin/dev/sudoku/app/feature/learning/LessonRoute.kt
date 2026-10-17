package dev.sudoku.app.feature.learning

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.sudoku.app.model.GameLaunch

@Composable
fun LessonRoute(lessonId: String, onPractice: (GameLaunch.Practice) -> Unit, onBack: () -> Unit) {
    val model: LearningViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(lessonId, model) { model.open(lessonId) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.checkDataset() }

    LessonScreen(
        // A shared preloaded directory must never appear as an initialized lesson interaction.
        state = if (state.lessonId ==
            lessonId
        ) {
            state
        } else {
            LearningUiState(lessonId = lessonId, directory = state.directory)
        },
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
