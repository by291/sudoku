package dev.sudoku.app.storage

import androidx.room.Dao
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Transaction
import dev.sudoku.app.model.Completion
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import dev.sudoku.app.model.variant
import java.time.Instant

// Compact tables isolate presentation reads from large board/history payloads.
data class SummaryFields(
    val mode: String,
    val variant: String,
    val difficulty: String,
    val startedAt: Long,
    val elapsedMs: Long,
    val completedAt: Long?,
    val assisted: Boolean,
    val challengeDate: String?,
    val formalAttempt: Boolean?,
    val lessonId: String?,
    val filled: Int,
    val editable: Int,
    val eligibleDate: String?
)

@Entity(
    tableName = "session_summaries",
    indices = [
        Index(
            value = ["variant", "startedAt", "id"]
        ), Index(value = ["startedAt", "id"]), Index(value = ["completedAt", "startedAt", "id"])
    ]
)
data class SessionSummaryEntity(
    @PrimaryKey val id: String,
    val revision: Long,
    @Embedded val facts: SummaryFields,
    val version: Int = 1
)

@Entity(
    tableName = "result_summaries",
    indices = [
        Index(value = ["variant", "completedAt", "id"]),
        Index(value = ["completedAt", "id"]),
        Index(value = ["variant", "mode", "difficulty", "assisted"]),
        Index(value = ["variant", "formalAttempt", "eligibleDate"])
    ]
)
data class ResultSummaryEntity(@PrimaryKey val id: String, @Embedded val facts: SummaryFields, val version: Int = 1)

data class SummaryRow(val id: String, val revision: Long, @Embedded val facts: SummaryFields?)
data class AggregateRow(val mode: String, val difficulty: String, val assisted: Boolean, val best: Long, val total: Int)

internal fun GameSession.summaryFields(): SummaryFields {
    val daily = metadata as? SessionMetadata.Daily
    val completed = completion?.completedAt?.let(Instant::parse)
    return SummaryFields(
        mode.name, puzzle.rules.variant.wireName, puzzle.difficulty.name,
        Instant.parse(startedAt).toEpochMilli(), elapsedMs, completed?.toEpochMilli(), assistance.assisted,
        daily?.challengeDate, daily?.formalAttempt, (metadata as? SessionMetadata.Learning)?.lessonId,
        puzzle.givens.indices.count { puzzle.givens[it] == 0 && entries[it] != 0 },
        puzzle.givens.count { it == 0 },
        daily?.challengeDate?.takeIf { daily.formalAttempt && completed != null && challengeDate(completed) == it }
    )
}

internal fun SummaryRow.domain(): GameSummary? = facts?.let {
    require(
        id.isNotBlank() && revision >= 0 && it.elapsedMs >= 0 && it.editable in 0..81 && it.filled in 0..it.editable
    )
    val metadata = when (GameMode.valueOf(it.mode)) {
        GameMode.FREE -> SessionMetadata.Free
        GameMode.DAILY -> {
            val date = requireNotNull(it.challengeDate)
            require(dev.sudoku.app.model.isChallengeDate(date))
            SessionMetadata.Daily(date, requireNotNull(it.formalAttempt))
        }
        GameMode.LEARNING -> SessionMetadata.Learning(requireNotNull(it.lessonId))
    }
    val variant = Variant.entries.single { variant -> variant.wireName == it.variant }
    val difficulty = Difficulty.valueOf(it.difficulty)
    require(difficulty in variant.difficulties)
    GameSummary(
        id, revision, variant, difficulty, metadata, Instant.ofEpochMilli(it.startedAt).toString(),
        it.elapsedMs, it.completedAt?.let { at -> Completion(Instant.ofEpochMilli(at).toString(), it.elapsedMs) },
        it.assisted, it.filled, it.editable
    )
}

@Entity(tableName = "summary_version")
data class SummaryVersionEntity(
    @PrimaryKey val id: Int = 1,
    val generation: Long = 0,
    val sessionsComplete: Boolean = false,
    val resultsComplete: Boolean = false
)

