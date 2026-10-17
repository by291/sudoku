package dev.sudoku.app.game

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Static row shapes need no perpetual animation while a small local query is pending. */
@Composable
internal fun SaveListSkeleton() {
    Column(
        Modifier.fillMaxWidth().testTag("continue-skeleton")
            .semantics { contentDescription = "正在读取存档" },
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        repeat(2) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                listOf(0.5f, 0.3f, 0.85f).forEachIndexed { index, width ->
                    Box(
                        Modifier.fillMaxWidth(width).height(if (index == 0) 22.dp else 16.dp)
                            .background(
                                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f),
                                RoundedCornerShape(4.dp)
                            )
                    )
                }
            }
        }
    }
}
