package dev.sudoku.app.feature.learning

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun LearningRoute(onOpenLesson: (String) -> Unit) {
    val model: LearningViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(model) { model.open() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.checkDataset() }

    LearningScreen(state, model::selectVariant, onOpenLesson, { model.open() })
}
