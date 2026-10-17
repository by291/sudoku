package dev.yigeyinian.sudoku.game

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.design.InitialDialogFocus

/** Shared home entry shell keeps setup and saved-game selection visually and behaviorally consistent. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GameEntrySheet(
    title: String,
    onDismiss: () -> Unit,
    subtitle: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val closeFocus = remember { FocusRequester() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        sheetMaxWidth = 480.dp,
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = null
    ) {
        Box(
            Modifier.align(Alignment.CenterHorizontally).padding(top = 10.dp, bottom = 4.dp)
                .size(32.dp, 4.dp)
                .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.35f), RoundedCornerShape(2.dp))
        )
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
        content()
        InitialDialogFocus(closeFocus)
    }
}
