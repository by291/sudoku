package dev.sudoku.app.game

import dev.sudoku.app.model.GameLaunch
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.HintResult
import dev.sudoku.app.model.RuleMetadata
import dev.sudoku.app.model.Settings

internal enum class GamePhase { EMPTY, PREPARING, PAUSED, PLAYING, COMPLETED }

internal data class GameUiState(
    val phase: GamePhase = GamePhase.EMPTY,
    val preparationCommitting: Boolean = false,
    val session: GameSession? = null,
    val practiceReplacement: GameLaunch.Practice? = null,
    val metadata: RuleMetadata? = null,
    val selectedCell: Int? = null,
    val noteMode: Boolean = false,
    val settings: Settings = Settings(),
    val conflicts: Set<Int> = emptySet(),
    val reviewCells: Set<Int> = emptySet(),
    val conflictPending: Boolean = false,
    val notesPending: Boolean = false,
    val hintPending: Boolean = false,
    val hint: HintResult.Deduction? = null,
    val hintStep: Int = 0,
    val elapsedMs: Long = 0,
    val save: SaveState = SaveState(),
    val message: String? = null,
    val error: String? = null
) {
    val editable: Boolean get() = phase == GamePhase.PLAYING && session?.completion == null
    val inputEditable: Boolean get() = editable && selectedCell?.let { session?.puzzle?.givens?.get(it) == 0 } == true
}
