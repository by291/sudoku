package dev.yigeyinian.sudoku.game

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.dailyFormalId
import kotlinx.coroutines.delay

@Composable
fun DailyRoute(onPlay: (GameLaunch) -> Unit) {
    val model: GameEntryViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    var variant by rememberSaveable { mutableStateOf(Variant.CLASSIC) }

    LaunchedEffect(model) {
        while (true) {
            model.refresh()
            delay(60_000)
        }
    }

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("每日挑战", style = MaterialTheme.typography.headlineLarge)
        Text(state.today, style = MaterialTheme.typography.titleLarge)
        Text("北京时间每天 00:00 更新，每种类型各有一道中等难度题。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.loading && state.sessions.isEmpty()) {
            CircularProgressIndicator()
        } else if (state.error != null) {
            Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = model::refresh) { Text("重试") }
        } else {
            Variant.entries.forEach { choice ->
                val id = dailyFormalId(state.today, choice)
                val saved = state.sessions.firstOrNull { it.session.id == id }
                val completed = saved?.session?.completion != null || state.results.any { it.session.id == id }
                val status = if (completed) {
                    "已完成 · 可练习"
                } else if (saved != null) {
                    "进行中"
                } else {
                    "尚未开始"
                }
                FilterChip(
                    selected = variant == choice,
                    onClick = { variant = choice },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("${variantLabel(choice)}　$status", Modifier.padding(vertical = 8.dp)) }
                )
            }
            Button(onClick = {
                onPlay(GameLaunch.Daily(variant, state.today))
            }, Modifier.fillMaxWidth()) { Text("进入所选挑战") }
            Text("首次正式挑战保留累计用时与辅助记录；完成后再次游玩记为练习。仅在题目当日完成计入连续挑战。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
