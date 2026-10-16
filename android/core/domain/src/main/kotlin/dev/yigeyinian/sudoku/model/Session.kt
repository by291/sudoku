package dev.yigeyinian.sudoku.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable enum class GameMode {
    @SerialName("free")
    FREE,

    @SerialName("learning")
    LEARNING,

    @SerialName("daily")
    DAILY
}

@Serializable
sealed interface SessionMetadata {
    @Serializable
    @SerialName("free")
    data object Free : SessionMetadata

    @Serializable
    @SerialName("learning")
    data class Learning(val lessonId: String) : SessionMetadata

    @Serializable
    @SerialName("daily")
    data class Daily(val challengeDate: String, val formalAttempt: Boolean) : SessionMetadata
}

val SessionMetadata.mode: GameMode get() = when (this) {
    SessionMetadata.Free -> GameMode.FREE
    is SessionMetadata.Learning -> GameMode.LEARNING
    is SessionMetadata.Daily -> GameMode.DAILY
}

@Serializable data class BoardLayers(val entries: List<Int>, val notes: List<Int>)

@Serializable data class HistoryMove(val before: BoardLayers, val after: BoardLayers)

@Serializable data class Assistance(
    val hintCount: Long = 0,
    val checkCount: Long = 0,
    val candidateCount: Long = 0,
    val assisted: Boolean = false
)

@Serializable data class Completion(val completedAt: String, val elapsedMs: Long)

@Serializable
data class GameSession(
    val id: String,
    val puzzle: Puzzle,
    val assessment: PuzzleAssessment? = null,
    val mode: GameMode,
    val entries: List<Int> = List(BOARD_SIZE) { 0 },
    val notes: List<Int> = List(BOARD_SIZE) { 0 },
    val undoStack: List<HistoryMove> = emptyList(),
    val redoStack: List<HistoryMove> = emptyList(),
    val elapsedMs: Long = 0,
    val assistance: Assistance = Assistance(),
    val startedAt: String,
    val completion: Completion? = null,
    val metadata: SessionMetadata
)

sealed interface BoardEdit {
    data class Enter(val cell: Int, val digit: Int) : BoardEdit
    data class Erase(val cell: Int) : BoardEdit
    data class ToggleNote(val cell: Int, val digit: Int) : BoardEdit
    data object GenerateNotes : BoardEdit
}

enum class SessionFactAction { UNDO, REDO, HINT_SHOWN, CHECK }
data class EditResult(val entries: List<Int>, val notes: List<Int>, val changed: Boolean, val boardComplete: Boolean)
data class SessionActionResult(val session: GameSession, val changed: Boolean)
