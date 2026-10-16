package dev.yigeyinian.sudoku.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalWindowInfo

/** Call inside dialog content, where the window information belongs to the dialog's own owner. */
@Composable
fun InitialDialogFocus(requester: FocusRequester) {
    val windowFocused = LocalWindowInfo.current.isWindowFocused
    var requested by remember(requester) { mutableStateOf(false) }

    LaunchedEffect(windowFocused, requested) {
        if (windowFocused && !requested) {
            // A parent composition can run before the dialog gains a window and places its focus targets.
            withFrameNanos { }
            requested = requester.requestFocus()
        }
    }
}
