package dev.yigeyinian.sudoku.navigation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.GridOn
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.model.ThemePreference

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DestinationShell(
    current: AppRoute,
    theme: ThemePreference,
    error: String?,
    onBack: () -> Unit,
    onTheme: (ThemePreference) -> Unit,
    onRetry: () -> Unit,
    content: @Composable () -> Unit
) {
    var themeOpen by remember { mutableStateOf(false) }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    if (current == AppRoute.Home) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Outlined.GridOn,
                                null,
                                Modifier.size(24.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Text("一格一念", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        Text(
                            when (current) {
                                AppRoute.Learning -> "学习数独"
                                AppRoute.Records -> "我的记录"
                                else -> "一格一念"
                            },
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                },
                navigationIcon = {
                    if (current != AppRoute.Home) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回首页") }
                    }
                },
                actions = {
                    if (current == AppRoute.Home) {
                        IconButton(onClick = { themeOpen = true }) { Icon(Icons.Outlined.Palette, "界面主题") }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
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

    if (current == AppRoute.Home && themeOpen) {
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
