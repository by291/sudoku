package dev.yigeyinian.sudoku

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberDecoratedNavEntries
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import dev.yigeyinian.sudoku.design.rememberDelayedProgress
import dev.yigeyinian.sudoku.designsystem.YigeTheme
import dev.yigeyinian.sudoku.feature.learning.LearningRoute
import dev.yigeyinian.sudoku.feature.learning.LessonRoute
import dev.yigeyinian.sudoku.feature.records.RecordsRoute
import dev.yigeyinian.sudoku.game.GameRoute
import dev.yigeyinian.sudoku.game.HomeRoute
import dev.yigeyinian.sudoku.navigation.AppRoute
import dev.yigeyinian.sudoku.navigation.DestinationShell
import dev.yigeyinian.sudoku.navigation.PlayerNavDisplay
import dev.yigeyinian.sudoku.navigation.isPrimaryDestination
import kotlinx.coroutines.launch

@Composable
internal fun SudokuApp(activity: MainActivity) {
    val model: AppViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    val backStack = rememberNavBackStack(AppRoute.Home)
    val scope = rememberCoroutineScope()
    val gameBackActions = remember { mutableMapOf<AppRoute.Game, suspend () -> Boolean>() }

    fun primary(route: AppRoute) {
        if (backStack.lastOrNull() == route) {
            return
        }
        // Keep root entry identities so each feature retains filters and saveable scroll state.
        while ((backStack.lastOrNull() as? AppRoute)?.isPrimaryDestination == false) {
            backStack.removeLastOrNull()
        }
        val previousIndex = backStack.indexOf(route)
        if (previousIndex >= 0) {
            backStack.removeAt(previousIndex)
        }
        backStack.add(route)
    }

    fun back() {
        val current = backStack.lastOrNull() as? AppRoute
        if (current != null && current != AppRoute.Home) {
            if (current.isPrimaryDestination) {
                primary(AppRoute.Home)
            } else {
                backStack.removeLastOrNull()
            }
        }
    }

    LaunchedEffect(backStack.lastOrNull()) {
        if (state.ready) model.reloadSettings()
    }

    val showStartupProgress = rememberDelayedProgress(!state.ready && state.loading)

    YigeTheme(state.settings.theme) {
        val lightBackground = MaterialTheme.colorScheme.background.luminance() > 0.5f
        SideEffect { activity.setSystemBarAppearance(lightBackground) }
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            if (!state.ready) {
                Column(
                    Modifier.fillMaxSize().padding(32.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    if (showStartupProgress) CircularProgressIndicator()
                    if (state.error != null || showStartupProgress) {
                        Text(state.error ?: "正在准备首页…", Modifier.padding(vertical = 24.dp))
                    }
                    if (!state.loading) Button(onClick = model::retry) { Text("重试") }
                }
            } else {
                val entries = rememberDecoratedNavEntries(
                    backStack = backStack,
                    entryDecorators = listOf(
                        rememberSaveableStateHolderNavEntryDecorator(),
                        rememberViewModelStoreNavEntryDecorator()
                    ),
                    entryProvider = entryProvider {
                        entry<AppRoute.Home> {
                            DestinationShell(
                                AppRoute.Home,
                                state.settings.theme,
                                state.error,
                                ::back,
                                model::setTheme,
                                model::retry
                            ) {
                                HomeRoute(
                                    onPlay = { backStack.add(AppRoute.Game(it)) },
                                    onLearning = { primary(AppRoute.Learning) },
                                    onRecords = { primary(AppRoute.Records) }
                                )
                            }
                        }
                        entry<AppRoute.Learning> {
                            DestinationShell(
                                AppRoute.Learning,
                                state.settings.theme,
                                state.error,
                                ::back,
                                model::setTheme,
                                model::retry
                            ) {
                                LearningRoute(onOpenLesson = { backStack.add(AppRoute.Lesson(it)) })
                            }
                        }
                        entry<AppRoute.Records> {
                            var backupOpen by rememberSaveable { mutableStateOf(false) }
                            DestinationShell(
                                AppRoute.Records,
                                state.settings.theme,
                                state.error,
                                ::back,
                                model::setTheme,
                                model::retry,
                                onRecordsBackup = { backupOpen = true }
                            ) {
                                RecordsRoute(
                                    onResume = { backStack.add(AppRoute.Game(it)) },
                                    onDatasetReplaced = { scope.launch { model.reloadSettings() } },
                                    backupOpen = backupOpen,
                                    onDismissBackup = { backupOpen = false }
                                )
                            }
                        }
                        entry<AppRoute.Lesson> { route ->
                            LessonRoute(
                                route.lessonId,
                                onPractice = { backStack.add(AppRoute.Game(it)) },
                                onBack = ::back
                            )
                        }
                        entry<AppRoute.Game> { route ->
                            GameRoute(
                                route.launch,
                                onLeave = ::back,
                                onRecords = { primary(AppRoute.Records) },
                                registerBackAction = { action ->
                                    if (action == null) {
                                        gameBackActions.remove(route)
                                    } else {
                                        gameBackActions[route] = action
                                    }
                                }
                            )
                        }
                    }
                )
                // Retain visited roots for filters/scroll, but expose only Home and the active
                // workflow to Back. Hidden roots must never appear in predictive Back previews.
                val activeRootIndex = backStack.indexOfLast { (it as? AppRoute)?.isPrimaryDestination == true }
                val activeEntries = entries.drop(activeRootIndex)
                val visibleEntries = if (backStack[activeRootIndex] == AppRoute.Home) {
                    activeEntries
                } else {
                    listOf(entries[backStack.indexOf(AppRoute.Home)]) + activeEntries
                }
                PlayerNavDisplay(
                    entries = visibleEntries,
                    onBack = {
                        val current = backStack.lastOrNull()
                        val canLeave = current !is AppRoute.Game || gameBackActions[current]?.invoke() == true
                        if (canLeave && backStack.lastOrNull() == current) {
                            back()
                            true
                        } else {
                            false
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}
