package dev.sudoku.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
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
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberDecoratedNavEntries
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import dev.sudoku.app.design.rememberDelayedProgress
import dev.sudoku.app.designsystem.SudokuTheme
import dev.sudoku.app.feature.learning.LearningRoute
import dev.sudoku.app.feature.learning.LessonRoute
import dev.sudoku.app.feature.records.RecordsRoute
import dev.sudoku.app.game.GameRoute
import dev.sudoku.app.game.HomeRoute
import dev.sudoku.app.navigation.AppRoute
import dev.sudoku.app.navigation.DestinationShell
import dev.sudoku.app.navigation.PlayerNavDisplay
import dev.sudoku.app.navigation.isPrimaryDestination
import kotlinx.coroutines.launch

@Composable
internal fun SudokuApp(activity: MainActivity) {
    val model: AppViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    val backStack = rememberNavBackStack(AppRoute.Home)

    LaunchedEffect(state.ready) {
        if (state.ready) {
            withFrameNanos { }
            model.maintainSummaries()
        }
    }

    val showStartupProgress = rememberDelayedProgress(!state.ready && state.loading)

    SudokuTheme(state.settings.theme) {
        // Subscribe before Scaffold so the first Home frame has real system insets.
        val startupInsets = WindowInsets.safeDrawing
        val lightBackground = MaterialTheme.colorScheme.background.luminance() > 0.5f
        SideEffect { activity.setSystemBarAppearance(lightBackground) }
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            if (!state.ready) {
                StartupContent(
                    StartupPresentation(
                        state = state,
                        showProgress = showStartupProgress,
                        insets = startupInsets,
                        onRetry = model::retry
                    )
                )
            } else {
                AppDestinations(model, state, backStack)
            }
        }
    }
}

private data class StartupPresentation(
    val state: AppUiState,
    val showProgress: Boolean,
    val insets: WindowInsets,
    val onRetry: () -> Unit
)

@Composable
private fun StartupContent(presentation: StartupPresentation) {
    val (state, showProgress, insets, onRetry) = presentation
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(insets).padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (showProgress) {
            CircularProgressIndicator()
        }
        if (state.error != null || showProgress) {
            Text(state.error ?: "正在准备首页…", Modifier.padding(vertical = 24.dp))
        }
        if (!state.loading) {
            Button(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
private fun AppDestinations(
    model: AppViewModel,
    state: AppUiState,
    backStack: NavBackStack<NavKey>
) {
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
        if (current == null || current == AppRoute.Home) {
            return
        }

        if (current.isPrimaryDestination) {
            primary(AppRoute.Home)
        } else {
            backStack.removeLastOrNull()
        }
    }

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

            // A newer destination must not be popped by an older save-before-leave operation.
            if (!canLeave || backStack.lastOrNull() != current) {
                false
            } else {
                back()
                true
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}
