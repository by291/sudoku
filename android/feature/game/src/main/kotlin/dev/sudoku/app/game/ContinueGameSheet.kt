package dev.sudoku.app.game

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sudoku.app.design.rememberDelayedProgress
import dev.sudoku.app.model.SummaryItem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
internal fun ContinueGameSheet(
    saves: List<SummaryItem>,
    onDismiss: () -> Unit,
    onResume: (String) -> Unit,
    loading: Boolean = false,
    error: String? = null,
    hasMore: Boolean = false,
    onMore: () -> Unit = {},
    onRetry: () -> Unit = {}
) {
    val zone = ZoneId.systemDefault()
    val currentYear = LocalDate.now(zone).year
    val showLoading = rememberDelayedProgress(loading)
    GameEntrySheet(
        title = "继续存档",
        onDismiss = onDismiss,
        expandable = true,
        fitContent = !hasMore && (saves.isNotEmpty() || !loading)
    ) { entranceFinished ->
        val presentation =
            rememberEntryPresentation(SaveListPresentation(saves, loading, error, hasMore), entranceFinished)
        val content = when {
            presentation.saves.isNotEmpty() -> SaveListContent.RECORDS
            presentation.error != null -> SaveListContent.ERROR
            presentation.loading -> SaveListContent.LOADING
            else -> SaveListContent.EMPTY
        }
        // Wrap the measured rows so the shell can fit short results. Long lists remain bounded
        // by the window and keep Material's nested scrolling and full-screen expansion.
        AnimatedContent(
            targetState = content,
            modifier = Modifier.weight(1f, fill = false).fillMaxWidth().testTag("continue-viewport"),
            transitionSpec = {
                // Outgoing skeletons must not determine the incoming list's measured height.
                // The shell animates that height while these two contents fade together.
                (
                    fadeIn(tween(ENTRY_CONTENT_TRANSITION_MILLIS)) togetherWith
                        fadeOut(tween(ENTRY_CONTENT_TRANSITION_MILLIS))
                    )
                    .using(SizeTransform(clip = false) { _, _ -> snap() })
            },
            label = "Saved games content"
        ) { visibleContent ->
            when (visibleContent) {
                SaveListContent.LOADING -> SaveListSkeleton()
                SaveListContent.ERROR -> Column(
                    Modifier.fillMaxWidth().padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Top
                ) {
                    Text(presentation.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = onRetry) { Text("重新读取") }
                }
                SaveListContent.EMPTY -> Box(
                    Modifier.fillMaxWidth().padding(20.dp),
                    contentAlignment = Alignment.TopCenter
                ) {
                    Text("暂无未完成的存档", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                SaveListContent.RECORDS -> LazyColumn(
                    Modifier.fillMaxWidth().testTag("continue-saves"),
                    contentPadding = PaddingValues(bottom = 20.dp)
                ) {
                    itemsIndexed(presentation.saves, key = { _, session -> session.id }) { index, session ->
                        val summary = remember(session, zone, currentYear) {
                            session.summary?.savedGameSummary(zone, currentYear)
                                ?: SavedGameSummary("待确认的存档", "", "本机存档", null, "点按读取对局", "")
                        }
                        if (index > 0) {
                            HorizontalDivider(
                                Modifier.padding(horizontal = 20.dp),
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                            )
                        }
                        SavedGameRow(summary, session.id, first = index == 0, onResume = { onResume(session.id) })
                    }
                    item(key = "list-status") {
                        // Pagination and errors stay after the rows. A background refresh must not
                        // grow a compact sheet just to display a transient loading label.
                        when {
                            presentation.error != null -> TextButton(onClick = onRetry) { Text(presentation.error) }
                            presentation.hasMore -> TextButton(onClick = onMore, enabled = !loading) {
                                Text(if (showLoading) "正在读取…" else "加载更多")
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class SaveListPresentation(
    val saves: List<SummaryItem>,
    val loading: Boolean,
    val error: String?,
    val hasMore: Boolean
)

private enum class SaveListContent { LOADING, RECORDS, ERROR, EMPTY }

@Composable
private fun SavedGameRow(summary: SavedGameSummary, id: String, first: Boolean, onResume: () -> Unit) {
    Surface(
        onClick = onResume,
        modifier = Modifier.fillMaxWidth().testTag("continue-save-$id").semantics { role = Role.Button },
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(
            Modifier.fillMaxWidth().padding(
                start = 20.dp,
                end = 20.dp,
                top = if (first) 0.dp else 18.dp,
                bottom = 18.dp
            ),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FlowRow(
                    Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        summary.title,
                        Modifier.align(Alignment.CenterVertically),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        summary.difficulty,
                        Modifier.align(Alignment.CenterVertically),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowForward,
                    null,
                    Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(5.dp),
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.align(Alignment.CenterVertically)
                ) {
                    Text(
                        summary.source,
                        Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                summary.sourceDetail?.let {
                    Text(
                        it,
                        Modifier.align(Alignment.CenterVertically),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            FlowRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    summary.progress,
                    Modifier.padding(end = 8.dp).align(Alignment.CenterVertically),
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    summary.startedAt,
                    Modifier.align(Alignment.CenterVertically),
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
