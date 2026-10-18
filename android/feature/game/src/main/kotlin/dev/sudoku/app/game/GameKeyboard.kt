package dev.sudoku.app.game

import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.ui.input.key.KeyEvent

/** Maps physical keys to the same named player operations used by touch controls. */
internal fun handleGameKey(
    event: KeyEvent,
    onEnterDigit: (Int) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onErase: () -> Unit,
    onToggleNotes: () -> Unit
): Boolean {
    val key = event.nativeKeyEvent
    when {
        key.keyCode == AndroidKeyEvent.KEYCODE_Z && (key.isCtrlPressed || key.isMetaPressed) -> {
            if (key.isShiftPressed) {
                onRedo()
            } else {
                onUndo()
            }
        }
        key.isCtrlPressed || key.isMetaPressed || key.isAltPressed -> return false
        key.keyCode in AndroidKeyEvent.KEYCODE_1..AndroidKeyEvent.KEYCODE_9 -> {
            onEnterDigit(key.keyCode - AndroidKeyEvent.KEYCODE_1 + 1)
        }
        key.keyCode in AndroidKeyEvent.KEYCODE_NUMPAD_1..AndroidKeyEvent.KEYCODE_NUMPAD_9 -> {
            onEnterDigit(key.keyCode - AndroidKeyEvent.KEYCODE_NUMPAD_1 + 1)
        }
        key.keyCode == AndroidKeyEvent.KEYCODE_DEL || key.keyCode == AndroidKeyEvent.KEYCODE_FORWARD_DEL -> onErase()
        key.keyCode == AndroidKeyEvent.KEYCODE_N -> onToggleNotes()
        else -> return false
    }
    return true
}
