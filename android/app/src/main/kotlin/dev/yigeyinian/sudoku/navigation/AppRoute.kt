package dev.yigeyinian.sudoku.navigation

import androidx.navigation3.runtime.NavKey
import dev.yigeyinian.sudoku.model.GameLaunch
import kotlinx.serialization.Serializable

@Serializable
internal sealed interface AppRoute : NavKey {
    @Serializable data object Home : AppRoute

    @Serializable data object Learning : AppRoute

    @Serializable data object Records : AppRoute

    @Serializable data class Lesson(val lessonId: String) : AppRoute

    @Serializable data class Game(val launch: GameLaunch) : AppRoute
}

internal val AppRoute.isPrimaryDestination: Boolean
    get() = when (this) {
        AppRoute.Home, AppRoute.Learning, AppRoute.Records -> true
        is AppRoute.Game, is AppRoute.Lesson -> false
    }
