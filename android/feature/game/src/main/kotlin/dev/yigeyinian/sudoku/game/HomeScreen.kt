package dev.yigeyinian.sudoku.game

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.yigeyinian.sudoku.design.rememberDelayedProgress

/** Home owns the entry hierarchy; setup, resume selection, and navigation stay in the route. */
@Composable
internal fun HomeScreen(
    state: GameEntryUiState,
    hasSaves: Boolean,
    onStart: () -> Unit,
    onContinue: () -> Unit,
    onLearning: () -> Unit,
    onDaily: () -> Unit,
    onRecords: () -> Unit,
    onRetry: () -> Unit
) {
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        val availableHeight = maxHeight
        val wide = maxWidth >= 840.dp || (maxWidth >= 600.dp && availableHeight < 400.dp)
        val short = availableHeight < 600.dp
        val largeText = LocalDensity.current.fontScale > 1.3f
        val gutter = if (wide) 40.dp else 20.dp

        Column(
            Modifier.widthIn(max = 1040.dp).fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .heightIn(min = availableHeight)
                .padding(
                    start = gutter,
                    end = gutter,
                    top = if (wide) 12.dp else 8.dp,
                    bottom = 12.dp
                ),
            // Split spare vertical space 40/60 so the group sits slightly above center.
            verticalArrangement = Arrangement.spacedBy(16.dp, BiasAlignment.Vertical(-0.2f))
        ) {
            if (wide) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(32.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    HomeHero(
                        state, hasSaves, onStart, onContinue, onRetry, largeText, short,
                        showDescription = availableHeight >= 400.dp,
                        modifier = Modifier.weight(1.2f)
                    )
                    HomeDestinations(state, onLearning, onDaily, onRecords, !short || largeText, Modifier.weight(1f))
                }
            } else {
                HomeHero(
                    state,
                    hasSaves,
                    onStart,
                    onContinue,
                    onRetry,
                    largeText,
                    short
                )
                HomeDestinations(state, onLearning, onDaily, onRecords, largeText)
            }
        }
    }
}

@Composable
private fun HomeHero(
    state: GameEntryUiState,
    hasSaves: Boolean,
    onStart: () -> Unit,
    onContinue: () -> Unit,
    onRetry: () -> Unit,
    largeText: Boolean,
    short: Boolean,
    showDescription: Boolean = true,
    modifier: Modifier = Modifier
) {
    val colors = MaterialTheme.colorScheme
    // Refreshing an existing snapshot must not replace the home actions beneath a sheet.
    val showLoading = rememberDelayedProgress(state.loading && !state.hasLoadedSnapshot)

    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), color = colors.primaryContainer) {
        Column(
            Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val copyMaxWidth = maxWidth * 0.65f

                Row(
                    Modifier.fillMaxWidth().heightIn(min = if (short) 0.dp else 192.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Column(
                        Modifier.widthIn(max = copyMaxWidth),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            "一点逻辑 · 一点耐心",
                            color = colors.primary,
                            fontSize = 12.sp,
                            lineHeight = 20.sp,
                            letterSpacing = 1.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            "一格一念，\n慢慢解开。",
                            Modifier.semantics { heading() },
                            color = colors.onPrimaryContainer,
                            fontSize = 26.sp,
                            lineHeight = 38.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (showDescription) {
                            Text(
                                "六种玩法，\n按自己的节奏来。",
                                color = colors.onSurfaceVariant,
                                fontSize = 13.sp,
                                lineHeight = 20.sp
                            )
                        }
                    }
                    // Natural-width copy leaves spare width for the artwork instead of an empty text column.
                    HomeBoardArtwork(
                        Modifier.weight(1f, fill = false)
                            .widthIn(max = if (showDescription) 280.dp else 112.dp)
                            .aspectRatio(1f)
                    )
                }
            }

            when {
                state.error != null -> Column {
                    Text(state.error, color = colors.error, style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = onRetry) { Text("重新读取存档") }
                }
                largeText -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    StartButton(onStart, Modifier.fillMaxWidth(), enabled = !state.loading, showLoading = showLoading)
                    if (hasSaves) {
                        ContinueButton(onContinue, Modifier.fillMaxWidth(), enabled = !state.loading)
                    }
                }
                else -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StartButton(onStart, Modifier.weight(1f), enabled = !state.loading, showLoading = showLoading)
                    if (hasSaves) {
                        ContinueButton(onContinue, enabled = !state.loading)
                    }
                }
            }
        }
    }
}

@Composable
private fun StartButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    showLoading: Boolean = false
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 52.dp),
        shape = RoundedCornerShape(14.dp),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        colors = ButtonDefaults.buttonColors(
            disabledContainerColor = MaterialTheme.colorScheme.primary,
            disabledContentColor = MaterialTheme.colorScheme.onPrimary
        )
    ) {
        Text(
            if (showLoading) "正在读取存档…" else "开始数独",
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(Modifier.width(8.dp))
        if (showLoading) {
            CircularProgressIndicator(
                Modifier.size(18.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.dp
            )
        } else {
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(18.dp))
        }
    }
}

@Composable
private fun ContinueButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 52.dp),
        shape = RoundedCornerShape(14.dp),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.secondary,
            contentColor = MaterialTheme.colorScheme.onSecondary,
            disabledContainerColor = MaterialTheme.colorScheme.secondary,
            disabledContentColor = MaterialTheme.colorScheme.onSecondary
        )
    ) { Text("继续上次", style = MaterialTheme.typography.titleSmall) }
}

@Composable
private fun HomeDestinations(
    state: GameEntryUiState,
    onLearning: () -> Unit,
    onDaily: () -> Unit,
    onRecords: () -> Unit,
    stacked: Boolean,
    modifier: Modifier = Modifier
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "换一种节奏",
            Modifier.padding(start = 4.dp).semantics { heading() },
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (stacked) {
            SecondaryEntry("每日挑战", "每天一道新的灵感", Icons.Outlined.CalendarMonth, onDaily)
            SecondaryEntry("学习数独", "32 节课，步步有解", Icons.AutoMirrored.Outlined.MenuBook, onLearning)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SecondaryEntry("每日挑战", "每天一道新题", Icons.Outlined.CalendarMonth, onDaily, Modifier.weight(1f))
                SecondaryEntry(
                    "学习数独",
                    "32 节推理小课",
                    Icons.AutoMirrored.Outlined.MenuBook,
                    onLearning,
                    Modifier.weight(1f)
                )
            }
        }

        Card(
            onClick = onRecords,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Outlined.BarChart, null, tint = MaterialTheme.colorScheme.primary)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("我的记录", style = MaterialTheme.typography.titleSmall)
                    val description = if ((state.loading && !state.hasLoadedSnapshot) || state.error != null) {
                        "成绩统计 · 本地备份"
                    } else if (state.results.isEmpty()) {
                        "收藏每一次进步"
                    } else {
                        "已完成 ${state.results.size} 局 · 回顾与备份"
                    }
                    Text(
                        description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.Outlined.ChevronRight,
                    null,
                    Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun SecondaryEntry(
    title: String,
    description: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = MaterialTheme.colorScheme

    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = colors.surface),
        border = BorderStroke(1.dp, colors.outline.copy(alpha = 0.18f))
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(icon, null, Modifier.size(24.dp), tint = colors.primary)
                Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp), tint = colors.onSurfaceVariant)
            }
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(description, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        }
    }
}
