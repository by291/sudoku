package dev.yigeyinian.sudoku.game

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
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
import dev.yigeyinian.sudoku.designsystem.difficultyLabel
import dev.yigeyinian.sudoku.designsystem.formatElapsedTime
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.GameMode
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.variant

@Composable
fun HomeRoute(onPlay: (GameLaunch) -> Unit, onLearning: () -> Unit, onDaily: () -> Unit, onRecords: () -> Unit) {
    val model: GameEntryViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    var setup by rememberSaveable { mutableStateOf(false) }
    var continueOpen by rememberSaveable { mutableStateOf(false) }
    val saves = state.sessions.filter { it.session.completion == null }

    LaunchedEffect(model) { model.refresh() }

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
        onDaily = onDaily,
        onRecords = onRecords,
        onRetry = model::refresh
    )

    if (setup) {
        GameSetupDialog(state.sessions, onDismiss = { setup = false }, onPlay = {
            setup = false
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

@Composable
private fun GameSetupDialog(sessions: List<SessionRecord>, onDismiss: () -> Unit, onPlay: (GameLaunch) -> Unit) {
    var variant by rememberSaveable { mutableStateOf(Variant.CLASSIC) }
    var difficulty by rememberSaveable { mutableStateOf(Difficulty.EASY) }
    val saved = sessions.firstOrNull { it.session.mode == GameMode.FREE && it.session.puzzle.rules.variant == variant }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("开始新对局") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Variant.entries.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { choice ->
                            FilterChip(selected = variant == choice, onClick = {
                                variant = choice
                                if (difficulty !in choice.difficulties) difficulty = Difficulty.EASY
                            }, label = { Text(variantLabel(choice)) })
                        }
                    }
                }
                Text("难度", style = MaterialTheme.typography.titleSmall)
                variant.difficulties.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { choice ->
                            FilterChip(selected = difficulty == choice, onClick = {
                                difficulty = choice
                            }, label = { Text(difficultyLabel(choice)) })
                        }
                    }
                }
                if (saved != null) {
                    Text("此类型已有存档。开始新对局会替换它，已完成记录会保留。")
                    OutlinedButton(onClick = {
                        onPlay(GameLaunch.Resume(saved.session.id))
                    }, Modifier.fillMaxWidth()) { Text("继续存档") }
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        confirmButton = { Button(onClick = { onPlay(GameLaunch.Free(variant, difficulty)) }) { Text("开始新对局") } }
    )
}
