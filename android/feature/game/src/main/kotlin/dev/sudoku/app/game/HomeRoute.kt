package dev.sudoku.app.game

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.sudoku.app.model.GameLaunch
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import dev.sudoku.app.model.challengeRefreshDelay
import java.time.Instant
import kotlinx.coroutines.delay

@Composable
fun HomeRoute(onPlay: (GameLaunch) -> Unit, onLearning: () -> Unit, onRecords: () -> Unit) {
    val model: GameEntryViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    val dailyOpen = state.sheet == EntrySheet.Daily
    val saves = state.saves

    LaunchedEffect(model) { model.open() }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (dailyOpen) {
            model.loadSheet(true, Variant.CLASSIC)
        }
    }
    LaunchedEffect(dailyOpen) {
        if (dailyOpen) {
            while (true) {
                delay(challengeRefreshDelay(Instant.now()))
                if (model.uiState.value.today != challengeDate(Instant.now())) {
                    model.loadSheet(true, Variant.CLASSIC)
                }
            }
        }
    }

    HomeScreen(
        state = state,
        hasSaves = state.hasSaves,
        onStart = { model.showSetup(false) },
        onContinue = {
            val single = state.singleSaveId
            if (single != null) {
                onPlay(GameLaunch.Resume(single))
            } else {
                model.showContinue()
            }
        },
        onLearning = onLearning,
        onDaily = {
            model.showSetup(true)
        },
        onRecords = onRecords,
        onRetry = model::refresh
    )

    when (state.sheet) {
        is EntrySheet.Setup -> GameSetupSheet(
            state,
            onLoad = model::loadSheet,
            onDismiss = model::dismissSheet,
            onPlay = {
                model.dismissSheet()
                onPlay(it)
            }
        )
        EntrySheet.Daily -> GameSetupSheet(
            state,
            daily = true,
            onLoad = model::loadSheet,
            onDismiss = model::dismissSheet,
            onPlay = {
                if (it is GameLaunch.Daily && it.date != challengeDate(Instant.now())) {
                    model.loadSheet(true, it.variant)
                } else {
                    model.dismissSheet()
                    onPlay(it)
                }
            }
        )
        EntrySheet.Continue -> ContinueGameSheet(
            saves = saves,
            loading = state.sheetLoading,
            error = state.sheetError,
            hasMore = state.next != null,
            onMore = { model.loadSaves(true) },
            onRetry = { model.loadSaves() },
            onDismiss = model::dismissSheet,
            onResume = {
                model.dismissSheet()
                onPlay(GameLaunch.Resume(it))
            }
        )
        null -> Unit
    }
}
