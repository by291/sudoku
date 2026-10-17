package dev.yigeyinian.sudoku.game

import dev.yigeyinian.sudoku.designsystem.difficultyLabel
import dev.yigeyinian.sudoku.designsystem.formatElapsedTime
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.GameSession
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.variant
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

internal data class SavedGameSummary(
    val title: String,
    val difficulty: String,
    val source: String,
    val sourceDetail: String?,
    val progress: String,
    val startedAt: String
)

internal fun GameSession.savedGameSummary(zone: ZoneId, currentYear: Int): SavedGameSummary {
    val emptyCells = puzzle.givens.indices.filter { puzzle.givens[it] == 0 }
    // Filling progress is not a correctness check and does not include notes or puzzle givens.
    val filled = emptyCells.count { entries[it] != 0 }
    val source = when (metadata) {
        SessionMetadata.Free -> "普通对局"
        is SessionMetadata.Learning -> "课程练习"
        is SessionMetadata.Daily -> "每日挑战"
    }
    val sourceDetail = when (val metadata = metadata) {
        is SessionMetadata.Daily -> {
            val attempt = if (metadata.formalAttempt) "正式" else "练习"
            "${metadata.challengeDate} · $attempt"
        }
        else -> null
    }
    val started = Instant.parse(startedAt).atZone(zone)
    // Retain the year for older saves so a compact date never confuses sessions across years.
    val timeFormat = if (started.year == currentYear) savedGameTimeFormat else savedGameFullTimeFormat
    return SavedGameSummary(
        title = variantLabel(puzzle.rules.variant),
        difficulty = difficultyLabel(puzzle.difficulty),
        source = source,
        sourceDetail = sourceDetail,
        progress = "已填 $filled / ${emptyCells.size} · ${formatElapsedTime(elapsedMs)}",
        startedAt = "${started.format(timeFormat)} 开始"
    )
}

private val savedGameTimeFormat = DateTimeFormatter.ofPattern("MM-dd HH:mm", Locale.CHINA)
private val savedGameFullTimeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.CHINA)
