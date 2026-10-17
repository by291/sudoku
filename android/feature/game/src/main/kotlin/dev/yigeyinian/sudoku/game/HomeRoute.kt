package dev.yigeyinian.sudoku.game

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.designsystem.formatElapsedTime
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.variant
import kotlinx.coroutines.delay

@Composable
fun HomeRoute(onPlay: (GameLaunch) -> Unit, onLearning: () -> Unit, onRecords: () -> Unit) {
    val model: GameEntryViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    var setup by rememberSaveable { mutableStateOf(false) }
    var dailyOpen by rememberSaveable { mutableStateOf(false) }
    var continueOpen by rememberSaveable { mutableStateOf(false) }
    val saves = state.sessions.filter { it.session.completion == null }

    LaunchedEffect(model) { model.refresh() }

    LaunchedEffect(dailyOpen) {
        if (dailyOpen) {
            while (true) {
                model.refresh()
                delay(60_000)
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
        onDaily = { dailyOpen = true },
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
        AlertDialog(
            onDismissRequest = { continueOpen = false },
            title = { Text("继续存档") },
            text = {
                Column(
                    Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    saves.forEach { record ->
                        OutlinedButton(onClick = {
                            continueOpen = false
                            onPlay(GameLaunch.Resume(record.session.id))
                        }, Modifier.fillMaxWidth()) {
                            Text(
                                "${variantLabel(
                                    record.session.puzzle.rules.variant
                                )} · ${formatElapsedTime(record.session.elapsedMs)}"
                            )
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { continueOpen = false }) { Text("取消") } }
        )
    }
}
