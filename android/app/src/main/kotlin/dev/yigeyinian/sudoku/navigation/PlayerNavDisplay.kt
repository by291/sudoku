package dev.yigeyinian.sudoku.navigation

import androidx.activity.BackEventCompat
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.scene.NavigationBackHandler
import androidx.navigation3.scene.SinglePaneSceneStrategy
import androidx.navigation3.scene.rememberNavigationEventState
import androidx.navigation3.scene.rememberSceneState
import androidx.navigation3.ui.NavDisplay
import androidx.navigationevent.NavigationEvent
import androidx.navigationevent.NavigationEventInput
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import androidx.navigationevent.compose.rememberNavigationEventDispatcherOwner
import kotlinx.coroutines.launch

/** Keeps Navigation 3's seekable scene alive until a save-before-leave operation settles. */
@Composable
internal fun <T : Any> PlayerNavDisplay(
    entries: List<NavEntry<T>>,
    onBack: suspend () -> Boolean,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    val scenes = rememberSceneState(entries, listOf(SinglePaneSceneStrategy()), onBack = { scope.launch { onBack() } })
    val navigationState = rememberNavigationEventState(scenes)
    val owner = rememberNavigationEventDispatcherOwner(parent = null)
    val input = remember { SceneBackInput() }
    DisposableEffect(owner, input) {
        owner.navigationEventDispatcher.addInput(input)
        onDispose { owner.navigationEventDispatcher.removeInput(input) }
    }

    // Only the scene handler uses this private dispatcher. Dialogs and sheets below NavDisplay
    // still use the activity dispatcher, so they consume Back before page navigation.
    CompositionLocalProvider(LocalNavigationEventDispatcherOwner provides owner) {
        NavigationBackHandler(scenes, navigationState, onBackCompleted = {})
    }
    PredictiveBackHandler(enabled = scenes.currentScene.previousEntries.isNotEmpty()) { events ->
        var completed = false
        try {
            events.collect { input.progress(it) }
            // Do not reset gesture progress while storage is pending: that would animate a
            // cancellation followed by a second pop. Failed saves reverse to the current page.
            if (onBack()) {
                input.complete()
                completed = true
            }
        } finally {
            if (!completed) {
                input.cancel()
            }
        }
    }
    NavDisplay(
        sceneState = scenes,
        navigationEventState = navigationState,
        modifier = modifier,
        transitionSpec = { forwardTransition() },
        popTransitionSpec = { backTransition() },
        predictivePopTransitionSpec = { backTransition() }
    )
}

private class SceneBackInput : NavigationEventInput() {
    private var started = false

    fun progress(event: BackEventCompat) {
        val navigationEvent = NavigationEvent(
            swipeEdge = event.swipeEdge,
            progress = event.progress,
            touchX = event.touchX,
            touchY = event.touchY
        )
        if (!started) {
            dispatchOnBackStarted(navigationEvent)
            started = true
        } else {
            dispatchOnBackProgressed(navigationEvent)
        }
    }

    fun complete() {
        dispatchOnBackCompleted()
        started = false
    }

    fun cancel() {
        if (started) {
            dispatchOnBackCancelled()
            started = false
        }
    }
}
