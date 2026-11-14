package dev.sudoku.app.storage

import androidx.room.Query
import androidx.room.Transaction

/** Stores projection coverage and its pagination generation. */
interface SummaryCoverageDao {
    @Query(
        "INSERT OR IGNORE INTO " +
            "summary_version(id,generation,sessionsComplete,resultsComplete,projectionVersion) " +
            "VALUES(1,0,0,0," + CURRENT_PROJECTION_VERSION + ")"
    )
    suspend fun initializeVersion()

    @Query(
        "UPDATE summary_version SET " +
            "generation=generation+1,sessionsComplete=0,resultsComplete=0,projectionVersion=" +
            CURRENT_PROJECTION_VERSION +
            " WHERE id=1 AND generation<" + Long.MAX_VALUE + " AND projectionVersion!=" +
            CURRENT_PROJECTION_VERSION
    )
    suspend fun refreshCoverageVersion()

    @Query(
        "UPDATE summary_version SET generation=generation+1 WHERE id=1 AND generation<" +
            Long.MAX_VALUE
    )
    suspend fun incrementVersion(): Int

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
    @Transaction
    suspend fun pendingSessions(): Boolean {
        initializeVersion()
        ensureCurrentCoverage()

        if (coverage()?.sessionsComplete == true) {
            return false
        }

        val pending = hasPendingSessions()
        if (!pending) {
            sessionCoverage(complete = true)
        }

        return pending
    }

    @Transaction
    suspend fun pendingResults(variant: String? = null): Boolean {
        initializeVersion()
        ensureCurrentCoverage()

        if (coverage()?.resultsComplete == true) {
            return false
        }

        if (!hasPendingResults(null)) {
            resultCoverage(complete = true)
            return false
        }

        return variant == null || hasPendingResults(variant)
    }

    /** Advances the cursor fence in the transaction that changes the projection. */
    suspend fun changed() {
        initializeVersion()
        ensureCurrentCoverage()
        check(incrementVersion() == 1) { "Summary generation exhausted" }
    }

    suspend fun ensureCurrentCoverage() {
        refreshCoverageVersion()
        // SQLite promotes overflowing INTEGER arithmetic to REAL, which can freeze the fence.
        check(coverage()?.projectionVersion == CURRENT_PROJECTION_VERSION) {
            "Summary generation exhausted"
        }
    }

    @Query(
        "SELECT EXISTS(SELECT 1 FROM sessions s LEFT JOIN session_summaries p ON p.id=s.id " +
            "AND " + CURRENT_SESSION + " WHERE p.id IS NULL)"
    )
    suspend fun hasPendingSessions(): Boolean

    @Query(
        "SELECT EXISTS(SELECT 1 FROM results s LEFT JOIN result_summaries p ON p.id=s.id AND " +
            CURRENT_RESULT +
            " WHERE p.id IS NULL AND (:variant IS NULL OR s.variant=:variant))"
    )
    suspend fun hasPendingResults(variant: String?): Boolean
}
