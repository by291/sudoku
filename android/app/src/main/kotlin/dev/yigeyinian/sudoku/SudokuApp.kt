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
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.navigation3.ui.NavDisplay
import dev.yigeyinian.sudoku.design.rememberDelayedProgress
import dev.yigeyinian.sudoku.designsystem.YigeTheme
import dev.yigeyinian.sudoku.feature.learning.LearningRoute
import dev.yigeyinian.sudoku.feature.learning.LessonRoute
import dev.yigeyinian.sudoku.feature.records.RecordsRoute
import dev.yigeyinian.sudoku.game.GameRoute
import dev.yigeyinian.sudoku.game.HomeRoute
import dev.yigeyinian.sudoku.navigation.AppRoute
import dev.yigeyinian.sudoku.navigation.DestinationShell
import dev.yigeyinian.sudoku.navigation.isPrimaryDestination
import kotlinx.coroutines.launch

@Composable
internal fun SudokuApp(activity: MainActivity) {
    val model: AppViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    val backStack = rememberNavBackStack(AppRoute.Home)
    val scope = rememberCoroutineScope()

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
                            DestinationShell(
                                AppRoute.Records,
                                state.settings.theme,
                                state.error,
                                ::back,
                                model::setTheme,
                                model::retry
                            ) {
                                RecordsRoute(
                                    onResume = { backStack.add(AppRoute.Game(it)) },
                                    onDatasetReplaced = { scope.launch { model.reloadSettings() } }
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
                            GameRoute(route.launch, onLeave = ::back, onRecords = { primary(AppRoute.Records) })
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
                NavDisplay(entries = visibleEntries, onBack = ::back, modifier = Modifier.fillMaxSize())
            }
        }
    }
}
