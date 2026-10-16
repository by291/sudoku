package dev.yigeyinian.sudoku.model

import kotlinx.serialization.Serializable

/** Navigation describes player intent; persisted puzzles and generated handles never enter a route. */
@Serializable
sealed interface GameLaunch {
    @Serializable
    data class Resume(val sessionId: String) : GameLaunch

    @Serializable
    data class Free(val variant: Variant, val difficulty: Difficulty) : GameLaunch

    @Serializable
    data class Daily(val variant: Variant, val date: String) : GameLaunch

    @Serializable
    data class Practice(val lessonId: String, val variant: Variant, val difficulty: Difficulty) : GameLaunch
}
