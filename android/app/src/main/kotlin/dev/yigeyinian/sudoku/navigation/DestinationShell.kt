package dev.yigeyinian.sudoku.navigation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.model.ThemePreference

private data class RootDestination(val route: AppRoute, val label: String, val icon: ImageVector)

private val roots = listOf(
    RootDestination(AppRoute.Home, "首页", Icons.Outlined.Home),
    RootDestination(AppRoute.Learning, "学习", Icons.Outlined.School),
    RootDestination(AppRoute.Daily, "每日", Icons.Outlined.CalendarMonth),
    RootDestination(AppRoute.Records, "记录", Icons.Outlined.BarChart)
)

/** Each outgoing entry retains its navigation insets until Navigation 3 disposes that entry. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DestinationShell(
    current: AppRoute,
    theme: ThemePreference,
    error: String?,
    onPrimary: (AppRoute) -> Unit,
    onTheme: (ThemePreference) -> Unit,
    onRetry: () -> Unit,
    content: @Composable () -> Unit
) {
    var themeOpen by remember { mutableStateOf(false) }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 840.dp
        Row(Modifier.fillMaxSize()) {
            if (wide) {
                NavigationRail(Modifier.fillMaxHeight()) {
                    roots.forEach { destination ->
                        NavigationRailItem(
                            selected = current == destination.route,
                            onClick = { onPrimary(destination.route) },
                            icon = { Icon(destination.icon, null) },
                            label = { Text(destination.label) }
                        )
                    }
                }
            }
            Scaffold(
                modifier = Modifier.weight(1f),
                topBar = {
                    TopAppBar(
                        title = { Text("一格一念", style = MaterialTheme.typography.titleLarge) },
                        actions = {
                            IconButton(onClick = { themeOpen = true }) { Icon(Icons.Outlined.Palette, "界面主题") }
                        }
                    )
                },
                bottomBar = {
                    if (!wide) {
                        NavigationBar {
                            roots.forEach { destination ->
                                NavigationBarItem(
                                    selected = current == destination.route,
                                    onClick = { onPrimary(destination.route) },
                                    icon = { Icon(destination.icon, null) },
                                    label = { Text(destination.label) }
                                )
                            }
                        }
                    }
                }
            ) { padding ->
                Column(Modifier.fillMaxSize().padding(padding)) {
                    if (error != null) {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.error)
                            TextButton(onClick = onRetry) { Text("重试") }
                        }
                    }
                    Box(Modifier.weight(1f)) { content() }
                }
            }
        }
    }

    if (themeOpen) {
        AlertDialog(
            onDismissRequest = { themeOpen = false },
            title = { Text("界面主题") },
            text = {
                Column {
                    listOf(
                        ThemePreference.LIGHT to "浅色",
                        ThemePreference.DARK to "深色",
                        ThemePreference.SYSTEM to "跟随系统"
                    ).forEach { (choice, label) ->
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                onTheme(choice)
                                themeOpen = false
                            }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = theme == choice, onClick = {
                                onTheme(choice)
                                themeOpen = false
                            })
                            Text(label)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { themeOpen = false }) { Text("关闭") } }
        )
    }
}
