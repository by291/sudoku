package dev.yigeyinian.sudoku.game

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.model.GameLaunch
import kotlinx.coroutines.delay

@Composable
fun HomeRoute(onPlay: (GameLaunch) -> Unit, onLearning: () -> Unit, onRecords: () -> Unit) {
    val model: GameEntryViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    var setup by rememberSaveable { mutableStateOf(false) }
    var dailyOpen by rememberSaveable { mutableStateOf(false) }
    var continueOpen by rememberSaveable { mutableStateOf(false) }
    val saves = state.sessions.filter { it.session.completion == null }

    LaunchedEffect(model) { model.open() }

    LaunchedEffect(dailyOpen) {
        if (dailyOpen) {
            while (true) {
                delay(60_000)
                model.refresh()
            }
        }
    }

    HomeScreen(
        state = state,
        hasSaves = saves.isNotEmpty(),
        onStart = { setup = true },
        onContinue = {
            if (saves.size == 1) {
                onPlay(GameLaunch.Resume(saves.first().session.id))
            } else {
                continueOpen = true
            }
        },
        onLearning = onLearning,
        onDaily = {
            model.refreshIfDateChanged()
            dailyOpen = true
        },
        onRecords = onRecords,
        onRetry = model::refresh
    )

    if (setup) {
        GameSetupSheet(state, onRetry = model::refresh, onDismiss = { setup = false }, onPlay = {
            setup = false
            onPlay(it)
        })
    }
    if (dailyOpen) {
        GameSetupSheet(state, daily = true, onRetry = model::refresh, onDismiss = { dailyOpen = false }, onPlay = {
            dailyOpen = false
            onPlay(it)
        })
    }
    if (continueOpen) {
        ContinueGameSheet(
            saves = saves.map { it.session },
            onDismiss = { continueOpen = false },
            onResume = {
                continueOpen = false
                onPlay(GameLaunch.Resume(it))
            }
        )
    }
}
