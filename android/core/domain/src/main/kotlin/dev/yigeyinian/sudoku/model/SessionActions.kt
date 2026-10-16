package dev.yigeyinian.sudoku.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

fun createSession(
    puzzle: Puzzle,
    metadata: SessionMetadata,
    id: String,
    startedAt: String,
    assessment: PuzzleAssessment? = null
): GameSession {
    require(id.isNotBlank() && id.length <= 200 && isIsoInstant(startedAt)) { "Invalid session identity" }
    return GameSession(
        id = id,
        puzzle = puzzle.copy(givens = puzzle.givens.toList(), solution = puzzle.solution.toList()),
        assessment = assessment,
        mode = metadata.mode,
        startedAt = startedAt,
        metadata = metadata
    )
}

fun sessionBoard(session: GameSession): List<Int> = session.puzzle.givens.mapIndexed { cell, given ->
    if (given ==
        0
    ) {
        session.entries[cell]
    } else {
        given
    }
}

fun commitBoardEdit(session: GameSession, result: EditResult, action: BoardEdit): SessionActionResult {
    if (session.completion != null) {
        return SessionActionResult(session, false)
    }
    val before = BoardLayers(session.entries.toList(), session.notes.toList())
    val after = BoardLayers(result.entries.toList(), result.notes.toList())
    val boardChanged = before != after
    val generated = action == BoardEdit.GenerateNotes
    if (!boardChanged && !generated) {
        return SessionActionResult(session, false)
    }

    // History owns board layers only; undo cannot revoke assistance already received.
    val assistance = if (generated) {
        session.assistance.copy(
            candidateCount = session.assistance.candidateCount + 1,
            assisted = true
        )
    } else {
        session.assistance
    }
    return SessionActionResult(
        session.copy(
            entries = after.entries,
            notes = after.notes,
            assistance = assistance,
            undoStack = if (boardChanged) {
                session.undoStack +
                    HistoryMove(before, after)
            } else {
                session.undoStack
            },
            redoStack = if (boardChanged) emptyList() else session.redoStack
        ),
        true
    )
}

fun applySessionAction(session: GameSession, action: SessionFactAction): SessionActionResult {
    if (session.completion != null) {
        return SessionActionResult(session, false)
    }
    if (action == SessionFactAction.UNDO || action == SessionFactAction.REDO) {
        val undo = action == SessionFactAction.UNDO
        val source = if (undo) session.undoStack else session.redoStack
        val move = source.lastOrNull() ?: return SessionActionResult(session, false)
        val layers = if (undo) move.before else move.after
        return SessionActionResult(
            session.copy(
                entries = layers.entries.toList(),
                notes = layers.notes.toList(),
                undoStack = if (undo) {
                    source.dropLast(1)
                } else {
                    session.undoStack +
                        move
                },
                redoStack = if (undo) session.redoStack + move else source.dropLast(1)
            ),
            true
        )
    }

    val assistance = session.assistance
    return SessionActionResult(
        session.copy(
            assistance = if (action ==
                SessionFactAction.HINT_SHOWN
            ) {
                assistance.copy(hintCount = assistance.hintCount + 1, assisted = true)
            } else {
                assistance.copy(
                    checkCount =
                    assistance.checkCount + 1,
                    assisted = true
                )
            }
        ),
        true
    )
}

fun completeSession(session: GameSession, completedAt: String, elapsedMs: Long, boardComplete: Boolean): GameSession {
    if (session.completion != null || !boardComplete) {
        return session
    }
    require(isIsoInstant(completedAt) && elapsedMs in 0..MAX_SAFE_INTEGER)
    return session.copy(elapsedMs = elapsedMs, completion = Completion(completedAt, elapsedMs))
}

fun isChallengeDate(value: String): Boolean = runCatching {
    value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) &&
        LocalDate.parse(value).toString() == value
}.getOrDefault(false)
fun challengeDate(now: Instant): String = now.atZone(ZoneId.of("Asia/Shanghai")).toLocalDate().toString()
fun dailyFormalId(date: String, variant: Variant): String {
    require(isChallengeDate(date))
    return if (variant == Variant.CLASSIC) "daily:$date:formal" else "daily:${variant.wireName}:$date:formal"
}
fun dailySeedMaterial(date: String): List<UByte> {
    require(isChallengeDate(date))
    return "daily:$date".encodeToByteArray().map { it.toUByte() }
}
fun restartDailySession(session: GameSession): GameSession {
    require(session.mode == GameMode.DAILY)
    if (session.completion != null) {
        return session
    }
    return session.copy(
        entries = List(BOARD_SIZE) {
            0
        },
        notes = List(BOARD_SIZE) { 0 },
        undoStack = emptyList(),
        redoStack = emptyList()
    )
}

/** Milliseconds from a monotonic source; persisted snapshots never imply running ownership. */
class SessionClock(initialElapsedMs: Long) {
    private var elapsedMs = initialElapsedMs.also { require(it in 0..MAX_SAFE_INTEGER) }
    private var runningSince: Long? = null
    val isRunning: Boolean get() = runningSince != null

    fun resume(monotonicMs: Long) {
        require(monotonicMs >= 0)
        if (runningSince == null) {
            runningSince = monotonicMs
        }
    }

    fun elapsedAt(monotonicMs: Long): Long {
        val start = runningSince ?: return elapsedMs
        require(monotonicMs >= start)
        return Math.addExact(elapsedMs, monotonicMs - start).also { require(it <= MAX_SAFE_INTEGER) }
    }

    fun pause(monotonicMs: Long): Long {
        elapsedMs = elapsedAt(monotonicMs)
        runningSince = null
        return elapsedMs
    }
}