@Dao
interface SummaryDao {
    @Query("INSERT OR IGNORE INTO summary_version(id,generation,sessionsComplete,resultsComplete) VALUES(1,0,0,0)")
    suspend fun initializeVersion()

    @Query("UPDATE summary_version SET generation=generation+1 WHERE id=1")
    suspend fun incrementVersion()

    @Query("SELECT generation FROM summary_version WHERE id=1")
    suspend fun generation(): Long?

    @Query("SELECT * FROM summary_version WHERE id=1")
    suspend fun coverage(): SummaryVersionEntity?

    @Query("UPDATE summary_version SET sessionsComplete=:complete WHERE id=1")
    suspend fun sessionCoverage(complete: Boolean)

    @Query("UPDATE summary_version SET resultsComplete=:complete WHERE id=1")
    suspend fun resultCoverage(complete: Boolean)

    // Normal writes install both rows atomically, so complete coverage remains valid. Removing
    // projections explicitly invalidates it; schema-only migration starts with unknown coverage.
    @Transaction suspend fun pendingSessions(): Boolean {
        initializeVersion()
        if (coverage()?.sessionsComplete == true) return false
        val pending = hasPendingSessions()
        if (!pending) sessionCoverage(true)
        return pending
    }

    @Transaction suspend fun pendingResults(variant: String? = null): Boolean {
        initializeVersion()
        if (coverage()?.resultsComplete == true) return false
        if (!hasPendingResults(null)) {
            resultCoverage(true)
            return false
        }
        return variant == null || hasPendingResults(variant)
    }

    suspend fun changed() {
        initializeVersion()
        incrementVersion()
    }

    @Transaction suspend fun putSession(row: SessionSummaryEntity) {
        insertSession(row)
        changed()
    }

    @Transaction suspend fun putResult(row: ResultSummaryEntity) {
        if (insertResult(row) != -1L) {
            changed()
        }
    }

    @Transaction suspend fun deleteSession(id: String) {
        removeSession(id)
        changed()
        sessionCoverage(false)
    }

    @Transaction suspend fun deleteResult(id: String) {
        removeResult(id)
        changed()
        resultCoverage(false)
    }

    @Transaction suspend fun clearSessions() {
        removeSessions()
        changed()
        sessionCoverage(false)
    }

