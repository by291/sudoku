package dev.yigeyinian.sudoku.feature.records

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Quiet structural placeholders avoid both a blank body and fabricated record details. */
@Composable
internal fun RecordListPlaceholder() {
    val colors = MaterialTheme.colorScheme
    Column(
        Modifier.fillMaxWidth().testTag("records-list-placeholder")
            .semantics { contentDescription = "记录尚未读取" },
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        repeat(2) {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = colors.surface,
                border = BorderStroke(1.dp, colors.onSurface.copy(alpha = 0.1f))
            ) {
                Column(
                    Modifier.fillMaxWidth().padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    listOf(0.45f, 0.75f, 0.6f).forEachIndexed { index, width ->
                        Box(
                            Modifier.fillMaxWidth(width).height(if (index == 0) 22.dp else 16.dp)
                                .background(colors.onSurface.copy(alpha = 0.06f), RoundedCornerShape(4.dp))
                        )
                    }
                }
            }
        }
    }
}
