package dev.sudoku.app.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay

private const val PROGRESS_DELAY_MS = 350L

/** Delays feedback only; callers must use the actual pending state to guard actions. */
@Composable
fun rememberDelayedProgress(active: Boolean): Boolean {
    // Reset synchronously for each operation, and cancel the timer when it ends or leaves composition.
    var visible by remember(active) { mutableStateOf(false) }
    LaunchedEffect(active) {
        if (active) {
            delay(PROGRESS_DELAY_MS)
            visible = true
        }
    }
    return active && visible
}
