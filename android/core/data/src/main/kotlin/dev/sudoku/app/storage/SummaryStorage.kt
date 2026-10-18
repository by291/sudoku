package dev.sudoku.app.storage

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Transaction

// SQL selection validates compact facts before they can authorize UI state or aggregates.
// Coverage tracks missing projections separately; neither a version nor coverage proves validity.
internal const val CURRENT_PROJECTION_VERSION = 3

private const val VALID_SHARED_FACTS =
    "length(trim(p.id)) BETWEEN 1 AND 200 AND p.elapsedMs BETWEEN 0 AND 9007199254740991 " +
        "AND p.startedAt BETWEEN -8640000000000000 AND 8640000000000000 " +
        "AND (p.completedAt IS NULL OR p.completedAt BETWEEN -8640000000000000 AND 8640000000000000) " +
        "AND p.assisted IN (0,1) AND p.editable BETWEEN 0 AND 81 AND p.filled BETWEEN 0 AND p.editable " +
        "AND p.variant IN ('classic','diagonal','jigsaw','killer','thermo','arrow') " +
        "AND p.difficulty IN ('EASY','MEDIUM','HARD','EXPERT') AND (p.variant='classic' OR p.difficulty!='EXPERT')"

private const val VALID_MODE_FACTS =
    "((p.mode='FREE' AND p.challengeDate IS NULL AND p.formalAttempt IS NULL " +
        "AND p.lessonId IS NULL AND p.eligibleDate IS NULL) " +
        "OR (p.mode='LEARNING' AND p.challengeDate IS NULL AND p.formalAttempt IS NULL " +
        "AND length(trim(p.lessonId)) BETWEEN 1 AND 200 AND p.eligibleDate IS NULL) " +
        "OR (p.mode='DAILY' AND length(p.challengeDate)=10 AND date(p.challengeDate,'+0 days')=p.challengeDate " +
        "AND p.formalAttempt IN (0,1) AND p.lessonId IS NULL " +
        "AND p.formalAttempt=(p.id=CASE WHEN p.variant='classic' THEN 'daily:' || p.challengeDate || ':formal' " +
        "ELSE 'daily:' || p.variant || ':' || p.challengeDate || ':formal' END) " +
        "AND (p.eligibleDate IS NULL OR (p.formalAttempt=1 AND p.completedAt IS NOT NULL " +
        "AND p.eligibleDate=p.challengeDate))))"

internal const val CURRENT_SESSION =
    "p.version=" + CURRENT_PROJECTION_VERSION + " AND p.revision BETWEEN 0 AND 9007199254740991 AND " +
        VALID_SHARED_FACTS + " AND " + VALID_MODE_FACTS +
        " AND EXISTS(SELECT 1 FROM sessions source WHERE source.id=p.id AND source.revision=p.revision " +
        "AND source.mode=p.mode AND source.variant=p.variant AND source.challengeDate IS p.challengeDate)"

internal const val CURRENT_RESULT =
    "p.version=" + CURRENT_PROJECTION_VERSION + " AND p.completedAt IS NOT NULL AND " +
        VALID_SHARED_FACTS + " AND " + VALID_MODE_FACTS +
        " AND EXISTS(SELECT 1 FROM results source WHERE source.id=p.id " +
        "AND source.mode=p.mode AND source.variant=p.variant AND source.challengeDate IS p.challengeDate)"

@Entity(tableName = "summary_version")
data class SummaryVersionEntity(
    @PrimaryKey val id: Int = 1,
    val generation: Long = 0,
    val sessionsComplete: Boolean = false,
    val resultsComplete: Boolean = false,
    @ColumnInfo(defaultValue = "0") val projectionVersion: Int = 0
)

@Dao
interface SummaryDao : SummaryCoverageDao {
    @Transaction suspend fun putSession(row: SessionSummaryEntity) {
        insertSession(row)
        changed()
        if (session(row.id) == null) {
            sessionCoverage(false)
        }
    }

