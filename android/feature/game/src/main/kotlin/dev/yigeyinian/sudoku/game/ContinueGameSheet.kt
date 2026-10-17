package dev.yigeyinian.sudoku.game

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.yigeyinian.sudoku.model.GameSession
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
internal fun ContinueGameSheet(saves: List<GameSession>, onDismiss: () -> Unit, onResume: (String) -> Unit) {
    val sortedSaves = remember(saves) { saves.sortedByDescending { Instant.parse(it.startedAt) } }
    val zone = ZoneId.systemDefault()
    val currentYear = LocalDate.now(zone).year
    GameEntrySheet(
        title = "继续存档",
        onDismiss = onDismiss
    ) {
        LazyColumn(
            Modifier.weight(1f, fill = false).fillMaxWidth().testTag("continue-saves"),
            contentPadding = PaddingValues(bottom = 20.dp)
        ) {
            itemsIndexed(sortedSaves, key = { _, session -> session.id }) { index, session ->
                val summary = remember(session, zone, currentYear) { session.savedGameSummary(zone, currentYear) }
                if (index > 0) {
                    HorizontalDivider(
                        Modifier.padding(horizontal = 20.dp),
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                    )
                }
                SavedGameRow(summary, session.id, first = index == 0, onResume = { onResume(session.id) })
            }
        }
    }
}

@Composable
private fun SavedGameRow(summary: SavedGameSummary, id: String, first: Boolean, onResume: () -> Unit) {
    Surface(
        onClick = onResume,
        modifier = Modifier.fillMaxWidth().testTag("continue-save-$id").semantics { role = Role.Button },
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(
            Modifier.fillMaxWidth().padding(
                start = 20.dp,
                end = 20.dp,
                top = if (first) 0.dp else 18.dp,
                bottom = 18.dp
            ),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FlowRow(
                    Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        summary.title,
                        Modifier.align(Alignment.CenterVertically),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        summary.difficulty,
                        Modifier.align(Alignment.CenterVertically),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowForward,
                    null,
                    Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(5.dp),
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.align(Alignment.CenterVertically)
                ) {
                    Text(
                        summary.source,
                        Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                summary.sourceDetail?.let {
                    Text(
                        it,
                        Modifier.align(Alignment.CenterVertically),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            FlowRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    summary.progress,
                    Modifier.padding(end = 8.dp).align(Alignment.CenterVertically),
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    summary.startedAt,
                    Modifier.align(Alignment.CenterVertically),
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
