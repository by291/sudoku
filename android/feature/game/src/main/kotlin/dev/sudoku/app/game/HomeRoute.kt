package dev.sudoku.app.game

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.sudoku.app.model.GameLaunch
import dev.sudoku.app.model.challengeDate
import dev.sudoku.app.model.challengeRefreshDelay
import java.time.Instant
import kotlinx.coroutines.delay

@Composable
fun HomeRoute(onPlay: (GameLaunch) -> Unit, onLearning: () -> Unit, onRecords: () -> Unit) {
    val model: GameEntryViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    var setup by rememberSaveable { mutableStateOf(false) }
    var dailyOpen by rememberSaveable { mutableStateOf(false) }
    var continueOpen by rememberSaveable { mutableStateOf(false) }
    val saves = state.saves

    LaunchedEffect(model) { model.open() }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (dailyOpen) model.loadSheet(true, dev.sudoku.app.model.Variant.CLASSIC)
    }
    LaunchedEffect(dailyOpen) {
        if (dailyOpen) {
            while (true) {
                delay(challengeRefreshDelay(Instant.now()))
                if (model.uiState.value.today != challengeDate(Instant.now())) {
                    model.loadSheet(true, dev.sudoku.app.model.Variant.CLASSIC)
                }
            }
        }
    }

    HomeScreen(
        state = state,
        hasSaves = state.hasSaves,
        onStart = { setup = true },
        onContinue = {
            val single = state.singleSaveId
            if (single != null) {
                onPlay(GameLaunch.Resume(single))
            } else {
                model.loadSaves()
                continueOpen = true
            }
        },
        onLearning = onLearning,
        onDaily = {
            dailyOpen = true
        },
        onRecords = onRecords,
        onRetry = model::refresh
    )

    if (setup) {
        GameSetupSheet(state, onLoad = model::loadSheet, onRetry = model::refresh, onDismiss = {
            setup = false
        }, onPlay = {
            setup = false
            onPlay(it)
        })
    }
    if (dailyOpen) {
        GameSetupSheet(state, daily = true, onLoad = model::loadSheet, onRetry = model::refresh, onDismiss = {
            dailyOpen =
                false
        }, onPlay = {
            if (it is GameLaunch.Daily && it.date != challengeDate(Instant.now())) {
                model.loadSheet(true, it.variant)
            } else {
                dailyOpen = false
                onPlay(it)
            }
        })
    }
    if (continueOpen) {
        ContinueGameSheet(
            saves = saves,
            loading = state.sheetLoading,
            error = state.sheetError,
            hasMore = state.next != null,
            onMore = { model.loadSaves(true) },
            onRetry = { model.loadSaves() },
            onDismiss = { continueOpen = false },
            onResume = {
                continueOpen = false
                onPlay(GameLaunch.Resume(it))
            }
        )
    }
}
