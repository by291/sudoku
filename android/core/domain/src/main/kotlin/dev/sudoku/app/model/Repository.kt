package dev.sudoku.app.model

import kotlinx.coroutines.flow.Flow
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

/** A field intent is applied to the latest settings inside the epoch-fenced transaction. */
sealed interface SettingsUpdate {
    data class Theme(val value: ThemePreference) : SettingsUpdate

    data class ShowTimer(val value: Boolean) : SettingsUpdate

    data class HighlightConflicts(val value: Boolean) : SettingsUpdate

    /** Null clears this lesson's cursor after completion and retains it as the current lesson. */
    data class LessonCursor(val lessonId: String, val stageIndex: Int?) : SettingsUpdate
}

fun Settings.updated(update: SettingsUpdate): Settings = when (update) {
    is SettingsUpdate.Theme -> copy(theme = update.value)
    is SettingsUpdate.ShowTimer -> copy(showTimer = update.value)
    is SettingsUpdate.HighlightConflicts -> copy(highlightConflicts = update.value)
    is SettingsUpdate.LessonCursor -> copy(
        currentLessonId = update.lessonId,
        lessonStages = lessonStages.orEmpty().toMutableMap().apply {
            if (update.stageIndex == null) {
                remove(update.lessonId)
            } else {
                put(update.lessonId, update.stageIndex)
            }
        }
    )
}

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

/** Small personal learning facts and ordered writes; no game payload or backup access. */
interface LearningProgressRepository {
    val datasetEpochs: Flow<Long>

    suspend fun readSettings(): StorageOutcome<Settings>

    /** Atomically merges this intent into current settings and returns the committed settings. */
    suspend fun updateSettings(update: SettingsUpdate, expectedEpoch: Long): StorageOutcome<Settings>

    suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>>

    /** Records the first completion timestamp; retries retain that original fact in the current dataset. */
    suspend fun writeLessonProgress(progress: LessonProgress, expectedEpoch: Long): StorageOutcome<Unit>

    suspend fun readDatasetEpoch(): StorageOutcome<Long>
}

/** Application scoped; all effective writes are ordered and fenced by dataset epoch and editor. */
interface GameRepository : LearningProgressRepository {

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

    suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport>

    suspend fun previewBackup(text: String): StorageOutcome<BackupPreview>

    suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit>

    suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit>

    suspend fun countQuarantined(): StorageOutcome<Int>

    suspend fun removeQuarantined(): StorageOutcome<Unit>
}
