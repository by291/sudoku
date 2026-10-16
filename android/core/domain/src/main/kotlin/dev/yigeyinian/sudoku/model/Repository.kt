package dev.yigeyinian.sudoku.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class SessionRecord(val formatVersion: Int = 2, val revision: Long, val session: GameSession)

@Serializable data class ResultRecord(val formatVersion: Int = 2, val session: GameSession)

@Serializable data class LessonProgress(val lessonId: String, val completedAt: String)

@Serializable enum class ThemePreference {
    @SerialName("light")
    LIGHT,

    @SerialName("dark")
    DARK,

    @SerialName("system")
    SYSTEM
}

@Serializable data class Settings(
    val theme: ThemePreference = ThemePreference.SYSTEM,
    val showTimer: Boolean = true,
    val highlightConflicts: Boolean = true,
    val currentLessonId: String? = null,
    val lessonStages: Map<String, Int>? = null
)

@Serializable data class LocalBackup(
    val backupVersion: Int = 1,
    val exportedAt: String,
    val sessions: List<SessionRecord>,
    val results: List<ResultRecord>,
    val lessons: List<LessonProgress>,
    val settings: Settings
)

enum class StorageFailureKind { UNAVAILABLE, WRITE_FAILED, OWNERSHIP_LOST, REVISION_CONFLICT, INVALID_DATA }
data class StorageFailure(val kind: StorageFailureKind, val message: String)
sealed interface StorageOutcome<out T> {
    data class Success<T>(val value: T) : StorageOutcome<T>
    data class Failure(val error: StorageFailure) : StorageOutcome<Nothing>
}

data class EditorToken(val ownerId: String, val sessionId: String, val epoch: Long, val generation: Long)
data class PreviousSession(val id: String, val revision: Long, val token: EditorToken)
data class BackupPreview(val backup: LocalBackup, val expectedEpoch: Long)
data class BackupExport(val backup: LocalBackup, val text: String, val excluded: Int = 0, val quarantined: Int = 0)

/** Application scoped; all effective writes are ordered and fenced by dataset epoch and editor. */
interface GameRepository {
    suspend fun claimEditor(sessionId: String, ownerId: String): StorageOutcome<EditorToken>
    suspend fun releaseEditor(token: EditorToken): StorageOutcome<Unit>
    suspend fun writeSession(
        session: GameSession,
        expectedRevision: Long,
        token: EditorToken
    ): StorageOutcome<SessionRecord>
    suspend fun replaceActiveSession(
        session: GameSession,
        token: EditorToken,
        previous: PreviousSession?
    ): StorageOutcome<SessionRecord>
    suspend fun listSessions(): StorageOutcome<List<SessionRecord>>
    suspend fun listResults(): StorageOutcome<List<ResultRecord>>
    suspend fun readSettings(): StorageOutcome<Settings>
    suspend fun writeSettings(settings: Settings, expectedEpoch: Long): StorageOutcome<Unit>
    suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>>

    /** Records the first completion timestamp; retries retain that original fact in the current dataset. */
    suspend fun writeLessonProgress(progress: LessonProgress, expectedEpoch: Long): StorageOutcome<Unit>
    suspend fun readDatasetEpoch(): StorageOutcome<Long>
    suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport>
    suspend fun previewBackup(text: String): StorageOutcome<BackupPreview>
    suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit>
    suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit>
    suspend fun countQuarantined(): StorageOutcome<Int>
    suspend fun removeQuarantined(): StorageOutcome<Unit>
}
