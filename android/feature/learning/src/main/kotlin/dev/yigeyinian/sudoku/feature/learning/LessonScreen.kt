package dev.yigeyinian.sudoku.feature.learning

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material.icons.outlined.Fullscreen
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.yigeyinian.sudoku.design.rememberDelayedProgress
import dev.yigeyinian.sudoku.designsystem.NumberPad
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.learning.ExerciseAnswer
import dev.yigeyinian.sudoku.model.learning.Lesson

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
    val showLoading = rememberDelayedProgress(state.loading)
    val lesson = state.lesson
    val entry = state.lessonEntry
    val stage = if (state.exerciseStarted) state.stage else lesson?.guided
    var zoomed by remember(state.lessonId) { mutableStateOf(false) }
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

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 560.dp).fillMaxSize().then(keyboard)) {
                LessonHeader(state, onBack, { zoomed = true }, onPractice)
                when {
                    entry == null -> Column(Modifier.padding(20.dp)) {
                        Text(state.error ?: "找不到这节课程。", color = MaterialTheme.colorScheme.error)
                        OutlinedButton(onClick = onRetry) { Text("重新读取课程") }
                    }
                    else -> {
                        Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp)) {
                            LessonModeTabs(state.exerciseStarted, state.exerciseReady && !state.busy, onGuide, onStart)
                        }
                        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                            val density = LocalDensity.current
                            val measurer = rememberTextMeasurer()
                            val textWidth = with(density) { (maxWidth - 64.dp).roundToPx().coerceAtLeast(1) }
                            val introduction = measurer.measure(
                                entry.introduction,
                                MaterialTheme.typography.bodyMedium,
                                constraints = Constraints(maxWidth = textWidth)
                            )
                            val heading = measurer.measure(
                                "这一课，记住一点",
                                MaterialTheme.typography.titleSmall,
                                constraints = Constraints(
                                    maxWidth = (textWidth - with(density) { 26.dp.roundToPx() })
                                        .coerceAtLeast(1)
                                )
                            )
                            val messageHeight = maxOf(
                                76.dp * density.fontScale.coerceAtLeast(1f),
                                with(density) { (introduction.size.height + heading.size.height).toDp() } + 32.dp
                            )
                            val scroll = rememberScrollState()
                            var retainedHeight by remember(entry.id, maxWidth, density) { mutableIntStateOf(0) }
                            // Keep the visited scroll extent when the other tab has a shorter explanation/input area.
                            // Otherwise ScrollState clamps its offset and moves the board during the switch.
                            Column(
                                Modifier.fillMaxWidth().verticalScroll(scroll)
                                    .heightIn(min = with(density) { retainedHeight.toDp() })
                                    .onSizeChanged { retainedHeight = maxOf(retainedHeight, it.height) }
                                    .padding(horizontal = 20.dp).padding(top = 12.dp, bottom = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                if (state.exerciseStarted) {
                                    ExerciseMessage(state, messageHeight)
                                } else {
                                    LessonPrinciple(entry.introduction, messageHeight)
                                }
                                LessonBoardHeading(state) { zoomed = true }
                                Box(
                                    Modifier.fillMaxWidth().aspectRatio(1f).testTag("lesson-board"),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (stage != null) {
                                        LessonBoard(stage, state, onCell, Modifier.fillMaxWidth())
                                    } else {
                                        Surface(
                                            Modifier.fillMaxSize(),
                                            color = MaterialTheme.colorScheme.surface,
                                            border = BorderStroke(
                                                1.dp,
                                                MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
                                            )
                                        ) { }
                                        if (showLoading) CircularProgressIndicator()
                                        if (state.error != null) {
                                            Column(
                                                Modifier.padding(20.dp),
                                                horizontalAlignment = Alignment.CenterHorizontally
                                            ) {
                                                Text(state.error, color = MaterialTheme.colorScheme.error)
                                                TextButton(onClick = onRetry) { Text("重新读取课程") }
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.height(12.dp))
                                if (state.exerciseStarted) {
                                    ExerciseInput(state, onDigit, onClear)
                                } else if (lesson != null) {
                                    LessonExplanation(lesson)
                                }
                            }
                        }
                        LessonPrimaryAction(state, onStart, onSubmit, onNext, onRetry)
                    }
                }
            }
        }
    }
    if (zoomed && stage != null) {
        Dialog(onDismissRequest = { zoomed = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize()) {
                Column(
                    Modifier.safeDrawingPadding().padding(16.dp).then(keyboard),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("放大棋盘", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                        TextButton(onClick = { zoomed = false }) { Text("关闭放大棋盘") }
                    }
                    Text("可以横向和纵向滚动查看棋盘。", style = MaterialTheme.typography.bodyMedium)
                    Box(
                        Modifier.weight(1f).horizontalScroll(rememberScrollState())
                            .verticalScroll(rememberScrollState())
                    ) {
                        LessonBoard(stage, state, onCell, Modifier.size(540.dp))
                    }
                    if (state.exerciseStarted) {
                        NumberPad(
                            enabled = state.canEnterAnswer(),
                            noteMode = state.stage?.answer is ExerciseAnswer.Eliminate,
                            onDigit = onDigit,
                            expandedTargets = true,
                            digitLabel = { lessonDigitLabel(state, it) }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LessonHeader(
    state: LearningUiState,
    onBack: () -> Unit,
    onZoom: () -> Unit,
    onPractice: (GameLaunch.Practice) -> Unit
) {
    var menuOpen by remember(state.lessonId) { mutableStateOf(false) }
    val lesson = state.lesson
    val entry = state.lessonEntry
    TopAppBar(
        modifier = Modifier.testTag("lesson-header"),
        windowInsets = WindowInsets(0, 0, 0, 0),
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        navigationIcon = {
            IconButton(onClick = onBack, enabled = !state.busy) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回课程")
            }
        },
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    entry?.title ?: "课程",
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.semantics { heading() }
                )
                if (entry != null) {
                    val courseLessons = state.directory.filter { it.practiceVariant == entry.practiceVariant }
                    val number = (courseLessons.indexOfFirst { it.id == entry.id } + 1).toString().padStart(2, '0')
                    Text(
                        "${variantLabel(entry.practiceVariant)} · 第 $number 课",
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        actions = {
            Box {
                IconButton(onClick = { menuOpen = true }, enabled = lesson != null && !state.loading && !state.busy) {
                    Icon(Icons.Outlined.MoreHoriz, "课程更多选项")
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(text = { Text("放大棋盘") }, onClick = {
                        menuOpen = false
                        onZoom()
                    })
                    DropdownMenuItem(text = {
                        Column {
                            Text("进入完整棋盘练习")
                            Text("单独保存，不计入课程完成", style = MaterialTheme.typography.bodySmall)
                        }
                    }, onClick = {
                        menuOpen = false
                        if (lesson != null) {
                            onPractice(
                                GameLaunch.Practice(lesson.id, lesson.practiceVariant, lesson.practiceDifficulty)
                            )
                        }
                    })
                }
            }
        }
    )
}

@Composable
private fun LessonModeTabs(exercise: Boolean, enabled: Boolean, onGuide: () -> Unit, onExercise: () -> Unit) {
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(Modifier.fillMaxWidth().padding(2.dp).selectableGroup()) {
            listOf("学习讲解", "动手练习").forEachIndexed { index, label ->
                val selected = exercise == (index == 1)
                Surface(
                    selected = selected,
                    onClick = if (index == 0) onGuide else onExercise,
                    enabled = enabled,
                    modifier = Modifier.weight(1f).semantics { role = Role.Tab },
                    shape = RoundedCornerShape(12.dp),
                    color = if (selected) {
                        MaterialTheme.colorScheme.surface
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    }
                ) {
                    Box(Modifier.heightIn(min = 48.dp).padding(8.dp), contentAlignment = Alignment.Center) {
                        Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun LessonPrinciple(introduction: String, height: Dp) {
    Surface(
        Modifier.fillMaxWidth().height(height),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.primaryContainer
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Lightbulb, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                Text(
                    "这一课，记住一点",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.titleSmall
                )
            }
            Text(introduction, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun LessonExplanation(lesson: Lesson) {
    Surface(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("这一步，怎么想", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleSmall)
            Text(
                lesson.explanation,
                Modifier.testTag("lesson-explanation"),
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

@Composable
private fun LessonBoardHeading(state: LearningUiState, onZoom: () -> Unit) {
    val lesson = state.lesson
    val index = state.cursor?.stageIndex ?: 0
    val focusedCount = lesson?.exercises?.first()?.stages?.size ?: 0
    val title = if (state.exerciseStarted && lesson != null) {
        lesson.exercises[if (index < focusedCount) 0 else 1].title
    } else {
        "示例棋盘"
    }
    val detail = if (state.exerciseStarted) "第${index + 1} / ${lesson?.stages?.size ?: 0}阶段" else "推理依据已标记"
    Row(
        Modifier.fillMaxWidth().height(48.dp * LocalDensity.current.fontScale.coerceAtLeast(1f))
            .testTag("lesson-stage"),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            title,
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            detail,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        IconButton(onClick = onZoom, enabled = lesson != null) { Icon(Icons.Outlined.Fullscreen, "放大棋盘") }
    }
}

@Composable
private fun ExerciseMessage(state: LearningUiState, height: Dp) {
    val elimination = state.stage?.answer is ExerciseAnswer.Eliminate
    val feedback = state.feedback
    val title = when {
        state.error != null -> "请检查答案与保存状态"
        feedback?.correct == true -> "推理正确"
        feedback != null -> "再检查一下"
        elimination -> "标记可以排除的候选数"
        else -> "找出可以确定的空格"
    }
    val message = state.error ?: feedback?.explanation ?: if (elimination) {
        "点选格子，再点数字标记排除；再点一次可撤回。"
    } else {
        "点选空格，再填入你判断的数字。"
    }
    val failed = state.error != null || feedback?.correct == false
    // Reserve feedback space so submission never moves the board or the digit keys.
    // Long authored explanations remain scrollable and fully exposed to accessibility.
    Surface(
        Modifier.fillMaxWidth().height(height).testTag("exercise-message")
            .semantics { liveRegion = LiveRegionMode.Polite },
        shape = RoundedCornerShape(18.dp),
        color = if (failed) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(message, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun LearningUiState.canEnterAnswer(): Boolean =
    !busy && feedback?.correct != true && selectedCell?.let { stage?.board?.get(it) == 0 } == true

private fun lessonDigitLabel(state: LearningUiState, digit: Int): String =
    if (state.stage?.answer is ExerciseAnswer.Eliminate) "排除候选数$digit" else "填入数字$digit"

@Composable
private fun ExerciseInput(state: LearningUiState, onDigit: (Int) -> Unit, onClear: () -> Unit) {
    val elimination = state.stage?.answer is ExerciseAnswer.Eliminate
    NumberPad(state.canEnterAnswer(), elimination, onDigit, digitLabel = { lessonDigitLabel(state, it) })
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        val summary = if (state.removals.isEmpty()) {
            "想回看思路？点上方「学习讲解」"
        } else {
            state.removals.sortedWith(compareBy({ it.cell }, { it.digit })).joinToString("；") {
                "第${it.cell / 9 + 1}行第${it.cell % 9 + 1}列排除${it.digit}"
            }
        }
        // Marked candidates remain readable without growing the input region after each edit.
        Text(
            summary,
            Modifier.weight(1f).height(48.dp).verticalScroll(rememberScrollState()).padding(vertical = 8.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        TextButton(onClick = onClear, enabled = !state.busy && state.feedback?.correct != true) {
            Icon(Icons.AutoMirrored.Outlined.Backspace, null, Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
            Text("清空")
        }
    }
}

@Composable
private fun LessonPrimaryAction(
    state: LearningUiState,
    onStart: () -> Unit,
    onSubmit: () -> Unit,
    onNext: () -> Unit,
    onRetry: () -> Unit
) {
    val showSaving = rememberDelayedProgress(state.busy)
    val showReading = rememberDelayedProgress(state.loading && state.lesson != null)
    val correct = state.feedback?.correct == true
    val retry = !state.loading && state.error != null && !state.exerciseReady
    val label = when {
        retry -> "重试读取课程"
        showReading -> "正在读取进度…"
        !state.exerciseStarted -> when {
            state.feedback != null || state.placement != null || state.removals.isNotEmpty() -> "返回当前练习"
            (state.cursor?.stageIndex ?: 0) > 0 -> "继续第${(state.cursor?.stageIndex ?: 0) + 1}阶段"
            state.lessonId in state.completedIds -> "开始复习练习"
            else -> "开始课程练习"
        }
        correct -> if (state.feedback.completed) "再练一遍" else "下一阶段"
        showSaving -> "正在保存…"
        else -> "提交答案"
    }
    val action = when {
        retry -> onRetry
        !state.exerciseStarted -> onStart
        correct -> onNext
        else -> onSubmit
    }
    val tag = when {
        !state.exerciseStarted -> "start-exercise"
        correct -> "next-stage"
        else -> "submit-answer"
    }
    Button(
        onClick = action,
        enabled = !state.busy && (state.exerciseReady || retry),
        colors = ButtonDefaults.buttonColors(
            disabledContainerColor = MaterialTheme.colorScheme.primary,
            disabledContentColor = MaterialTheme.colorScheme.onPrimary
        ),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)
            .heightIn(min = 52.dp).testTag(tag)
    ) {
        Text(label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.size(12.dp))
        Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(20.dp))
    }
}
