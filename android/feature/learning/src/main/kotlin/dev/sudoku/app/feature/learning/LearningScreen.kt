package dev.sudoku.app.feature.learning

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sudoku.app.design.rememberDelayedProgress
import dev.sudoku.app.designsystem.VariantSelection
import dev.sudoku.app.designsystem.shortVariantLabel as courseLabel
import dev.sudoku.app.model.Variant

@Composable
internal fun LearningScreen(
    state: LearningDirectoryState,
    onVariant: (Variant) -> Unit,
    onOpenLesson: (String) -> Unit,
    onRetry: () -> Unit
) {
    val showLoading = rememberDelayedProgress(state.loading)
    val overview = state.overview()

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            Modifier.widthIn(max = 640.dp).fillMaxSize().testTag("learning-courses"),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 24.dp)
        ) {
            item(key = "overview") {
                LearningHeading(overview, progressReady = state.epoch != null)
                Spacer(Modifier.height(22.dp))
                VariantSelection(state.selectedVariant, onVariant)
                Spacer(Modifier.height(18.dp))
            }
            if (state.error != null) {
                item(key = "error") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(state.error, color = MaterialTheme.colorScheme.error)
                        OutlinedButton(onClick = onRetry) { Text("重新读取课程") }
                    }
                }
            }
            item(key = "suggested") {
                LearningSuggestion(
                    overview.lessons.map { it.lesson },
                    overview.suggested,
                    overview.courseCompleted,
                    onOpenLesson
                )
                Spacer(Modifier.height(24.dp))
            }
            item(key = "course-heading") {
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "${courseLabel(state.selectedVariant)}课程",
                        Modifier.weight(1f).semantics { heading() },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        if (state.epoch == null) {
                            "— / ${overview.lessons.size}"
                        } else {
                            "已完成 ${overview.courseCompleted} / ${overview.lessons.size}"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            itemsIndexed(overview.lessons, key = { _, entry -> entry.lesson.id }) { index, entry ->
                LessonRow(
                    entry,
                    suggested = entry.lesson.id == overview.suggested?.lesson?.id,
                    first = index == 0,
                    last = index == overview.lessons.lastIndex,
                    onOpen = { onOpenLesson(entry.lesson.id) }
                )
            }
            item(key = "footer") {
                Box(Modifier.fillMaxWidth().padding(top = 16.dp), contentAlignment = Alignment.Center) {
                    Text(
                        "课程自由选择，学过的也可以随时复习",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
private fun LearningHeading(overview: LearningOverview, progressReady: Boolean) {
    val colors = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            "每一步，都有理由。",
            Modifier.semantics { heading() },
            fontSize = 25.sp,
            lineHeight = 34.sp,
            fontWeight = FontWeight.SemiBold
        )
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val courseCount = "${overview.totalCount} 节互动课程"
            val separator = if (LocalDensity.current.fontScale > 1.3f) "\n" else "，"
            Text(
                "${courseCount}${separator}按自己的节奏来",
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant
            )
            Box(contentAlignment = Alignment.CenterEnd) {
                // Reserve the full counter width before personal progress arrives, including
                // two-digit completion counts, without exposing a fictitious zero to the player.
                Text(
                    "${overview.totalCount} / ${overview.totalCount}",
                    Modifier.alpha(0f).clearAndSetSemantics {},
                    style = MaterialTheme.typography.labelLarge
                )
                if (progressReady) {
                    Text(
                        "${overview.completedCount} / ${overview.totalCount}",
                        color = colors.primary,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
        LinearProgressIndicator(
            progress = {
                if (overview.totalCount == 0) {
                    0f
                } else {
                    (overview.completedCount ?: 0).toFloat() / overview.totalCount
                }
            },
            modifier = Modifier.fillMaxWidth().height(4.dp)
                .alpha(if (progressReady) 1f else 0f)
                .then(
                    if (progressReady) {
                        Modifier.semantics { contentDescription = "全部课程学习进度" }
                    } else {
                        Modifier.clearAndSetSemantics {}
                    }
                ),
            trackColor = colors.onSurface.copy(alpha = 0.08f),
            gapSize = 0.dp,
            drawStopIndicator = {}
        )
    }
}

@Composable
private fun LessonRow(
    entry: LearningLessonEntry,
    suggested: Boolean,
    first: Boolean,
    last: Boolean,
    onOpen: () -> Unit
) {
    val colors = MaterialTheme.colorScheme
    val status = when {
        entry.status is LessonProgressStatus.Unknown -> "进度待确认"
        entry.completed -> "已掌握"
        entry.inProgress -> "学习中"
        else -> "未开始"
    }
    val topRadius = if (first) 18.dp else 0.dp
    val bottomRadius = if (last) 18.dp else 0.dp
    Surface(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth().testTag("lesson-${entry.lesson.id}").semantics { stateDescription = status },
        shape = RoundedCornerShape(topRadius, topRadius, bottomRadius, bottomRadius),
        color = colors.surface
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 76.dp).padding(horizontal = 14.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    Modifier.size(30.dp).clearAndSetSemantics {},
                    shape = CircleShape,
                    color = when {
                        entry.completed -> colors.primaryContainer
                        suggested -> colors.primary
                        else -> colors.surfaceVariant
                    }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (entry.completed) {
                            Icon(Icons.Outlined.Check, null, Modifier.size(16.dp), tint = colors.primary)
                        } else {
                            Text(
                                entry.number.toString().padStart(2, '0'),
                                style = MaterialTheme.typography.labelMedium,
                                color = if (suggested) colors.onPrimary else colors.onSurfaceVariant
                            )
                        }
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            entry.lesson.title,
                            Modifier.weight(1f, fill = false),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (entry.completed || entry.inProgress) {
                            Text(status, color = colors.primary, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    Text(
                        entry.lesson.introduction,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Icon(
                    Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    null,
                    Modifier.size(18.dp),
                    tint = colors.onSurfaceVariant
                )
            }
            if (!last) {
                HorizontalDivider(
                    Modifier.padding(start = 56.dp, end = 16.dp),
                    color = colors.onSurface.copy(alpha = 0.08f)
                )
            }
        }
    }
}
