package dev.sudoku.app.feature.records

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.GridOn
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sudoku.app.designsystem.difficultyLabel
import dev.sudoku.app.designsystem.formatElapsedTime
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.RecordSummary
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.Variant
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
internal fun RecordsOverview(variant: Variant, summary: RecordSummary?) {
    val colors = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(
            Modifier.testTag("records-streak"),
            shape = RoundedCornerShape(20.dp),
            color = colors.primaryContainer
        ) {
            Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Outlined.CalendarMonth, null, Modifier.size(18.dp), tint = colors.primary)
                    Text("每日挑战 · 当前连续", style = MaterialTheme.typography.labelLarge, color = colors.primary)
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        summary?.currentStreak?.toString() ?: "—",
                        fontSize = 44.sp,
                        lineHeight = 52.sp,
                        color = colors.primary
                    )
                    Text(" 天", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.weight(1f))
                    Text(
                        "最长 ${summary?.longestStreak ?: "—"} 天",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant
                    )
                }
                HorizontalDivider(color = colors.primary.copy(alpha = 0.15f))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    DailyTotal(summary?.dailyTotals?.unassisted, "未使用辅助", Modifier.weight(1f))
                    DailyTotal(summary?.dailyTotals?.assisted, "使用辅助", Modifier.weight(1f))
                }
            }
        }
        Spacer(Modifier.size(2.dp))
        RecordSectionHeading("最佳用时", "自由游玩 · ${recordVariantLabel(variant)}")
        Surface(
            modifier = Modifier.testTag("records-bests"),
            shape = RoundedCornerShape(18.dp),
            color = colors.surface,
            border = BorderStroke(1.dp, colors.onSurface.copy(alpha = 0.1f))
        ) {
            val fontScale = LocalDensity.current.fontScale
            BoxWithConstraints {
                val stacked = maxWidth < 280.dp || fontScale > 1.3f
                Column(Modifier.fillMaxWidth()) {
                    if (!stacked) {
                        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                            TableCell("难度", Modifier.weight(0.8f), TextAlign.Start)
                            TableCell("未使用辅助", Modifier.weight(1.1f), TextAlign.End)
                            TableCell("使用辅助", Modifier.weight(1.1f), TextAlign.End)
                        }
                    }
                    variant.difficulties.forEachIndexed { index, difficulty ->
                        if (index > 0 || !stacked) {
                            HorizontalDivider(color = colors.onSurface.copy(alpha = 0.08f))
                        }
                        val times = summary?.freeBests?.getValue(difficulty)
                        val unassisted = times?.unassisted?.let(::formatElapsedTime) ?: "—"
                        val assisted = times?.assisted?.let(::formatElapsedTime) ?: "—"
                        if (stacked) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(difficultyLabel(difficulty), style = MaterialTheme.typography.titleSmall)
                                BestTime("未使用辅助", unassisted)
                                BestTime("使用辅助", assisted)
                            }
                        } else {
                            Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                                Text(
                                    difficultyLabel(difficulty),
                                    Modifier.weight(0.8f),
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Text(
                                    unassisted,
                                    Modifier.weight(1.1f),
                                    textAlign = TextAlign.End,
                                    color = colors.primary,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Text(
                                    assisted,
                                    Modifier.weight(1.1f),
                                    textAlign = TextAlign.End,
                                    color = colors.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                    }
                }
            }
        }
        RecordCaption("每日挑战仅统计正式完成；学习实战不计入最佳用时。")
    }
}

@Composable
private fun DailyTotal(count: Int?, label: String, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text("${count ?: "—"} 局", style = MaterialTheme.typography.titleLarge)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun BestTime(label: String, time: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            label,
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(time, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun TableCell(text: String, modifier: Modifier, align: TextAlign) {
    Text(
        text,
        modifier,
        textAlign = align,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
internal fun RecordSectionHeading(title: String, detail: String) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            title,
            Modifier.weight(1f).semantics { heading() },
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun RecordCaption(text: String) {
    Text(
        text,
        Modifier.padding(top = 4.dp, bottom = 10.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
internal fun EmptyRecords(title: String, description: String) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                Box(Modifier.size(52.dp), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.GridOn, null, tint = MaterialTheme.colorScheme.primary)
                }
            }
            Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(
                description,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
internal fun FeaturedSave(session: GameSummary, enabled: Boolean, onResume: () -> Unit) {
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primaryContainer) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                Text("继续上次的思路", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            Text(recordTitle(session), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(
                "已用时 ${formatElapsedTime(session.elapsedMs)} · ${assistanceLabel(session)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                recordDate(session),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Button(
                onClick = onResume,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(14.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("继续对局")
                Spacer(Modifier.size(8.dp))
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(20.dp))
            }
        }
    }
}

@Composable
internal fun RecordEntry(session: GameSummary, enabled: Boolean, history: Boolean, onOpen: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val action = when {
        history -> "查看记录"
        session.completion != null -> "查看对局"
        else -> "继续对局"
    }
    Surface(
        onClick = onOpen,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = colors.surface,
        border = BorderStroke(1.dp, colors.onSurface.copy(alpha = 0.1f))
    ) {
        val stacked = LocalDensity.current.fontScale > 1.3f
        Row(
            Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (!stacked) {
                Surface(shape = RoundedCornerShape(12.dp), color = colors.primaryContainer) {
                    Box(Modifier.size(38.dp), contentAlignment = Alignment.Center) {
                        Icon(
                            if (session.mode ==
                                GameMode.DAILY
                            ) {
                                Icons.Outlined.CalendarMonth
                            } else if (history) {
                                Icons.Outlined.Check
                            } else {
                                Icons.Outlined.Schedule
                            },
                            null,
                            Modifier.size(20.dp),
                            tint = colors.primary
                        )
                    }
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(recordTitle(session), style = MaterialTheme.typography.titleSmall)
                Text(recordDetail(session), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                if (!history) {
                    Text(
                        recordDate(session),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant
                    )
                }
                if (stacked) {
                    Text(
                        "${formatElapsedTime(session.elapsedMs)} · $action",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.primary
                    )
                }
            }
            if (!stacked) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(formatElapsedTime(session.elapsedMs), style = MaterialTheme.typography.bodyLarge)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(action, style = MaterialTheme.typography.labelSmall, color = colors.primary)
                        Icon(
                            Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                            null,
                            Modifier.size(14.dp),
                            tint = colors.primary
                        )
                    }
                }
            }
        }
    }
}

private fun recordTitle(session: GameSummary): String {
    val mode = when (session.mode) {
        GameMode.FREE -> "自由游玩"
        GameMode.DAILY -> "每日挑战"
        GameMode.LEARNING -> "学习实战"
    }
    return "$mode · ${difficultyLabel(session.difficulty)}"
}

private fun assistanceLabel(session: GameSummary) = if (session.assisted) "使用辅助" else "未使用辅助"

private fun recordDetail(session: GameSummary): String {
    val daily = session.metadata as? SessionMetadata.Daily
    if (daily != null) {
        val attempt = if (daily.formalAttempt) "正式挑战" else "挑战练习"
        return "$attempt · ${assistanceLabel(session)}"
    }
    return assistanceLabel(session)
}

private fun recordDate(session: GameSummary): String {
    val daily = session.metadata as? SessionMetadata.Daily
    if (daily != null) {
        return "挑战日期 ${daily.challengeDate}"
    }
    return Instant.parse(session.completion?.completedAt ?: session.startedAt).atZone(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("M 月 d 日 HH:mm"))
}