    @Transaction suspend fun putResult(row: ResultSummaryEntity) {
        if (insertResult(row) != -1L) {
            changed()
            if (result(row.id) == null) {
                resultCoverage(false)
            }
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

    @Query("SELECT EXISTS(SELECT 1 FROM session_summaries p WHERE " + CURRENT_SESSION + " AND p.completedAt IS NULL)")
    suspend fun hasUnfinished(): Boolean

    @Query("SELECT p.id FROM session_summaries p WHERE " + CURRENT_SESSION + " AND p.completedAt IS NULL LIMIT 2")
    suspend fun unfinishedIds(): List<String>

    @Query(
        "SELECT s.id, s.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, " +
            "p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, " +
            "p.editable, p.eligibleDate FROM sessions s LEFT JOIN session_summaries p ON " +
            "p.id=s.id AND " + CURRENT_SESSION +
            " WHERE p.id IS NULL AND (:variant IS NULL OR s.variant=:variant) AND (:afterId IS " +
            "NULL OR s.id<:afterId) ORDER BY s.id DESC LIMIT 31"
    )
    suspend fun pendingSessionsPage(variant: String?, afterId: String?): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, " +
            "p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, " +
            "p.editable, p.eligibleDate FROM session_summaries p WHERE " + CURRENT_SESSION +
            " AND (p.startedAt,p.id)<(:afterTime,:afterId) AND EXISTS(SELECT 1 FROM sessions s " +
            "WHERE s.id=p.id AND s.revision=p.revision) ORDER BY p.startedAt DESC,p.id DESC LIMIT " +
            ":limit"
    )
    suspend fun sessions(afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, " +
            "p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, " +
            "p.editable, p.eligibleDate FROM session_summaries p WHERE " + CURRENT_SESSION +
            " AND p.completedAt IS NULL AND (p.startedAt,p.id)<(:afterTime,:afterId) AND " +
            "EXISTS(SELECT 1 FROM sessions s WHERE s.id=p.id AND s.revision=p.revision) ORDER BY " +
            "p.startedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun sessionsUnfinished(afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, " +
            "p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, " +
            "p.editable, p.eligibleDate FROM session_summaries p WHERE " + CURRENT_SESSION +
            " AND p.variant=:variant AND (p.startedAt,p.id)<(:afterTime,:afterId) AND " +
            "EXISTS(SELECT 1 FROM sessions s WHERE s.id=p.id AND s.revision=p.revision) ORDER BY " +
            "p.startedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun sessionsByVariant(variant: String, afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, p.revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, " +
            "p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, " +
            "p.editable, p.eligibleDate FROM session_summaries p WHERE " + CURRENT_SESSION +
            " AND p.variant=:variant AND p.completedAt IS NULL AND " +
            "(p.startedAt,p.id)<(:afterTime,:afterId) AND EXISTS(SELECT 1 FROM sessions s WHERE " +
            "s.id=p.id AND s.revision=p.revision) ORDER BY p.startedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun sessionsByVariantUnfinished(
        variant: String,
        afterTime: Long,
        afterId: String,
        limit: Int
    ): List<SummaryRow>

    @Query(
        "SELECT s.id, 0 AS revision, p.mode, p.variant, p.difficulty, p.startedAt, " +
            "p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, " +
            "p.lessonId, p.filled, p.editable, p.eligibleDate FROM results s LEFT JOIN " +
            "result_summaries p ON p.id=s.id AND " + CURRENT_RESULT +
            " WHERE p.id IS NULL AND (:variant IS NULL OR s.variant=:variant) AND (:afterId IS " +
            "NULL OR s.id<:afterId) ORDER BY s.id DESC LIMIT 31"
    )
    suspend fun pendingResultsPage(variant: String?, afterId: String?): List<SummaryRow>

    @Query(
        "SELECT p.id, 0 AS revision, p.mode, p.variant, p.difficulty, p.startedAt, " +
            "p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, " +
            "p.lessonId, p.filled, p.editable, p.eligibleDate FROM result_summaries p WHERE " + CURRENT_RESULT +
            " AND (p.completedAt,p.id)<(:afterTime,:afterId) ORDER BY p.completedAt DESC,p.id " +
            "DESC LIMIT :limit"
    )
    suspend fun results(afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT p.id, 0 AS revision, p.mode, p.variant, p.difficulty, p.startedAt, " +
            "p.elapsedMs, p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, " +
            "p.lessonId, p.filled, p.editable, p.eligibleDate FROM result_summaries p WHERE " + CURRENT_RESULT +
            " AND p.variant=:variant AND (p.completedAt,p.id)<(:afterTime,:afterId) ORDER BY " +
            "p.completedAt DESC,p.id DESC LIMIT :limit"
    )
    suspend fun resultsByVariant(variant: String, afterTime: Long, afterId: String, limit: Int): List<SummaryRow>

    @Query("SELECT p.* FROM session_summaries p WHERE p.id=:id AND " + CURRENT_SESSION)
    suspend fun selectSession(id: String): SessionSummaryEntity?

    @Query("SELECT p.* FROM result_summaries p WHERE p.id=:id AND " + CURRENT_RESULT)
    suspend fun selectResult(id: String): ResultSummaryEntity?

    @Transaction suspend fun session(id: String): SessionSummaryEntity? {
        val row = selectSession(id) ?: return null
        if (!row.facts.hasValidCalendar()) {
            deleteSession(id)
            return null
        }
        return row
    }

    @Transaction suspend fun result(id: String): ResultSummaryEntity? {
        val row = selectResult(id) ?: return null
        if (!row.facts.hasValidCalendar()) {
            deleteResult(id)
            return null
        }
        return row
    }

    @Query("SELECT EXISTS(SELECT 1 FROM sessions WHERE id=:id)")
    suspend fun sessionExists(id: String): Boolean

    @Query("SELECT EXISTS(SELECT 1 FROM results WHERE id=:id)")
    suspend fun resultExists(id: String): Boolean

    @Query(
        "SELECT difficulty,assisted,MIN(elapsedMs) AS best FROM " +
            "result_summaries p WHERE " + CURRENT_RESULT +
            " AND variant=:variant AND mode='FREE' GROUP " +
            "BY difficulty,assisted"
    )
    suspend fun freeBests(variant: String): List<FreeBestRow>

    @Query(
        "SELECT p.id, 0 AS revision, p.mode, p.variant, p.difficulty, p.startedAt, p.elapsedMs, " +
            "p.completedAt, p.assisted, p.challengeDate, p.formalAttempt, p.lessonId, p.filled, " +
            "p.editable, p.eligibleDate FROM result_summaries p WHERE " + CURRENT_RESULT +
            " AND p.variant=:variant AND p.mode='DAILY' AND (p.challengeDate,p.id)<(:afterDate,:afterId) " +
            "ORDER BY p.challengeDate DESC,p.id DESC LIMIT :limit"
    )
    suspend fun dailyResults(variant: String, afterDate: String, afterId: String, limit: Int): List<SummaryRow>

    @Query(
        "SELECT s.id FROM sessions s LEFT JOIN session_summaries p ON p.id=s.id AND " + CURRENT_SESSION +
            " WHERE p.id IS NULL AND s.id>:after ORDER BY s.id LIMIT 1"
    )
    suspend fun nextSession(after: String): String?

    @Query(
        "SELECT s.id FROM results s LEFT JOIN result_summaries p ON p.id=s.id AND " + CURRENT_RESULT +
            " WHERE p.id IS NULL AND s.id>:after ORDER BY s.id LIMIT 1"
    )
    suspend fun nextResult(after: String): String?

    @Query("SELECT id FROM sessions WHERE mode=:mode AND (:mode!='FREE' OR variant=:variant) LIMIT 2")
    suspend fun slotIds(mode: String, variant: String): List<String>
}
