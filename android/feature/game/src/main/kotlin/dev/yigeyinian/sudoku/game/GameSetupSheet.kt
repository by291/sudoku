package dev.yigeyinian.sudoku.game

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.design.rememberDelayedProgress
import dev.yigeyinian.sudoku.designsystem.difficultyLabel
import dev.yigeyinian.sudoku.designsystem.formatElapsedTime
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.GameMode
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.dailyFormalId
import dev.yigeyinian.sudoku.model.variant

internal enum class DailyEntryStatus(val label: String) {
    NOT_STARTED("待开始"),
    IN_PROGRESS("进行中"),
    COMPLETED("已完成"),
    PENDING("待确认")
}

internal fun GameEntryUiState.dailyStatus(variant: Variant): DailyEntryStatus = when (daily[variant]) {
    dev.yigeyinian.sudoku.model.DailyStatus.COMPLETED -> DailyEntryStatus.COMPLETED
    dev.yigeyinian.sudoku.model.DailyStatus.IN_PROGRESS -> DailyEntryStatus.IN_PROGRESS
    dev.yigeyinian.sudoku.model.DailyStatus.NOT_STARTED -> DailyEntryStatus.NOT_STARTED
    else -> DailyEntryStatus.PENDING
}

/** Mobile entry keeps choices close to the primary action without navigating away from Home. */
@Composable
internal fun GameSetupSheet(
    state: GameEntryUiState,
    onDismiss: () -> Unit,
    onPlay: (GameLaunch) -> Unit,
    onRetry: () -> Unit,
    onLoad: (Boolean, Variant) -> Unit = { _, _ -> },
    daily: Boolean = false
) {
    var variant by rememberSaveable { mutableStateOf(Variant.CLASSIC) }
    var difficulty by rememberSaveable { mutableStateOf(Difficulty.EASY) }
    var rulesOpen by rememberSaveable { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(daily, variant) { onLoad(daily, variant) }
    val saved = state.freeSave?.takeIf { it.variant == variant && it.completion == null }
    val ready = !state.sheetLoading && state.sheetError == null && (daily || !state.freePending)
    val showLoading = rememberDelayedProgress(state.sheetLoading)
    val dailyStatus = state.dailyStatus(variant)
    val startLabel = if (daily) {
        when (dailyStatus) {
            DailyEntryStatus.COMPLETED -> "再次练习"
            DailyEntryStatus.IN_PROGRESS -> "继续今日挑战"
            DailyEntryStatus.NOT_STARTED, DailyEntryStatus.PENDING -> "开始今日挑战"
        }
    } else if (saved != null) {
        "开始新局"
    } else {
        "开始游戏"
    }

    GameEntrySheet(
        title = if (daily) "今日挑战" else "开始一局",
        subtitle = if (daily) "${state.today} · 中等难度" else null,
        onDismiss = onDismiss
    ) {
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "选择玩法",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                VariantOptions(variant, onSelect = {
                    variant = it
                    if (difficulty !in it.difficulties) {
                        difficulty = Difficulty.EASY
                    }
                }, status = if (daily) state::dailyStatus else null)
                Text(
                    variantSummary(variant),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (!daily) {
                DifficultyOptions(variant, difficulty, onSelect = { difficulty = it })
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val completed = Variant.entries.count { state.dailyStatus(it) == DailyEntryStatus.COMPLETED }
                    Text(
                        if (state.daily.size == Variant.entries.size &&
                            state.daily.values.none { it == dev.yigeyinian.sudoku.model.DailyStatus.PENDING }
                        ) {
                            "今日已完成 $completed / 6"
                        } else {
                            "今日已完成 — / 6"
                        },
                        Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    TextButton(onClick = { rulesOpen = true }) { Text("挑战规则") }
                }
                if (dailyStatus == DailyEntryStatus.COMPLETED) {
                    Text(
                        "正式成绩已保留，再次游玩记为练习。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (state.sheetError != null) {
                Text(
                    state.sheetError,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
                TextButton(onClick = { onLoad(daily, variant) }) { Text("重新读取") }
            }
            if (!daily && saved != null) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        onClick = { onPlay(GameLaunch.Resume(saved.id)) },
                        enabled = ready,
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("继续存档", style = MaterialTheme.typography.labelLarge)
                                Text(
                                    "${variantLabel(
                                        variant
                                    )} · ${difficultyLabel(saved.difficulty)} · " +
                                        formatElapsedTime(saved.elapsedMs),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Icon(
                                Icons.AutoMirrored.Outlined.ArrowForward,
                                null,
                                Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Text(
                        "开始新局会替换这份未完成存档。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(
                onClick = {
                    onPlay(if (daily) GameLaunch.Daily(variant, state.today) else GameLaunch.Free(variant, difficulty))
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                enabled = ready,
                shape = RoundedCornerShape(14.dp)
            ) { Text(if (showLoading) "读取中…" else startLabel) }
        }
    }
    if (rulesOpen) {
        AlertDialog(
            onDismissRequest = { rulesOpen = false },
            title = { Text("挑战规则") },
            text = {
                Text(
                    "北京时间每天 00:00 更新，每种玩法各有一道中等题。\n\n" +
                        "每种玩法每天一次正式成绩，保留累计用时与辅助记录。完成后重玩记为练习。\n\n" +
                        "题目当日完成计入连续挑战，跨日完成仍保留成绩。",
                    Modifier.verticalScroll(rememberScrollState())
                )
            },
            confirmButton = { TextButton(onClick = { rulesOpen = false }) { Text("知道了") } }
        )
    }
}

@Composable
private fun VariantOptions(selected: Variant, onSelect: (Variant) -> Unit, status: ((Variant) -> DailyEntryStatus)?) {
    BoxWithConstraints {
        val columns = if (LocalDensity.current.fontScale > 1.3f || maxWidth < 280.dp) 2 else 3
        Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Variant.entries.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { choice ->
                        val isSelected = selected == choice
                        Surface(
                            Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.primaryContainer
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant
                            }
                        ) {
                            Column(
                                Modifier.selectable(isSelected, role = Role.RadioButton, onClick = { onSelect(choice) })
                                    .semantics { contentDescription = variantLabel(choice) }
                                    .heightIn(min = 48.dp).padding(horizontal = 6.dp, vertical = 10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically)
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    if (isSelected) {
                                        Icon(
                                            Icons.Outlined.Check,
                                            null,
                                            Modifier.size(14.dp),
                                            tint = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                    Text(
                                        variantShortLabel(choice),
                                        style = MaterialTheme.typography.labelLarge,
                                        color = if (isSelected) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurface
                                        }
                                    )
                                }
                                if (status != null) {
                                    Text(
                                        status(choice).label,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DifficultyOptions(variant: Variant, selected: Difficulty, onSelect: (Difficulty) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("选择难度", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
            Row(Modifier.fillMaxWidth().padding(4.dp).selectableGroup()) {
                variant.difficulties.forEach { choice ->
                    val isSelected = selected == choice
                    Surface(
                        Modifier.weight(1f),
                        shape = RoundedCornerShape(9.dp),
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.surface
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                        shadowElevation = if (isSelected) 1.dp else 0.dp
                    ) {
                        Box(
                            Modifier.selectable(isSelected, role = Role.RadioButton, onClick = { onSelect(choice) })
                                .heightIn(min = 48.dp).padding(6.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                difficultyLabel(choice),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun variantShortLabel(variant: Variant): String = when (variant) {
    Variant.CLASSIC -> "标准"
    Variant.DIAGONAL -> "对角线"
    Variant.JIGSAW -> "不规则"
    Variant.KILLER -> "杀手"
    Variant.THERMO -> "温度计"
    Variant.ARROW -> "箭头"
}

private fun variantSummary(variant: Variant): String = when (variant) {
    Variant.CLASSIC -> "每行、每列和每个九宫格内，数字不能重复。"
    Variant.DIAGONAL -> "两条对角线内的数字也不能重复。"
    Variant.JIGSAW -> "用不规则区域替代九宫格，区域内数字不能重复。"
    Variant.KILLER -> "笼内数字不重复，总和等于标注数值。"
    Variant.THERMO -> "从圆球出发，数字沿温度计严格递增。"
    Variant.ARROW -> "箭杆上的数字之和，等于圆圈内的数字。"
}
