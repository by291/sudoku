package dev.yigeyinian.sudoku.feature.learning

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.designsystem.NumberPad
import dev.yigeyinian.sudoku.designsystem.SudokuBoard
import dev.yigeyinian.sudoku.designsystem.difficultyLabel
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.learning.ExerciseAnswer
import dev.yigeyinian.sudoku.model.learning.ExerciseStage

@Composable
fun LessonRoute(lessonId: String, onPractice: (GameLaunch.Practice) -> Unit, onBack: () -> Unit) {
    val model: LearningViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(lessonId, model) { model.open(lessonId) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.checkDataset() }

    LessonScreen(
        state = state,
        onCell = model::selectCell,
        onDigit = model::enterDigit,
        onSubmit = model::submit,
        onNext = model::nextStage,
        onStart = model::startExercise,
        onGuide = model::showGuide,
        onClear = model::clearAnswer,
        onPractice = onPractice,
        onBack = onBack,
        onRetry = { model.open(lessonId) }
    )
}

@Composable
internal fun LessonScreen(
    state: LearningUiState,
    onCell: (Int) -> Unit,
    onDigit: (Int) -> Unit,
    onSubmit: () -> Unit,
    onNext: () -> Unit,
    onStart: () -> Unit,
    onGuide: () -> Unit,
    onClear: () -> Unit,
    onPractice: (GameLaunch.Practice) -> Unit,
    onBack: () -> Unit,
    onRetry: () -> Unit
) {
    val lesson = state.lesson
    var zoomed by remember(state.lessonId) { mutableStateOf(false) }
    val stage = if (state.exerciseStarted) state.stage else lesson?.guided
    val digitKeys = remember {
        mapOf(
            Key.One to 1, Key.Two to 2, Key.Three to 3,
            Key.Four to 4, Key.Five to 5, Key.Six to 6,
            Key.Seven to 7, Key.Eight to 8, Key.Nine to 9,
            Key.NumPad1 to 1, Key.NumPad2 to 2, Key.NumPad3 to 3,
            Key.NumPad4 to 4, Key.NumPad5 to 5, Key.NumPad6 to 6,
            Key.NumPad7 to 7, Key.NumPad8 to 8, Key.NumPad9 to 9
        )
    }
    val keyboard = Modifier.onPreviewKeyEvent { event ->
        if (
            !state.exerciseStarted || state.busy || state.feedback?.correct == true ||
            event.type != KeyEventType.KeyDown || event.isCtrlPressed || event.isAltPressed || event.isMetaPressed
        ) {
            false
        } else {
            val digit = digitKeys[event.key]
            when {
                digit != null -> {
                    onDigit(digit)
                    true
                }
                event.key == Key.Backspace || event.key == Key.Delete -> {
                    onClear()
                    true
                }
                else -> false
            }
        }
    }

    Column(
        Modifier.fillMaxSize().then(keyboard).verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        TextButton(onClick = onBack, enabled = !state.busy) { Text("返回课程") }
        if (state.loading) {
            CircularProgressIndicator()
        } else if (lesson == null || stage == null) {
            Text(state.error ?: "找不到这节课程。", color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = onRetry) { Text("重新读取课程") }
        } else {
            Text(
                lesson.title,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() }
            )
            Text(
                "${variantLabel(lesson.practiceVariant)} · ${difficultyLabel(lesson.practiceDifficulty)}完整棋盘练习",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (state.exerciseStarted) {
                val index = state.cursor?.stageIndex ?: 0
                val focusedCount = lesson.exercises.first().stages.size
                val exerciseTitle = lesson.exercises[if (index < focusedCount) 0 else 1].title
                Text(
                    "$exerciseTitle · 第${index + 1} / ${lesson.stages.size}阶段",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.testTag("lesson-stage")
                )
            } else {
                Text(lesson.introduction, style = MaterialTheme.typography.bodyLarge)
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("示例讲解", style = MaterialTheme.typography.titleMedium)
                        Text(lesson.explanation, modifier = Modifier.testTag("lesson-explanation"))
                        Text(
                            "棋盘标记指出本例的推理依据，每格的无障碍说明包含所在规则。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val availableWidth = maxWidth
                if (availableWidth >= 720.dp) {
                    Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        LessonBoard(stage, state, onCell, Modifier.weight(1f).widthIn(max = 540.dp))
                        Column(Modifier.width(280.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            LessonActions(
                                state, onDigit, onSubmit, onNext, onStart, onGuide, onClear,
                                { zoomed = true }, onPractice
                            )
                        }
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        LessonBoard(stage, state, onCell, Modifier.fillMaxWidth().widthIn(max = 540.dp))
                        LessonActions(
                            state, onDigit, onSubmit, onNext, onStart, onGuide, onClear,
                            { zoomed = true }, onPractice
                        )
                    }
                }
            }
        }
    }

    if (zoomed && stage != null) {
        Dialog(onDismissRequest = { zoomed = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.systemBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("放大棋盘", style = MaterialTheme.typography.titleLarge)
                    Text("可以横向和纵向滚动；选择格子后关闭，继续输入答案。", style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { zoomed = false }) { Text("关闭放大棋盘") }
                    Box(
                        Modifier.weight(1f)
                            .horizontalScroll(rememberScrollState())
                            .verticalScroll(rememberScrollState())
                    ) {
                        LessonBoard(stage, state, onCell, Modifier.size(540.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun LessonBoard(stage: ExerciseStage, state: LearningUiState, onCell: (Int) -> Unit, modifier: Modifier) {
    val entries = List(81) { cell ->
        if (state.exerciseStarted && state.placement?.cell == cell) state.placement.digit else 0
    }
    val notes = if (state.exerciseStarted) {
        stage.candidates.mapIndexed { cell, mask ->
            state.removals.filter { it.cell == cell }.fold(mask) { visible, pair ->
                visible and (1 shl (pair.digit - 1)).inv()
            }
        }
    } else {
        stage.candidates
    }
    SudokuBoard(
        givens = stage.board,
        entries = entries,
        notes = notes,
        rules = stage.rules,
        selectedCell = if (state.exerciseStarted) state.selectedCell else null,
        onSelect = onCell,
        modifier = modifier,
        evidenceCells = stage.step.evidence.cells.toSet(),
        evidence = stage.step.evidence,
        enabled = state.exerciseStarted && !state.busy && state.feedback?.correct != true
    )
}

@Composable
private fun LessonActions(
    state: LearningUiState,
    onDigit: (Int) -> Unit,
    onSubmit: () -> Unit,
    onNext: () -> Unit,
    onStart: () -> Unit,
    onGuide: () -> Unit,
    onClear: () -> Unit,
    onZoom: () -> Unit,
    onPractice: (GameLaunch.Practice) -> Unit
) {
    val lesson = state.lesson ?: return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(onClick = onZoom, modifier = Modifier.fillMaxWidth(), enabled = !state.busy) { Text("放大棋盘") }
        if (state.exerciseStarted) {
            val elimination = state.stage?.answer is ExerciseAnswer.Eliminate
            val instruction = if (elimination) {
                "选择格子，再点数字标记要排除的候选数。再次点击可以撤回标记。"
            } else {
                "选择一个空格，再点数字填写你的判断。"
            }
            Text(instruction, style = MaterialTheme.typography.bodyMedium)
            if (state.removals.isNotEmpty()) {
                val marked = state.removals.sortedWith(compareBy({ it.cell }, { it.digit })).joinToString("；") {
                    "第${it.cell / 9 + 1}行第${it.cell % 9 + 1}列排除${it.digit}"
                }
                Text(marked, style = MaterialTheme.typography.bodySmall)
            }
            if (state.feedback?.correct != true) {
                NumberPad(
                    enabled = !state.busy && state.selectedCell != null,
                    noteMode = elimination,
                    onDigit = onDigit
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onClear, enabled = !state.busy, modifier = Modifier.weight(1f)) {
                        Text("清空答案")
                    }
                    Button(
                        onClick = onSubmit,
                        enabled = !state.busy,
                        modifier = Modifier.weight(1f).testTag("submit-answer")
                    ) { Text(if (state.busy) "正在保存…" else "提交答案") }
                }
            }
            state.feedback?.let { feedback ->
                Card(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (feedback.correct) "推理正确" else "再试一次", style = MaterialTheme.typography.titleMedium)
                        Text(feedback.explanation)
                        if (feedback.correct) {
                            Button(onClick = onNext, modifier = Modifier.fillMaxWidth().testTag("next-stage")) {
                                Text(if (feedback.completed) "课程已完成 · 再练一遍" else "下一阶段")
                            }
                        }
                    }
                }
            }
            TextButton(onClick = onGuide, enabled = !state.busy) { Text("查看课程讲解") }
        } else {
            val resume = (state.cursor?.stageIndex ?: 0) > 0
            val completed = lesson.id in state.completedIds
            val label = when {
                state.feedback != null -> "返回当前练习"
                resume -> "继续第${(state.cursor?.stageIndex ?: 0) + 1}阶段"
                completed -> "开始复习练习"
                else -> "开始课程练习"
            }
            Button(onClick = onStart, modifier = Modifier.fillMaxWidth().testTag("start-exercise")) { Text(label) }
            Text(
                "先观察棋盘与推理依据，再亲自完成聚焦和迁移练习。答案提交后会显示具体说明。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (state.error != null) {
            Text(
                state.error,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
        }
        OutlinedButton(
            onClick = { onPractice(GameLaunch.Practice(lesson.id, lesson.practiceVariant, lesson.practiceDifficulty)) },
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.busy
        ) { Text("进入完整棋盘练习") }
        Text(
            "完整棋盘练习单独保存，不会自动完成本课程。",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