    @Transaction suspend fun clearResults() {
        removeResults()
        changed()
        resultCoverage(false)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(row: SessionSummaryEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertResult(row: ResultSummaryEntity): Long

    @Query("DELETE FROM session_summaries WHERE id = :id")
    suspend fun removeSession(id: String)

    @Query("DELETE FROM result_summaries WHERE id = :id")
    suspend fun removeResult(id: String)

    @Query("DELETE FROM session_summaries")
    suspend fun removeSessions()

    @Query("DELETE FROM result_summaries")
    suspend fun removeResults()

    @Query("SELECT EXISTS(SELECT 1 FROM session_summaries WHERE completedAt IS NULL)")
    suspend fun hasUnfinished(): Boolean

    @Query("SELECT id FROM session_summaries WHERE completedAt IS NULL LIMIT 2")
    suspend fun unfinishedIds(): List<String>

    @Query(
        "SELECT EXISTS(SELECT 1 FROM sessions s LEFT JOIN session_summaries p ON p.id=s.id AND p.revision=s.revision AND p.version=1 WHERE p.id IS NULL)"
    )
    suspend fun hasPendingSessions(): Boolean

    @Query(
        "SELECT EXISTS(SELECT 1 FROM results s LEFT JOIN result_summaries p ON p.id=s.id AND p.version=1 WHERE p.id IS NULL AND (:variant IS NULL OR s.variant=:variant))"
    )
    suspend fun hasPendingResults(variant: String?): Boolean

    @Query(
        "SELECT s.id, s.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM sessions s LEFT JOIN session_summaries p ON p.id=s.id AND p.version=1 AND p.revision=s.revision WHERE p.id IS NULL AND (:variant IS NULL OR s.variant=:variant) AND (:afterId IS NULL OR s.id<:afterId) ORDER BY s.id DESC LIMIT 31"
    )
    suspend fun pendingSessionsPage(variant: String?, afterId: String?): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM session_summaries p WHERE p.version=1 AND (p.startedAt,p.id)<(:afterTime,:afterId) AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=p.id AND s.revision=p.revision) ORDER BY p.startedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun sessions(afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM session_summaries p WHERE p.version=1 AND p.completedAt IS NULL AND (p.startedAt,p.id)<(:afterTime,:afterId) AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=p.id AND s.revision=p.revision) ORDER BY p.startedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun sessionsUnfinished(afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM session_summaries p WHERE p.version=1 AND p.variant=:variant AND (p.startedAt,p.id)<(:afterTime,:afterId) AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=p.id AND s.revision=p.revision) ORDER BY p.startedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun sessionsByVariant(variant: String, afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM session_summaries p WHERE p.version=1 AND p.variant=:variant AND p.completedAt IS NULL AND (p.startedAt,p.id)<(:afterTime,:afterId) AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=p.id AND s.revision=p.revision) ORDER BY p.startedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun sessionsByVariantUnfinished(
        variant: String,
        afterTime: Long,
        afterId: String,
        limit: Int
    ): List<SummaryRow>

    @Query(
        "SELECT s.id, 0 AS revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM results s LEFT JOIN result_summaries p ON p.id=s.id AND p.version=1 WHERE p.id IS NULL AND (:variant IS NULL OR s.variant=:variant) AND (:afterId IS NULL OR s.id<:afterId) ORDER BY s.id DESC LIMIT 31"
    )
    suspend fun pendingResultsPage(variant: String?, afterId: String?): List<SummaryRow>

    @Query(
        "SELECT p.id, 0 AS revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM result_summaries p WHERE p.version=1 AND (p.completedAt,p.id)<(:afterTime,:afterId) ORDER BY p.completedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun results(afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, 0 AS revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, p.editable, p.eligibleDate FROM result_summaries p WHERE p.version=1 AND p.variant=:variant AND (p.completedAt,p.id)<(:afterTime,:afterId) ORDER BY p.completedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun resultsByVariant(variant: String, afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query("SELECT * FROM session_summaries WHERE id=:id")
    suspend fun session(id: String): SessionSummaryEntity?

    @Query("SELECT * FROM result_summaries WHERE id=:id")
    suspend fun result(id: String): ResultSummaryEntity?

    @Query("SELECT EXISTS(SELECT 1 FROM sessions WHERE id=:id)")
    suspend fun sessionExists(id: String): Boolean

    @Query("SELECT EXISTS(SELECT 1 FROM results WHERE id=:id)")
    suspend fun resultExists(id: String): Boolean

    @Query(
        "SELECT mode,difficulty,assisted,MIN(elapsedMs) AS best,COUNT(*) AS total FROM result_summaries WHERE variant=:variant AND (mode='FREE' OR (mode='DAILY' AND formalAttempt=1)) GROUP BY mode,difficulty,assisted"
    )
    suspend fun aggregates(variant: String): List<AggregateRow>

    @Query(
        "SELECT DISTINCT eligibleDate FROM result_summaries WHERE variant=:variant AND eligibleDate IS NOT NULL AND eligibleDate<=:today ORDER BY eligibleDate"
    )
    suspend fun eligibleDates(variant: String, today: String): List<String>

    @Query(
        "SELECT s.id FROM sessions s LEFT JOIN session_summaries p ON p.id=s.id AND p.revision=s.revision AND p.version=1 WHERE p.id IS NULL AND s.id>:after ORDER BY s.id LIMIT 1"
    )
    suspend fun nextSession(after: String): String?

    @Query(
        "SELECT s.id FROM results s LEFT JOIN result_summaries p ON p.id=s.id AND p.version=1 WHERE p.id IS NULL AND s.id>:after ORDER BY s.id LIMIT 1"
    )
    suspend fun nextResult(after: String): String?

    @Query("SELECT id FROM sessions WHERE mode=:mode AND (:mode!='FREE' OR variant=:variant) LIMIT 2")
    suspend fun slotIds(mode: String, variant: String): List<String>
}
