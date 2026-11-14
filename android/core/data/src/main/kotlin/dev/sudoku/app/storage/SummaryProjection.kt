package dev.sudoku.app.storage

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import dev.sudoku.app.model.BOARD_SIZE
import dev.sudoku.app.model.Completion
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.eligibleChallengeDate
import dev.sudoku.app.model.isChallengeDate
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
            value = [
                "variant",
                "startedAt",
                "id"
            ]
        ),
        Index(value = ["startedAt", "id"]),
        Index(
            value = [
                "completedAt",
                "startedAt",
                "id"
            ]
        )
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
        Index(
            value = [
                "variant",
                "completedAt",
                "id"
            ]
        ),
        Index(
            value = [
                "variant",
                "mode",
                "challengeDate",
                "id"
            ]
        ),
        Index(value = ["completedAt", "id"]),
        Index(
            value = [
                "variant",
                "mode",
                "difficulty",
                "assisted"
            ]
        ),
        Index(
            value = [
                "variant",
                "formalAttempt",
                "eligibleDate"
            ]
        )
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
    val givens = puzzle.givens
    val filledCells = givens.indices.count { cell -> givens[cell] == 0 && entries[cell] != 0 }

    return SummaryFields(
        mode = mode.name,
        variant = puzzle.rules.variant.wireName,
        difficulty = puzzle.difficulty.name,
        startedAt = Instant.parse(startedAt).toEpochMilli(),
        elapsedMs = elapsedMs,
        completedAt = completed?.toEpochMilli(),
        assisted = assistance.assisted,
        challengeDate = daily?.challengeDate,
        formalAttempt = daily?.formalAttempt,
        lessonId = (metadata as? SessionMetadata.Learning)?.lessonId,
        filled = filledCells,
        editable = givens.count { it == 0 },
        eligibleDate = daily?.let { eligibleChallengeDate(it, completed) }
    )
}

internal fun SummaryRow.domain(): GameSummary? {
    val facts = facts ?: return null
    require(facts.hasValidCalendar()) { "Invalid daily projection eligibility" }
    require(
        id.isNotBlank() && revision >= 0 && facts.elapsedMs >= 0 &&
            facts.editable in 0..BOARD_SIZE && facts.filled in 0..facts.editable
    )
    val metadata = when (GameMode.valueOf(facts.mode)) {
        GameMode.FREE -> SessionMetadata.Free
        GameMode.DAILY -> {
            val date = requireNotNull(facts.challengeDate)
            require(isChallengeDate(date))
            SessionMetadata.Daily(date, formalAttempt = requireNotNull(facts.formalAttempt))
        }
        GameMode.LEARNING -> SessionMetadata.Learning(requireNotNull(facts.lessonId))
    }
    val variant = Variant.entries.single { candidate -> candidate.wireName == facts.variant }
    val difficulty = Difficulty.valueOf(facts.difficulty)
    require(difficulty in variant.difficulties)

    val completion = facts.completedAt?.let { instant ->
        Completion(Instant.ofEpochMilli(instant).toString(), facts.elapsedMs)
    }

    return GameSummary(
        id = id,
        revision = revision,
        variant = variant,
        difficulty = difficulty,
        metadata = metadata,
        startedAt = Instant.ofEpochMilli(facts.startedAt).toString(),
        elapsedMs = facts.elapsedMs,
        completion = completion,
        assisted = facts.assisted,
        filled = facts.filled,
        editable = facts.editable
    )
}

/** Historical Shanghai offsets come from the same domain calendar used to build projections. */
internal fun SummaryFields.hasValidCalendar(): Boolean {
    if (mode != GameMode.DAILY.name) {
        return true
    }

    // Lightweight SQL selection has already checked daily field presence and calendar-date shape.
    val metadata = SessionMetadata.Daily(
        requireNotNull(challengeDate),
        requireNotNull(formalAttempt)
    )
    val expectedEligibleDate =
        eligibleChallengeDate(metadata, completedAt?.let(Instant::ofEpochMilli))
    return eligibleDate == expectedEligibleDate
}
