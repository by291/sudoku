package dev.sudoku.app.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Starts a session with independently owned board values. */
fun createSession(
    puzzle: Puzzle,
    metadata: SessionMetadata,
    id: String,
    startedAt: String,
    assessment: PuzzleAssessment? = null
): GameSession {
    require(id.isNotBlank() && id.length <= 200 && isIsoInstant(startedAt)) {
        "Invalid session identity"
    }

    return GameSession(
        id = id,
        puzzle = puzzle.copy(givens = puzzle.givens.toList(), solution = puzzle.solution.toList()),
        assessment = assessment,
        mode = metadata.mode,
        startedAt = startedAt,
        metadata = metadata
    )
}

/** Combines immutable givens with the current editable entries. */
fun sessionBoard(session: GameSession): List<Int> =
    session.puzzle.givens.mapIndexed { cell, given ->
        if (given == 0) {
            session.entries[cell]
        } else {
            given
        }
    }

private fun advanceAssistance(count: Long): Long {
    // An imported counter at the portable limit must remain persistable after another action.
    if (count >= MAX_SAFE_INTEGER) {
        return MAX_SAFE_INTEGER
    }

    return count + 1
}

/** Commits edited layers and retains assistance independently of undo history. */
fun commitBoardEdit(
    session: GameSession,
    result: EditResult,
    action: BoardEdit
): SessionActionResult {
    if (session.completion != null) {
        return SessionActionResult(session, changed = false)
    }

    val before = BoardLayers(session.entries.toList(), session.notes.toList())
    val after = BoardLayers(result.entries.toList(), result.notes.toList())
    val hasBoardChanged = before != after
    val hasGeneratedNotes = action == BoardEdit.GenerateNotes
    if (!hasBoardChanged && !hasGeneratedNotes) {
        return SessionActionResult(session, changed = false)
    }

    // History owns board layers only; undo cannot revoke assistance already received.
    val assistance = if (hasGeneratedNotes) {
        session.assistance.copy(
            candidateCount = advanceAssistance(session.assistance.candidateCount),
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
            undoStack = if (hasBoardChanged) {
                session.undoStack + HistoryMove(before, after)
            } else {
                session.undoStack
            },
            redoStack = if (hasBoardChanged) emptyList() else session.redoStack
        ),
        changed = true
    )
}

/** Applies an undo, redo or assistance fact without changing completion records. */
fun applySessionAction(session: GameSession, action: SessionFactAction): SessionActionResult {
    if (session.completion != null) {
        return SessionActionResult(session, changed = false)
    }

    if (action == SessionFactAction.UNDO || action == SessionFactAction.REDO) {
        val isUndo = action == SessionFactAction.UNDO
        val source = if (isUndo) session.undoStack else session.redoStack
        val move = source.lastOrNull() ?: return SessionActionResult(session, changed = false)
        val layers = if (isUndo) move.before else move.after
        return SessionActionResult(
            session.copy(
                entries = layers.entries.toList(),
                notes = layers.notes.toList(),
                undoStack = if (isUndo) {
                    source.dropLast(1)
                } else {
                    session.undoStack + move
                },
                redoStack = if (isUndo) session.redoStack + move else source.dropLast(1)
            ),
            changed = true
        )
    }

    val assistance = session.assistance
    return SessionActionResult(
        session.copy(
            assistance = if (action == SessionFactAction.HINT_SHOWN) {
                assistance.copy(
                    hintCount = advanceAssistance(assistance.hintCount),
                    assisted = true
                )
            } else {
                assistance.copy(
                    checkCount = advanceAssistance(assistance.checkCount),
                    assisted = true
                )
            }
        ),
        changed = true
    )
}

/** Records the first confirmed completion and freezes its elapsed milliseconds. */
fun completeSession(
    session: GameSession,
    completedAt: String,
    elapsedMs: Long,
    boardComplete: Boolean
): GameSession {
    if (session.completion != null || !boardComplete) {
        return session
    }

    require(isIsoInstant(completedAt) && elapsedMs in 0..MAX_SAFE_INTEGER)

    return session.copy(elapsedMs = elapsedMs, completion = Completion(completedAt, elapsedMs))
}

/** Checks the canonical four-digit-year challenge date. */
fun isChallengeDate(value: String): Boolean = runCatching {
    value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) &&
        LocalDate.parse(value).toString() == value
}.getOrDefault(false)

/** Returns the calendar date at this instant in the challenge timezone. */
fun challengeDate(now: Instant): String =
    now.atZone(ZoneId.of("Asia/Shanghai")).toLocalDate().toString()

/** Eligibility uses the domain's historical Shanghai calendar, including past daylight saving. */
fun eligibleChallengeDate(metadata: SessionMetadata.Daily, completedAt: Instant?): String? =
    metadata.challengeDate.takeIf {
        metadata.formalAttempt && completedAt != null && challengeDate(completedAt) == it
    }

/** Builds the stable formal-attempt ID, retaining the historical Classic spelling. */
fun dailyFormalId(date: String, variant: Variant): String {
    require(isChallengeDate(date))
    return if (variant ==
        Variant.CLASSIC
    ) {
        "daily:$date:formal"
    } else {
        "daily:${variant.wireName}:$date:formal"
    }
}

/** Encodes the challenge date as stable seed derivation material. */
fun dailySeedMaterial(date: String): List<UByte> {
    require(isChallengeDate(date))
    return "daily:$date".encodeToByteArray().map { it.toUByte() }
}

/** Resets daily board history while keeping the attempt and its assistance facts. */
fun restartDailySession(session: GameSession): GameSession {
    require(session.mode == GameMode.DAILY)
    if (session.completion != null) {
        return session
    }
    return session.copy(
        entries = List(BOARD_SIZE) { 0 },
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

    /** Starts accumulating from the supplied monotonic milliseconds. */
    fun resume(monotonicMs: Long) {
        require(monotonicMs >= 0)
        if (runningSince == null) {
            runningSince = monotonicMs
        }
    }

    /** Reads elapsed milliseconds without settling the running interval. */
    fun elapsedAt(monotonicMs: Long): Long {
        val start = runningSince ?: return elapsedMs
        require(monotonicMs >= start)
        return Math.addExact(elapsedMs, monotonicMs - start).also {
            require(it <= MAX_SAFE_INTEGER)
        }
    }

    /** Settles the running interval and returns accumulated milliseconds. */
    fun pause(monotonicMs: Long): Long {
        elapsedMs = elapsedAt(monotonicMs)
        runningSince = null
        return elapsedMs
    }
}

/** Delay to the Beijing day boundary, capped to notice clock changes while a screen is visible. */
fun challengeRefreshDelay(now: Instant): Long {
    val local = now.atZone(ZoneId.of("Asia/Shanghai"))
    val next = local.toLocalDate().plusDays(1).atStartOfDay(local.zone).toInstant()
    return java.time.Duration.between(now, next).toMillis().coerceIn(1, 60_000)
}
