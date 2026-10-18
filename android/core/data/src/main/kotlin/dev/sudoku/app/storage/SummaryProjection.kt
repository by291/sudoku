package dev.sudoku.app.storage

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import dev.sudoku.app.model.Completion
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.eligibleChallengeDate
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
    val version: Int = CURRENT_PROJECTION_VERSION
)

@Entity(
    tableName = "result_summaries",
    indices = [
        Index(value = ["variant", "completedAt", "id"]),
        Index(value = ["variant", "mode", "challengeDate", "id"]),
        Index(value = ["completedAt", "id"]),
        Index(value = ["variant", "mode", "difficulty", "assisted"]),
        Index(value = ["variant", "formalAttempt", "eligibleDate"])
    ]
)
data class ResultSummaryEntity(
    @PrimaryKey val id: String,
    @Embedded val facts: SummaryFields,
    val version: Int = CURRENT_PROJECTION_VERSION
)

data class SummaryRow(val id: String, val revision: Long, @Embedded val facts: SummaryFields?)

data class FreeBestRow(val difficulty: String, val assisted: Boolean, val best: Long)

internal fun GameSession.summaryFields(): SummaryFields {
    val daily = metadata as? SessionMetadata.Daily
    val completed = completion?.completedAt?.let(Instant::parse)
    return SummaryFields(
        mode.name, puzzle.rules.variant.wireName, puzzle.difficulty.name,
        Instant.parse(startedAt).toEpochMilli(), elapsedMs, completed?.toEpochMilli(), assistance.assisted,
        daily?.challengeDate, daily?.formalAttempt, (metadata as? SessionMetadata.Learning)?.lessonId,
        puzzle.givens.indices.count { puzzle.givens[it] == 0 && entries[it] != 0 },
        puzzle.givens.count { it == 0 },
        daily?.let { eligibleChallengeDate(it, completed) }
    )
}

internal fun SummaryRow.domain(): GameSummary? = facts?.let {
    require(it.hasValidCalendar()) { "Invalid daily projection eligibility" }
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

/** Historical Shanghai offsets come from the same domain calendar used to build projections. */
internal fun SummaryFields.hasValidCalendar(): Boolean {
    if (mode != GameMode.DAILY.name) {
        return true
    }

    // Lightweight SQL selection has already checked daily field presence and calendar-date shape.
    val metadata = SessionMetadata.Daily(requireNotNull(challengeDate), requireNotNull(formalAttempt))
    val expectedEligibleDate = eligibleChallengeDate(metadata, completedAt?.let(Instant::ofEpochMilli))
    return eligibleDate == expectedEligibleDate
}
