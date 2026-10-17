package dev.yigeyinian.sudoku.game

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.design.InitialDialogFocus
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.first

internal const val ENTRY_CONTENT_TRANSITION_MILLIS = 240

/** Shared home entry shell keeps setup and saved-game selection visually and behaviorally consistent. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GameEntrySheet(
    title: String,
    onDismiss: () -> Unit,
    subtitle: String? = null,
    expandable: Boolean = false,
    fitContent: Boolean = false,
    content: @Composable ColumnScope.(entranceFinished: Boolean) -> Unit
) {
    val closeFocus = remember { FocusRequester() }
    val initiallyFitContent = remember { fitContent }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = !expandable)
    var entranceFinished by remember { mutableStateOf(false) }
    LaunchedEffect(sheetState) {
        snapshotFlow { sheetState.currentValue != SheetValue.Hidden && !sheetState.isAnimationRunning }
            .first { it }
        // Latch once: later dismissals and predictive back must not restore the initial loading content.
        entranceFinished = true
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        sheetMaxWidth = 480.dp,
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = if (expandable) {
            { EntryDragHandle() }
        } else {
            null
        }
    ) {
        BoxWithConstraints {
            val availableHeight = maxHeight
            val density = LocalDensity.current
            val halfWindow = with(density) { LocalWindowInfo.current.containerSize.height.toDp() / 2 }
            var naturalSize by remember { mutableStateOf(IntSize.Zero) }
            val naturalHeight = with(density) { naturalSize.height.toDp() }
            val compact = (entranceFinished || initiallyFitContent) && fitContent && naturalSize.height > 0 &&
                naturalHeight < availableHeight - halfWindow
            var compactStart by remember(compact) {
                mutableStateOf(
                    if (compact && entranceFinished) {
                        // A partially expanded sheet still measures full-screen behind the bottom
                        // edge. Start resizing at its visible height, not that offscreen extent.
                        val visibleHeight = with(density) { availableHeight.toPx() } - sheetState.requireOffset()
                        IntSize(naturalSize.width, visibleHeight.roundToInt().coerceAtLeast(0))
                    } else {
                        null
                    }
                )
            }
            val resizeSpec = if (!entranceFinished) {
                snap<IntSize>()
            } else {
                val start = compactStart
                if (start != null) {
                    keyframes {
                        durationMillis = ENTRY_CONTENT_TRANSITION_MILLIS
                        start at 0 using FastOutSlowInEasing
                    }
                } else {
                    tween(ENTRY_CONTENT_TRANSITION_MILLIS)
                }
            }
            // Measure the actual rows with loose minimum constraints, including wrapped text.
            // Animate inside the sheet so Material's drag anchors see each intermediate height.
            val sizing = if (expandable) {
                // Initial window-inset changes must settle immediately. Animating them retargets
                // Material's entrance every frame and leaves only the drag handle visible.
                Modifier.animateContentSize(resizeSpec, finishedListener = { _, _ -> compactStart = null })
                    .layout { measurable, constraints ->
                        val placeable = measurable.measure(constraints.copy(minHeight = 0))
                        // Cached rows must establish the final anchors in the first measure pass.
                        // Waiting for onSizeChanged would let show() select the half-screen anchor.
                        val initiallyCompact = initiallyFitContent && !entranceFinished &&
                            placeable.height < constraints.maxHeight - halfWindow.roundToPx()
                        val height = if (initiallyCompact || compact) placeable.height else constraints.maxHeight
                        layout(placeable.width, height) { placeable.placeRelative(0, 0) }
                    }
                    .onSizeChanged { naturalSize = it }
            } else {
                Modifier
            }
            Column(sizing) {
                if (!expandable) EntryDragHandle(Modifier.align(Alignment.CenterHorizontally))
                Row(
                    Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, bottom = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            title,
                            Modifier.semantics { heading() },
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (subtitle != null) {
                            Text(
                                subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.focusRequester(closeFocus)) {
                        Icon(Icons.Outlined.Close, "关闭选择面板", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                content(entranceFinished)
            }
        }
        InitialDialogFocus(closeFocus)
    }
}

@Composable
private fun EntryDragHandle(modifier: Modifier = Modifier) {
    Box(
        modifier.padding(top = 10.dp, bottom = 4.dp).size(32.dp, 4.dp)
            .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.35f), RoundedCornerShape(2.dp))
    )
}

@Composable
internal fun <T> rememberEntryPresentation(value: T, entranceFinished: Boolean): T {
    // Keep entrance anchors stable while reads continue. Publish the latest result after settling,
    // without an arbitrary delay or replaying intermediate loading results.
    val initial = remember { value }
    return if (entranceFinished) value else initial
}
