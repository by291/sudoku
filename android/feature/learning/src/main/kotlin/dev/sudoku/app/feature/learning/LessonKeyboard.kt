package dev.sudoku.app.feature.learning

import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type

/** Both the inline and zoomed boards dispatch keys through the same lesson operations. */
internal fun Modifier.lessonKeyboard(state: LearningUiState, onDigit: (Int) -> Unit, onClear: () -> Unit): Modifier =
    onPreviewKeyEvent { event ->
        if (!state.exerciseStarted || state.busy || state.feedback?.correct == true ||
            event.type != KeyEventType.KeyDown || event.isCtrlPressed || event.isAltPressed || event.isMetaPressed
        ) {
            false
        } else {
            val digit = LESSON_DIGIT_KEYS[event.key]
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

private val LESSON_DIGIT_KEYS = mapOf(
    Key.One to 1, Key.Two to 2, Key.Three to 3,
    Key.Four to 4, Key.Five to 5, Key.Six to 6,
    Key.Seven to 7, Key.Eight to 8, Key.Nine to 9,
    Key.NumPad1 to 1, Key.NumPad2 to 2, Key.NumPad3 to 3,
    Key.NumPad4 to 4, Key.NumPad5 to 5, Key.NumPad6 to 6,
    Key.NumPad7 to 7, Key.NumPad8 to 8, Key.NumPad9 to 9
)
