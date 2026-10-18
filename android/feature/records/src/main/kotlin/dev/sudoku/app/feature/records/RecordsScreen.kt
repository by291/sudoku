package dev.sudoku.app.feature.records

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sudoku.app.design.rememberDelayedProgress
import dev.sudoku.app.designsystem.VariantSelection
import dev.sudoku.app.designsystem.shortVariantLabel as recordVariantLabel
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.variant
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
internal fun RecordsScreen(
    state: RecordsUiState,
    onVariant: (Variant) -> Unit,
    onResume: (String) -> Unit,
    onRetry: () -> Unit,
    onExport: () -> Unit,
    onImport: () -> Unit,
    onDismissPreview: () -> Unit,
    onRestore: () -> Unit,
    onClear: () -> Unit,
    onCleanup: () -> Unit,
    backupOpen: Boolean = false,
    onDismissBackup: () -> Unit = {},
    onTab: (RecordsTab) -> Unit = {},
    onMore: () -> Unit = {},
    onRetryBackup: () -> Unit = onRetry
) {
    val tab = state.tab
    val scrollStates = rememberSaveableStateHolder()
    val available = !state.loading && !state.busy && state.epoch != null
    val showProgress = rememberDelayedProgress(state.loading || state.busy)
    val saves = if (tab == RecordsTab.SAVES && state.tab == tab) state.items.mapNotNull { it.summary } else emptyList()
    val featured = saves.firstOrNull { it.completion == null }
    val results = if (tab == RecordsTab.HISTORY &&
        state.tab == tab
    ) {
        state.items.mapNotNull { it.summary }.filter { it.completion != null }
    } else {
        emptyList()
    }
    val history = results.groupBy {
        Instant.parse(it.completion?.completedAt).atZone(ZoneId.systemDefault()).toLocalDate()
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        scrollStates.SaveableStateProvider("${state.variant.name}:${tab.name}") {
            LazyColumn(
                Modifier.widthIn(max = 640.dp).fillMaxSize().testTag("records-content"),
                state = rememberLazyListState(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 24.dp)
            ) {
                item(key = "intro") {
                    Text(
                        "每一次专注，都算数。",
                        Modifier.semantics { heading() },
                        fontSize = 25.sp,
                        lineHeight = 34.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "收藏每一次进步，按自己的节奏来",
                            Modifier.weight(1f),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) {
                            if (showProgress) {
                                CircularProgressIndicator(
                                    Modifier.size(18.dp).semantics { contentDescription = "正在读取或处理记录" },
                                    strokeWidth = 2.dp
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                    VariantSelection(state.variant, onVariant, emphasizeSelected = false)
                    Spacer(Modifier.height(16.dp))
                }
                stickyHeader(key = "tabs") {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        RecordTabs(tab, onTab)
                    }
                }
                item(key = "status") {
                    if (!backupOpen && state.preview == null) {
                        RecordStatus(
                            state.queryFailure,
                            notice = null,
                            canRetry = !state.loading,
                            onRetry
                        )
                        RecordStatus(
                            state.backupFailure,
                            state.notice,
                            canRetry = !state.busy,
                            onRetryBackup
                        )
                    }
                }
                // Unknown data keeps the same overview structure; list placeholders must not claim an empty dataset.
                if (state.epoch != null && state.tab == tab) {
                    when (tab) {
                        RecordsTab.OVERVIEW -> item(key = "overview") {
                            if (state.pending) {
                                Column {
                                    RecordCaption("历史记录尚未整理完成，统计暂不可用")
                                    androidx.compose.material3.TextButton(onClick = onRetry, enabled = !state.loading) {
                                        Text("继续整理")
                                    }
                                }
                            } else {
                                RecordsOverview(state.variant, state.summary)
                            }
                        }
                        RecordsTab.SAVES -> {
                            item(key = "saves-heading") {
                                RecordSectionHeading("${recordVariantLabel(state.variant)}存档", "已显示 ${saves.size} 个存档")
                            }
                            if (saves.isEmpty() && !state.pending) {
                                item(key = "empty-saves") { EmptyRecords("还没有存档", "开始一局后，可以从这里接着解。") }
                            }
                            featured?.let { session ->
                                item(key = "featured:${session.id}") {
                                    FeaturedSave(session, available) { onResume(session.id) }
                                    Spacer(Modifier.height(16.dp))
                                    if (saves.size > 1) {
                                        RecordCaption("其他存档")
                                    }
                                }
                            }
                            items(saves.filter { it.id != featured?.id }, key = { "saved:${it.id}" }) { session ->
                                RecordEntry(session, available, history = false) { onResume(session.id) }
                                Spacer(Modifier.height(8.dp))
                            }
                            if (saves.isNotEmpty()) {
                                item(key = "save-note") { RecordCaption("存档保存在本机，可以通过备份迁移。") }
                            }
                        }
                        RecordsTab.HISTORY -> {
                            item(key = "history-heading") {
                                RecordSectionHeading(
                                    "完成历史",
                                    "${recordVariantLabel(state.variant)} · 已显示 ${results.size} 局"
                                )
                            }
                            if (results.isEmpty() && !state.pending) {
                                item(key = "empty-history") {
                                    EmptyRecords("第一份记录，等你写下", "完成对局后，可以在这里回看。")
                                }
                            }
                            history.forEach { (date, entries) ->
                                item(key = "date:$date") {
                                    RecordCaption(date.format(DateTimeFormatter.ofPattern("yyyy 年 M 月 d 日")))
                                }
                                items(entries, key = { "result:${it.id}" }) { session ->
                                    RecordEntry(session, available, history = true) { onResume(session.id) }
                                    Spacer(Modifier.height(8.dp))
                                }
                            }
                        }
                    }
                    if (tab != RecordsTab.OVERVIEW) {
                        items(state.items.filter { it.summary == null }, key = { "pending:${it.id}" }) { row ->
                            androidx.compose.material3.TextButton(onClick = {
                                onResume(row.id)
                            }) { Text("待确认的记录 · 点按读取") }
                        }
                        if (state.pending) item { RecordCaption("部分记录仍在整理，当前列表尚未完整") }
                        if (state.next != null) {
                            item {
                                androidx.compose.material3.TextButton(onClick = onMore, enabled = !state.loading) {
                                    Text("加载更多")
                                }
                            }
                        }
                    }
                } else {
                    when (tab) {
                        RecordsTab.OVERVIEW -> item(key = "overview") { RecordsOverview(state.variant, null) }
                        RecordsTab.SAVES, RecordsTab.HISTORY -> item(key = "unread-list") {
                            RecordSectionHeading(
                                if (tab == RecordsTab.SAVES) "${recordVariantLabel(state.variant)}存档" else "完成历史",
                                "—"
                            )
                            RecordListPlaceholder()
                        }
                    }
                }
            }
        }
    }
    RecordsBackup(
        state, backupOpen, available = !state.busy, onDismissBackup, onRetryBackup,
        onExport, onImport, onDismissPreview, onRestore, onClear, onCleanup
    )
}

@Composable
internal fun RecordStatus(failure: RecordsFailure?, notice: String?, canRetry: Boolean, onRetry: () -> Unit) {
    failure?.let { error ->
        Column(Modifier.padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                error.message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
            OutlinedButton(onClick = onRetry, enabled = canRetry) { Text("重试") }
        }
    }
    notice?.let {
        Text(
            it,
            Modifier.padding(bottom = 12.dp).semantics { liveRegion = LiveRegionMode.Polite },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun RecordTabs(selected: RecordsTab, onSelect: (RecordsTab) -> Unit) {
    Surface(
        Modifier.fillMaxWidth().padding(bottom = 20.dp),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Row(Modifier.padding(4.dp).selectableGroup()) {
            RecordsTab.entries.forEach { tab ->
                Surface(
                    Modifier.weight(1f),
                    shape = RoundedCornerShape(11.dp),
                    color = if (tab == selected) {
                        MaterialTheme.colorScheme.surface
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    }
                ) {
                    Box(
                        Modifier.selectable(tab == selected, role = Role.Tab, onClick = { onSelect(tab) })
                            .heightIn(min = 48.dp).padding(horizontal = 4.dp, vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            tab.label,
                            style = MaterialTheme.typography.labelLarge,
                            color = if (tab == selected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            fontWeight = if (tab == selected) FontWeight.SemiBold else FontWeight.Normal
                        )
                    }
                }
            }
        }
    }
}
