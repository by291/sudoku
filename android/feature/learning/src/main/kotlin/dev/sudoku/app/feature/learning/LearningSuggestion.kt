package dev.sudoku.app.feature.learning

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.constrainHeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sudoku.app.model.learning.LessonDirectoryEntry

/** Reserves the current course's largest authored card, independently of unknown personal progress. */
@Composable
internal fun LearningSuggestion(
    course: List<LessonDirectoryEntry>,
    suggested: LearningLessonEntry?,
    courseCompleted: Int?,
    onOpen: (String) -> Unit
) {
    Layout(
        modifier = Modifier.fillMaxWidth(),
        content = {
            course.forEachIndexed { index, lesson ->
                SuggestionSizing(lesson, number = index + 1)
            }
            if (suggested != null) {
                SuggestedLesson(suggested, checkNotNull(courseCompleted)) { onOpen(suggested.lesson.id) }
            }
        }
    ) { measurables, constraints ->
        val sizingConstraints = constraints.copy(minHeight = 0)
        val reservedHeight = measurables.take(course.size).maxOfOrNull {
            it.measure(sizingConstraints).height
        } ?: 0
        val height = constraints.constrainHeight(reservedHeight)
        val card = measurables.getOrNull(course.size)?.measure(
            constraints.copy(minHeight = height, maxHeight = height)
        )

        // Sizing children have neither actions nor personal facts and are never placed.
        // Known and unknown states use the same measured region, including at enlarged font sizes.
        layout(constraints.maxWidth, height) { card?.placeRelative(0, 0) }
    }
}

@Composable
private fun SuggestionSizing(lesson: LessonDirectoryEntry, number: Int) {
    SuggestionBody(
        lesson,
        modifier = Modifier.clearAndSetSemantics {},
        header = {
            LargestSuggestionSlot {
                val stageLabels = listOf("第 $number 节") + (1..lesson.stageCount).map {
                    "第 $it / ${lesson.stageCount} 阶段"
                }
                SUGGESTION_CAPTIONS.forEach { caption ->
                    stageLabels.forEach { stage -> SuggestionHeader(caption, stage) }
                }
            }
        },
        action = {
            LargestSuggestionSlot {
                SUGGESTION_ACTIONS.forEach { label ->
                    // Match Material3 1.4.0 Button's documented minimum and content layout,
                    // using only noninteractive layout nodes rather than hidden/focusable controls.
                    Box(suggestionActionModifier().minimumInteractiveComponentSize(), propagateMinConstraints = true) {
                        Row(
                            Modifier.defaultMinSize(ButtonDefaults.MinWidth, ButtonDefaults.MinHeight)
                                .padding(SUGGESTION_ACTION_PADDING),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            SuggestionActionContent(label)
                        }
                    }
                }
            }
        }
    )
}

/** Measures alternatives once each; only the real recommendation is placed by the outer layout. */
@Composable
private fun LargestSuggestionSlot(content: @Composable () -> Unit) {
    Layout(content = content) { measurables, constraints ->
        val alternatives = measurables.map { it.measure(constraints) }
        layout(alternatives.maxOfOrNull { it.width } ?: 0, alternatives.maxOfOrNull { it.height } ?: 0) {}
    }
}

@Composable
private fun SuggestedLesson(entry: LearningLessonEntry, courseCompleted: Int, onOpen: () -> Unit) {
    val action = when {
        entry.completed -> REVIEW_ACTION
        entry.inProgress -> CONTINUE_ACTION
        courseCompleted > 0 -> NEXT_LESSON_ACTION
        else -> START_ACTION
    }
    val caption = when {
        entry.completed -> REVIEW_CAPTION
        entry.inProgress -> CONTINUE_CAPTION
        courseCompleted > 0 -> NEXT_LESSON_CAPTION
        else -> START_CAPTION
    }
    val stage = if (entry.inProgress) {
        "第 ${checkNotNull(entry.stageIndex) + 1} / ${entry.lesson.stageCount} 阶段"
    } else {
        "第 ${entry.number} 节"
    }
    Surface(
        Modifier.fillMaxWidth().testTag("suggested-lesson"),
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.primaryContainer
    ) {
        SuggestionBody(
            entry.lesson,
            header = { SuggestionHeader(caption, stage) },
            action = {
                Button(
                    onClick = onOpen,
                    modifier = suggestionActionModifier().testTag("suggested-lesson-action"),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = SUGGESTION_ACTION_PADDING
                ) {
                    SuggestionActionContent(action)
                }
            }
        )
    }
}

@Composable
private fun SuggestionBody(
    lesson: LessonDirectoryEntry,
    modifier: Modifier = Modifier,
    header: @Composable () -> Unit,
    action: @Composable () -> Unit
) {
    Column(modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        header()
        Text(lesson.title, fontSize = 22.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold)
        Text(
            lesson.introduction,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = if (LocalDensity.current.fontScale > 1.3f) Int.MAX_VALUE else 2,
            overflow = TextOverflow.Ellipsis
        )
        action()
    }
}

@Composable
private fun SuggestionHeader(caption: String, stage: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            caption,
            Modifier.weight(1f),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )
        Text(stage, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun suggestionActionModifier() = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = 4.dp)

@Composable
private fun SuggestionActionContent(label: String) {
    Text(label, style = MaterialTheme.typography.titleSmall)
    Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.padding(start = 10.dp).size(20.dp))
}

private const val REVIEW_ACTION = "复习课程"
private const val CONTINUE_ACTION = "继续学习"
private const val NEXT_LESSON_ACTION = "学习下一节"
private const val START_ACTION = "开始学习"
private const val REVIEW_CAPTION = "全部学完了，再巩固一次"
private const val CONTINUE_CAPTION = "接着上次的思路"
private const val NEXT_LESSON_CAPTION = "下一步，试试这节课"
private const val START_CAPTION = "推荐从这里开始"
private val SUGGESTION_CAPTIONS = listOf(REVIEW_CAPTION, CONTINUE_CAPTION, NEXT_LESSON_CAPTION, START_CAPTION)
private val SUGGESTION_ACTIONS = listOf(REVIEW_ACTION, CONTINUE_ACTION, NEXT_LESSON_ACTION, START_ACTION)
private val SUGGESTION_ACTION_PADDING = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
