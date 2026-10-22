package dev.sudoku.app.model

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Freezes mutable caller data before suspension and validates current and historical session facts. */
internal class PortableSessionValidator(private val json: Json, private val validator: MathematicalValidator) {

    suspend fun validate(input: GameSession): GameSession {
        // Capture every nested layer before the first suspension; callers may mutate their lists.
        val session = json.decodeFromString(
            GameSession.serializer(),
            json.encodeToString(
                GameSession.serializer(),
                input
            )
        )
        requireData(
            identifier(session.id) && isIsoInstant(session.startedAt) && safeInteger(session.elapsedMs),
            "Invalid session identity or duration"
        )

        validatePuzzleShape(session.puzzle)
        requireData(session.mode == session.metadata.mode, "Mode metadata mismatch")
        when (val metadata = session.metadata) {
            SessionMetadata.Free -> Unit
            is SessionMetadata.Learning -> requireData(identifier(metadata.lessonId), "Invalid lesson identity")
            is SessionMetadata.Daily -> {
                requireData(isChallengeDate(metadata.challengeDate), "Invalid challenge date")
                requireData(
                    metadata.formalAttempt == (
                        session.id == dailyFormalId(
                            metadata.challengeDate,
                            session.puzzle.rules.variant
                        )
                        ),
                    "Daily identity mismatch"
                )
            }
        }

        val assistance = session.assistance
        requireData(
            listOf(
                assistance.hintCount,
                assistance.checkCount,
                assistance.candidateCount
            ).all(::safeInteger),
            "Invalid assistance counters"
        )
        requireData(
            assistance.assisted || listOf(
                assistance.hintCount,
                assistance.checkCount,
                assistance.candidateCount
            ).all { it == 0L },
            "Assistance cannot be revoked"
        )

        val current = BoardLayers(session.entries, session.notes)
        validateLayers(current, session.puzzle.givens)
        listOf(session.undoStack, session.redoStack).forEach { history ->
            history.forEach { move ->
                validateLayers(move.before, session.puzzle.givens)
                validateLayers(move.after, session.puzzle.givens)
                requireData(move.before != move.after, "History contains an empty move")
            }
        }
        requireData(
            session.undoStack.zipWithNext().all { (
                first,
                next
            ) ->
                first.after == next.before
            },
            "Disconnected undo history"
        )
        requireData(
            session.redoStack.zipWithNext().all { (
                first,
                next
            ) ->
                first.before == next.after
            },
            "Disconnected redo history"
        )
        requireData(
            session.undoStack.lastOrNull()?.after?.let { it == current } != false &&
                session.redoStack.lastOrNull()?.before?.let { it == current } != false,
            "History does not match current board"
        )

        validateMath(session.puzzle.content())
        session.completion?.let { completion ->
            requireData(
                isIsoInstant(completion.completedAt) && safeInteger(completion.elapsedMs) &&
                    completion.elapsedMs == session.elapsedMs,
                "Invalid completion"
            )
            validateMath(session.puzzle.content().copy(solution = sessionBoard(session)))
        }

        val assessment = validateCall {
            validator.validateAssessment(
                session.assessment,
                session.puzzle.rules.variant,
                session.puzzle.difficulty
            )
        }

        // A serializer round trip gives every nested collection independent ownership across awaits.
        return json.decodeFromString(
            GameSession.serializer(),
            json.encodeToString(
                GameSession.serializer(),
                session.copy(assessment = assessment)
            )
        )
    }

    private suspend fun validateMath(content: PuzzleContent) {
        when (val result = validateCall { validator.validatePuzzle(content) }) {
            Validation.Valid -> Unit
            is Validation.Invalid -> throw InvalidPortableData(result.issues.joinToString("; "))
        }
    }

    private fun validatePuzzleShape(puzzle: Puzzle) {
        requireData(board(puzzle.givens) && board(puzzle.solution), "Invalid board values")
        requireData(puzzle.difficulty in puzzle.rules.variant.difficulties, "Unsupported variant difficulty")
        requireData(puzzle.seed.isNotEmpty() && puzzle.puzzleVersion.isNotEmpty(), "Missing puzzle metadata")
        val version = when (puzzle.puzzleVersion) {
            "sudoku-v11", "sudoku-variants-v11" -> "v11"
            "sudoku-v12", "sudoku-variants-v12" -> "v12"
            else -> null
        }
        if (version != null) {
            requireData(
                puzzle.seed.matches(Regex("[0-9a-f]{64}")) &&
                    puzzle.puzzleVersion ==
                    if (puzzle.rules == PuzzleRules.Classic) "sudoku-$version" else "sudoku-variants-$version",
                "Invalid current-generation identity"
            )
        }
    }

    private fun validateLayers(layers: BoardLayers, givens: List<Int>) {
        requireData(
            board(layers.entries) && layers.notes.size == BOARD_SIZE &&
                layers.notes.all { it in 0..ALL_DIGITS_MASK },
            "Invalid board layers"
        )
        requireData(
            (0 until BOARD_SIZE).all { cell ->
                (givens[cell] == 0 || layers.entries[cell] == 0) &&
                    (layers.notes[cell] == 0 || (givens[cell] == 0 && layers.entries[cell] == 0))
            },
            "Protected given or note overlap"
        )
    }

    private suspend fun <T> validateCall(operation: suspend () -> EngineOutcome<T>): T {
        val outcome = try {
            operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            throw SnapshotValidationUnavailable(error.message ?: "Semantic validator unavailable")
        }
        return completeOrUnavailable(outcome)
    }

    private fun <T> completeOrUnavailable(outcome: EngineOutcome<T>): T = when (outcome) {
        is EngineOutcome.Completed -> outcome.value
        is EngineOutcome.Incomplete ->
            throw SnapshotValidationUnavailable("Semantic validation did not complete")
        EngineOutcome.Cancelled -> throw SnapshotValidationUnavailable("Semantic validation cancelled")
        EngineOutcome.TimedOut -> throw SnapshotValidationUnavailable("Semantic validation timed out")
        is EngineOutcome.InvalidInput -> throw InvalidPortableData(outcome.message)
        is EngineOutcome.Failed -> throw SnapshotValidationUnavailable(outcome.message)
    }
}
