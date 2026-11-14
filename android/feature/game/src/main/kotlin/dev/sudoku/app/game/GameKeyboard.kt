package dev.sudoku.app.game

import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.ui.input.key.KeyEvent

/** Maps physical keys to the same named player operations used by touch controls. */
internal fun handleGameKey(event: KeyEvent, actions: GameBoardActions): Boolean {
    val key = event.nativeKeyEvent
    val isErase = key.keyCode == AndroidKeyEvent.KEYCODE_DEL ||
        key.keyCode == AndroidKeyEvent.KEYCODE_FORWARD_DEL
    when {
        key.keyCode == AndroidKeyEvent.KEYCODE_Z && (key.isCtrlPressed || key.isMetaPressed) -> {
            if (key.isShiftPressed) {
                actions.onRedo()
            } else {
                actions.onUndo()
            }
        }
        key.isCtrlPressed || key.isMetaPressed || key.isAltPressed -> return false
        key.keyCode in AndroidKeyEvent.KEYCODE_1..AndroidKeyEvent.KEYCODE_9 -> {
            actions.onEnterDigit(key.keyCode - AndroidKeyEvent.KEYCODE_1 + 1)
        }
        key.keyCode in AndroidKeyEvent.KEYCODE_NUMPAD_1..AndroidKeyEvent.KEYCODE_NUMPAD_9 -> {
            actions.onEnterDigit(key.keyCode - AndroidKeyEvent.KEYCODE_NUMPAD_1 + 1)
        }
        isErase -> actions.onErase()
        key.keyCode == AndroidKeyEvent.KEYCODE_N -> actions.onToggleNotes()
        else -> return false
    }
    return true
}
