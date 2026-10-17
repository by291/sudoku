package dev.yigeyinian.sudoku.feature.learning

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.design.rememberDelayedProgress
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.learning.Lesson

@Composable
fun LearningRoute(onOpenLesson: (String) -> Unit) {
    val model: LearningViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(model) { model.open() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.checkDataset() }

    LearningScreen(state, model::selectVariant, onOpenLesson, { model.open() })
}

@Composable
internal fun LearningScreen(
    state: LearningUiState,
    onVariant: (Variant) -> Unit,
    onOpenLesson: (String) -> Unit,
    onRetry: () -> Unit
) {
    val showLoading = rememberDelayedProgress(state.loading)
    val lessons = state.catalogue?.lessons.orEmpty()
    val completed = state.completedIds.intersect(lessons.map { it.id }.toSet())
    val course = lessons.filter { it.practiceVariant == state.selectedVariant }
    val courseCompleted = course.count { it.id in completed }

    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "每一步，都有理由。",
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.semantics {
                        heading()
                    }
                )
                Text("32 个课程单元 · 可以按自己的节奏自由选择", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("已完成 ${completed.size} / 32", style = MaterialTheme.typography.titleMedium)
                LinearProgressIndicator(progress = { completed.size / 32f }, modifier = Modifier.fillMaxWidth())
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(Variant.entries, key = { it.name }) { variant ->
                    FilterChip(selected = variant == state.selectedVariant, onClick = {
                        onVariant(variant)
                    }, label = { Text(variantLabel(variant)) })
                }
            }
        }
        if (state.loading) {
            if (showLoading) item { CircularProgressIndicator() }
        } else if (state.error != null) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = onRetry) { Text("重新读取课程") }
                }
            }
        } else {
            item {
                Text(
                    "${variantLabel(state.selectedVariant)} · 已完成 $courseCompleted / ${course.size}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                    }
                )
            }
            items(course, key = { it.id }) { lesson ->
                val cursor = state.settings.lessonStages?.get(lesson.id) ?: 0
                LessonCard(lesson, lessons.indexOf(lesson) + 1, lesson.id in completed, cursor, {
                    onOpenLesson(lesson.id)
                })
            }
        }
    }
}

@Composable
private fun LessonCard(lesson: Lesson, number: Int, completed: Boolean, stageIndex: Int, onOpen: () -> Unit) {
    val action = when {
        completed -> "复习课程"
        stageIndex > 0 -> "继续学习 · 第${stageIndex + 1}阶段"
        else -> "开始学习"
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "${number.toString().padStart(2, '0')} · ${lesson.title}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f)
                )
                if (completed) {
                    Text("已掌握", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                }
            }
            Text(
                lesson.introduction,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            TextButton(onClick = onOpen) { Text(action) }
        }
    }
}
