package dev.sudoku.app.model

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SessionRecord(val formatVersion: Int = 2, val revision: Long, val session: GameSession)

@Serializable
data class ResultRecord(val formatVersion: Int = 2, val session: GameSession)

@Serializable
data class LessonProgress(val lessonId: String, val completedAt: String)

@Serializable enum class ThemePreference {
    @SerialName("light")
    LIGHT,

    @SerialName("dark")
    DARK,

    @SerialName("system")
    SYSTEM
}

@Serializable
data class Settings(
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

/** Applies one field intent while retaining the other current settings. */
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

@Serializable
data class LocalBackup(
    val backupVersion: Int = 1,
    val exportedAt: String,
    val sessions: List<SessionRecord>,
    val results: List<ResultRecord>,
    val lessons: List<LessonProgress>,
    val settings: Settings
)

enum class StorageFailureKind {
    UNAVAILABLE,
    WRITE_FAILED,
    OWNERSHIP_LOST,
    REVISION_CONFLICT,
    INVALID_DATA
}

data class StorageFailure(val kind: StorageFailureKind, val message: String)

sealed interface StorageOutcome<out T> {
    data class Success<T>(val value: T) : StorageOutcome<T>

    data class Failure(val error: StorageFailure) : StorageOutcome<Nothing>
}

data class EditorToken(
    val ownerId: String,
    val sessionId: String,
    val epoch: Long,
    val generation: Long
)

data class PreviousSession(val id: String, val revision: Long, val token: EditorToken)

data class BackupPreview(val backup: LocalBackup, val expectedEpoch: Long)

data class BackupExport(
    val backup: LocalBackup,
    val text: String,
    val excluded: Int = 0,
    val quarantined: Int = 0
)

/** Small personal learning facts and ordered writes; no game payload or backup access. */
interface LearningProgressRepository {
    val datasetEpochs: Flow<Long>

    /** Reads the current validated settings or the initial defaults. */
    suspend fun readSettings(): StorageOutcome<Settings>

    /** Atomically merges this intent into current settings and returns the committed settings. */
    suspend fun updateSettings(
        update: SettingsUpdate,
        expectedEpoch: Long
    ): StorageOutcome<Settings>

    /** Reads the original completion facts for locally completed lessons. */
    suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>>

    /**
     * Records the first completion timestamp; retries retain that original fact in the current
     * dataset.
     */
    suspend fun writeLessonProgress(
        progress: LessonProgress,
        expectedEpoch: Long
    ): StorageOutcome<Unit>

    /** Captures the current dataset fence before a workflow begins. */
    suspend fun readDatasetEpoch(): StorageOutcome<Long>
}

/** Application scoped; all effective writes are ordered and fenced by dataset epoch and editor. */
interface GameRepository : LearningProgressRepository {

    /** Claims editing ownership and advances the editor generation. */
    suspend fun claimEditor(sessionId: String, ownerId: String): StorageOutcome<EditorToken>

    /** Releases only the editor generation described by this token. */
    suspend fun releaseEditor(token: EditorToken): StorageOutcome<Unit>

    /** Commits a new revision under the current editor and dataset fences. */
    suspend fun writeSession(
        session: GameSession,
        expectedRevision: Long,
        token: EditorToken
    ): StorageOutcome<SessionRecord>

    /** Replaces an active slot only if its observed identity still matches. */
    suspend fun replaceActiveSession(
        session: GameSession,
        token: EditorToken,
        previous: PreviousSession?
    ): StorageOutcome<SessionRecord>

    /** Exports one committed dataset snapshot and reports excluded records. */
    suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport>

    /** Validates a transfer and captures the epoch required to replace local data. */
    suspend fun previewBackup(text: String): StorageOutcome<BackupPreview>

    /** Replaces all player data atomically if the preview epoch still matches. */
    suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit>

    /** Clears player data and advances its epoch in one transaction. */
    suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit>

    /** Counts isolated records excluded from active player data. */
    suspend fun countQuarantined(): StorageOutcome<Int>

    /** Deletes only isolated records. */
    suspend fun removeQuarantined(): StorageOutcome<Unit>
}
