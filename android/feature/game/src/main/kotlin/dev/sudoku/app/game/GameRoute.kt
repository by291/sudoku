package dev.sudoku.app.game

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.sudoku.app.model.GameLaunch
import kotlinx.coroutines.launch

@Composable
fun GameRoute(
    launch: GameLaunch,
    onLeave: () -> Unit,
    onRecords: () -> Unit,
    registerBackAction: ((suspend () -> Boolean)?) -> Unit
) {
    val model: GameViewModel = hiltViewModel()
    val currentState by model.uiState.collectAsStateWithLifecycle()
    // Keep the outgoing scene stable while saving and throughout the navigation transition.
    var departureState by remember { mutableStateOf<GameUiState?>(null) }
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val activity = LocalContext.current.findActivity()

    LaunchedEffect(launch) { model.open(launch) }

    DisposableEffect(lifecycle, model, activity) {
        val observer = LifecycleEventObserver { _, event ->
            // Rotation retains the session; leaving the visible app settles its monotonic interval.
            if (event == Lifecycle.Event.ON_STOP && activity?.isChangingConfigurations != true) {
                model.pause()
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    suspend fun prepareLeave(): Boolean {
        if (departureState != null) {
            return false
        }
        departureState = currentState
        var saved = false
        try {
            saved = model.leave()
            return saved
        } finally {
            if (!saved) {
                departureState = null
            }
        }
    }

    fun leave(destination: () -> Unit = onLeave) {
        scope.launch {
            if (prepareLeave()) {
                destination()
            }
        }
    }

    val latestLeave by rememberUpdatedState<suspend () -> Boolean> { prepareLeave() }
    val latestRegistration by rememberUpdatedState(registerBackAction)
    DisposableEffect(model) {
        // NavDisplay owns gesture progress; the game only settles its save on completion.
        latestRegistration { latestLeave() }
        onDispose { latestRegistration(null) }
    }

    GameScreen(
        state = departureState ?: currentState,
        departing = departureState != null,
        onLeave = { leave() },
        onRecords = { leave(onRecords) },
        onRetryPreparation = { model.startNew(launch) },
        onCheckEntries = model::checkEntries,
        onGenerateNotes = model::generateNotes,
        onPause = model::pause,
        onSelectCell = model::selectCell,
        onResume = model::resume,
        onCancelPreparation = model::cancelPreparation,
        onRetrySave = model::retrySave,
        onSetShowTimer = model::setShowTimer,
        onSetHighlightConflicts = model::setHighlightConflicts,
        onCancelPracticeReplacement = model::cancelPracticeReplacement,
        onConfirmPracticeReplacement = model::confirmPracticeReplacement,
        onRestart = model::restart,
        onDismissHint = model::dismissHint,
        onNextHint = model::nextHint,
        onApplyHint = model::applyHint,
        onEnterDigit = model::enterDigit,
        onToggleNote = model::toggleNote,
        onToggleNotes = model::toggleNotes,
        onUndo = model::undo,
        onRedo = model::redo,
        onRequestHint = model::requestHint,
        onErase = model::erase
    )
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
