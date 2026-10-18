package dev.sudoku.app.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.sudoku.app.model.Variant

@Composable
fun VariantSelection(selected: Variant, onSelect: (Variant) -> Unit, emphasizeSelected: Boolean = true) {
    val colors = MaterialTheme.colorScheme
    val fontScale = LocalDensity.current.fontScale
    BoxWithConstraints {
        val columns = when {
            maxWidth < 240.dp && fontScale > 1.5f -> 1
            fontScale > 1.3f || maxWidth < 280.dp -> 2
            else -> 3
        }
        Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Variant.entries.chunked(columns).forEach { choices ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    choices.forEach { choice ->
                        val isSelected = choice == selected
                        Surface(
                            Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) colors.primaryContainer else colors.surface,
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) {
                                    colors.primary.copy(
                                        alpha = 0.5f
                                    )
                                } else {
                                    colors.onSurface.copy(alpha = 0.1f)
                                }
                            )
                        ) {
                            Row(
                                Modifier.selectable(isSelected, role = Role.RadioButton, onClick = { onSelect(choice) })
                                    .semantics { contentDescription = variantLabel(choice) }
                                    .heightIn(min = 48.dp).padding(horizontal = 8.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (isSelected) {
                                    Icon(Icons.Outlined.Check, null, Modifier.size(14.dp), tint = colors.primary)
                                }
                                Text(
                                    shortVariantLabel(choice),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (isSelected &&
                                        emphasizeSelected
                                    ) {
                                        FontWeight.SemiBold
                                    } else {
                                        FontWeight.Normal
                                    },
                                    color = if (isSelected) colors.primary else colors.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
