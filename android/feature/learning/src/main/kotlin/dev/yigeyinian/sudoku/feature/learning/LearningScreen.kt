package dev.yigeyinian.sudoku.feature.learning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.yigeyinian.sudoku.design.rememberDelayedProgress
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.Variant

@Composable
internal fun LearningScreen(
    state: LearningUiState,
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
                LearningHeading(overview, progressReady = state.catalogue != null)
                Spacer(Modifier.height(22.dp))
                CourseChoices(state.selectedVariant, onVariant)
                Spacer(Modifier.height(18.dp))
            }
            when {
                state.loading -> if (showLoading) {
                    item(key = "loading") {
                        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(Modifier.semantics { contentDescription = "正在读取课程" })
                        }
                    }
                }
                state.error != null -> item(key = "error") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(state.error, color = MaterialTheme.colorScheme.error)
                        OutlinedButton(onClick = onRetry) { Text("重新读取课程") }
                    }
                }
                else -> {
                    overview.suggested?.let { suggested ->
                        item(key = "suggested") {
                            SuggestedLesson(suggested, overview.courseCompleted) { onOpenLesson(suggested.lesson.id) }
                            Spacer(Modifier.height(24.dp))
                        }
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
                                "已完成 ${overview.courseCompleted} / ${overview.lessons.size}",
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
                if (overview.totalCount ==
                    0
                ) {
                    0f
                } else {
                    overview.completedCount.toFloat() / overview.totalCount
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
private fun CourseChoices(selected: Variant, onSelect: (Variant) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val fontScale = LocalDensity.current.fontScale
    BoxWithConstraints {
        val columns = when {
            maxWidth < 240.dp && fontScale > 1.5f -> 1
            fontScale > 1.3f || maxWidth < 280.dp -> 2
            else -> 3
        }
        Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Variant.entries.chunked(columns).forEach { choices ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    choices.forEach { choice ->
                        val isSelected = choice == selected
                        Surface(
                            Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) colors.primaryContainer else colors.surface,
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) {
                                    colors.primary.copy(
                                        alpha = 0.5f
                                    )
                                } else {
                                    colors.onSurface.copy(alpha = 0.1f)
                                }
                            )
                        ) {
                            Row(
                                Modifier.selectable(isSelected, role = Role.RadioButton, onClick = { onSelect(choice) })
                                    .semantics { contentDescription = variantLabel(choice) }
                                    .heightIn(min = 48.dp).padding(horizontal = 8.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (isSelected) {
                                    Icon(Icons.Outlined.Check, null, Modifier.size(14.dp), tint = colors.primary)
                                }
                                Text(
                                    courseLabel(choice),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                    color = if (isSelected) colors.primary else colors.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestedLesson(entry: LearningLessonEntry, courseCompleted: Int, onOpen: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val action = when {
        entry.completed -> "复习课程"
        entry.inProgress -> "继续学习"
        courseCompleted > 0 -> "学习下一节"
        else -> "开始学习"
    }
    val caption = when {
        entry.completed -> "全部学完了，再巩固一次"
        entry.inProgress -> "接着上次的思路"
        courseCompleted > 0 -> "下一步，试试这节课"
        else -> "推荐从这里开始"
    }
    Surface(
        Modifier.fillMaxWidth().testTag("suggested-lesson"),
        shape = RoundedCornerShape(20.dp),
        color = colors.primaryContainer
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(caption, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = colors.primary)
                Text(
                    if (entry.inProgress) {
                        "第 ${entry.stageIndex + 1} / ${entry.lesson.stages.size} 阶段"
                    } else {
                        "第 ${entry.number} 节"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.onSurfaceVariant
                )
            }
            Text(entry.lesson.title, fontSize = 22.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold)
            Text(
                entry.lesson.introduction,
                style = MaterialTheme.typography.bodyMedium,
                color = colors.onSurfaceVariant,
                maxLines = if (LocalDensity.current.fontScale > 1.3f) Int.MAX_VALUE else 2,
                overflow = TextOverflow.Ellipsis
            )
            Button(
                onClick = onOpen,
                modifier = Modifier.fillMaxWidth().heightIn(
                    min = 48.dp
                ).padding(top = 4.dp).testTag("suggested-lesson-action"),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Text(action, style = MaterialTheme.typography.titleSmall)
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.padding(start = 10.dp).size(20.dp))
            }
        }
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

private fun courseLabel(variant: Variant): String = when (variant) {
    Variant.CLASSIC -> "标准"
    Variant.DIAGONAL -> "对角线"
    Variant.JIGSAW -> "不规则"
    Variant.KILLER -> "杀手"
    Variant.THERMO -> "温度计"
    Variant.ARROW -> "箭头"
}
