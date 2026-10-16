package dev.yigeyinian.sudoku.model

import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class InvalidPortableData(message: String) : IllegalArgumentException(message)
class SnapshotValidationUnavailable(message: String) : IllegalStateException(message)

object BackupLimits {
    const val BYTES = 25 * 1024 * 1024
    const val RECORDS = 10_000
    const val HISTORY_PER_SESSION = 2_000
    const val HISTORY_TOTAL = 10_000
    const val NODES = 2_000_000
    const val DEPTH = 32
}

private val canonicalInstant = DateTimeFormatterBuilder().appendInstant(3).toFormatter()
fun isIsoInstant(value: String): Boolean = runCatching {
    val instant = Instant.parse(value)
    instant.toEpochMilli() in -8_640_000_000_000_000L..8_640_000_000_000_000L &&
        canonicalInstant.format(instant) == value
}.getOrDefault(false)
fun isoInstant(value: Instant): String = canonicalInstant.format(value)

/** Parses portable facts separately from the injected mathematical authority; never owns storage. */
class PortableCodec(private val validator: MathematicalValidator) {
    val json = Json {
        classDiscriminator = "kind"
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    suspend fun decodeBackup(text: String): LocalBackup {
        requireData(text.toByteArray(Charsets.UTF_8).size <= BackupLimits.BYTES, "Backup exceeds the 25 MiB limit")
        preflightDepth(text)
        val tree = try {
            json.parseToJsonElement(text)
        } catch (error: IllegalArgumentException) {
            throw InvalidPortableData(error.message ?: "Invalid JSON")
        }
        return decodeEnvelope(tree, transferLimits = true)
    }

    private suspend fun decodeEnvelope(tree: JsonElement, transferLimits: Boolean): LocalBackup {
        if (transferLimits) {
            checkResources(tree)
        }
        val normalized = try {
            normalizeBackup(tree, transferLimits)
        } catch (error: InvalidPortableData) {
            throw error
        } catch (error: IllegalArgumentException) {
            throw InvalidPortableData(error.message ?: "Invalid backup shape")
        }
        val backup = try {
            json.decodeFromJsonElement(LocalBackup.serializer(), normalized)
        } catch (error: IllegalArgumentException) {
            throw InvalidPortableData(error.message ?: "Invalid backup shape")
        }
        validateBackup(backup, transferLimits)
        return backup.copy(
            sessions = backup.sessions.map { it.copy(session = validateSession(it.session)) },
            results = backup.results.map { it.copy(session = validateSession(it.session)) }
        )
    }

    suspend fun decodeSessionRecord(text: String): SessionRecord = decodeRecordEnvelope(
        text,
        false
    ).sessions.single()

    suspend fun decodeResultRecord(text: String): ResultRecord = decodeRecordEnvelope(text, true).results.single()

    private suspend fun decodeRecordEnvelope(text: String, result: Boolean): LocalBackup {
        preflightDepth(text)
        val record = try {
            json.parseToJsonElement(text)
        } catch (error: IllegalArgumentException) {
            throw InvalidPortableData(error.message ?: "Invalid record JSON")
        }
        val envelope = buildJsonObject {
            put("backupVersion", JsonPrimitive(1))
            put("exportedAt", JsonPrimitive("2000-01-01T00:00:00.000Z"))
            put("sessions", JsonArray(if (result) emptyList() else listOf(record)))
            put("results", JsonArray(if (result) listOf(record) else emptyList()))
            put("lessons", JsonArray(emptyList()))
            put("settings", json.encodeToJsonElement(Settings.serializer(), Settings()))
        }
        // Transfer quotas must never turn an accepted local save into corrupt data on its next read.
        return decodeEnvelope(envelope, transferLimits = false)
    }

    fun encodeBackup(backup: LocalBackup): String {
        // Escape UTF-16 units before UTF-8 transport: replacing malformed surrogates loses legacy metadata.
        val tree = json.encodeToJsonElement(LocalBackup.serializer(), backup)
        val text = stripAbsent(tree).toString()
        return buildString(text.length) {
            text.forEach { character ->
                if (character.isSurrogate()) {
                    append("\\u")
                    append(character.code.toString(16).padStart(4, '0'))
                } else {
                    append(character)
                }
            }
        }.also {
            requireData(
                it.toByteArray(Charsets.UTF_8).size <= BackupLimits.BYTES,
                "Backup exceeds byte limit"
            )
        }
    }

    suspend fun validateSession(input: GameSession): GameSession {
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

    fun validateSettings(settings: Settings) {
        requireData(
            settings.currentLessonId == null || settings.currentLessonId in courseIds,
            "Invalid current lesson"
        )
        val stages = settings.lessonStages ?: return
        requireData(
            stages.size <= 32 && stages.all { (
                id,
                stage
            ) ->
                id in courseIds && stage >= 0 && stage < if (id.endsWith("-combined")) 6 else 2
            },
            "Invalid lesson cursor"
        )
    }

    fun validateLesson(progress: LessonProgress) {
        // Historical completion IDs deliberately remain valid after a catalogue revision.
        requireData(identifier(progress.lessonId) && isIsoInstant(progress.completedAt), "Invalid lesson progress")
    }

    private suspend fun validateMath(content: PuzzleContent) {
        when (val result = validateCall { validator.validatePuzzle(content) }) {
            Validation.Valid -> Unit
            is Validation.Invalid -> throw InvalidPortableData(result.issues.joinToString("; "))
        }
    }

    private fun validateBackup(backup: LocalBackup, transferLimits: Boolean) {
        requireData(
            backup.backupVersion == 1 && isIsoInstant(backup.exportedAt),
            "Invalid backup version or export time"
        )
        if (transferLimits) {
            requireData(
                backup.sessions.size + backup.results.size + backup.lessons.size <= BackupLimits.RECORDS,
                "Too many records"
            )
        }
        requireData(
            backup.sessions.all { it.formatVersion == 2 && safeInteger(it.revision) },
            "Invalid session format or revision"
        )
        requireData(
            backup.results.all { it.formatVersion == 2 && it.session.completion != null },
            "Result must be completed"
        )
        requireData(
            backup.sessions.map { it.session.id }.distinct().size == backup.sessions.size &&
                backup.results.map { it.session.id }.distinct().size == backup.results.size &&
                backup.lessons.map { it.lessonId }.distinct().size == backup.lessons.size,
            "Duplicate collection identity"
        )
        val slots = backup.sessions.map { it.session }
            .filter { it.mode != GameMode.DAILY }
            .map { if (it.mode == GameMode.FREE) "free:${it.puzzle.rules.variant}" else "learning" }
        requireData(slots.distinct().size == slots.size, "Multiple sessions occupy one active slot")
        if (transferLimits) {
            val histories = (backup.sessions.map { it.session } + backup.results.map { it.session })
                .map { it.undoStack.size + it.redoStack.size }
            requireData(
                histories.all { it <= BackupLimits.HISTORY_PER_SESSION } &&
                    histories.sum() <= BackupLimits.HISTORY_TOTAL,
                "Backup exceeds history limits"
            )
        }
        val results = backup.results.associateBy { it.session.id }
        backup.sessions.forEach { record ->
            val original = results[record.session.id]?.session ?: return@forEach
            val session = record.session
            requireData(
                session.mode == original.mode && session.startedAt == original.startedAt &&
                    session.metadata == original.metadata && session.puzzle == original.puzzle &&
                    (session.completion == null || session.completion == original.completion),
                "Inconsistent original result facts"
            )
        }
        backup.lessons.forEach(::validateLesson)
        validateSettings(backup.settings)
    }

    private fun validatePuzzleShape(puzzle: Puzzle) {
        requireData(board(puzzle.givens) && board(puzzle.solution), "Invalid board values")
        requireData(puzzle.difficulty in puzzle.rules.variant.difficulties, "Unsupported variant difficulty")
        requireData(puzzle.seed.isNotEmpty() && puzzle.puzzleVersion.isNotEmpty(), "Missing puzzle metadata")
        val current = puzzle.puzzleVersion in setOf("sudoku-v11", "sudoku-variants-v11")
        if (current) {
            requireData(
                puzzle.seed.matches(Regex("[0-9a-f]{64}")) &&
                    puzzle.puzzleVersion ==
                    if (puzzle.rules == PuzzleRules.Classic) "sudoku-v11" else "sudoku-variants-v11",
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

    private fun normalizeBackup(tree: JsonElement, transferLimits: Boolean): JsonObject {
        val root = tree as? JsonObject ?: throw InvalidPortableData("Backup object required")
        val settings = root["settings"] as? JsonObject ?: throw InvalidPortableData("Settings object required")
        requireData(
            setOf(
                "theme",
                "showTimer",
                "highlightConflicts"
            ).all(settings::containsKey),
            "Missing settings fields"
        )
        requireData(
            settings["formatVersion"]?.jsonPrimitive?.content.let { it == null || it == "1" },
            "Unsupported settings format"
        )
        (root["lessons"] as? JsonArray)?.forEach { raw ->
            val lesson = raw as? JsonObject ?: throw InvalidPortableData("Invalid lesson record")
            requireData(
                lesson["formatVersion"]?.jsonPrimitive?.content.let { it == null || it == "1" },
                "Unsupported lesson format"
            )
        }
        return JsonObject(
            root.mapValues { (key, value) ->
                if (key !in setOf("sessions", "results")) {
                    return@mapValues value
                }
                val records = value as? JsonArray ?: throw InvalidPortableData("Backup collections required")
                JsonArray(
                    records.map { raw ->
                        val record = raw as? JsonObject ?: throw InvalidPortableData("Invalid record")
                        val version = record["formatVersion"]?.jsonPrimitive?.content
                        requireData(version == "1" || version == "2", "Unsupported record format")
                        val session = record["session"] as? JsonObject ?: throw InvalidPortableData("Invalid session")
                        requireData(
                            setOf(
                                "id",
                                "puzzle",
                                "mode",
                                "entries",
                                "notes",
                                "undoStack",
                                "redoStack",
                                "elapsedMs",
                                "assistance",
                                "startedAt",
                                "completion",
                                "metadata"
                            ).all(session::containsKey),
                            "Missing session fields"
                        )
                        val assistance =
                            session["assistance"] as? JsonObject ?: throw InvalidPortableData("Missing assistance")
                        requireData(
                            setOf(
                                "hintCount",
                                "checkCount",
                                "candidateCount",
                                "assisted"
                            ).all(assistance::containsKey),
                            "Missing assistance fields"
                        )
                        // Local serialization uses null for absent metadata.
                        // Portable imports retain separate validation.
                        val assessment = session["assessment"]
                            ?.takeUnless { it == JsonNull && !transferLimits }
                            ?.let { raw ->
                                try {
                                    json.decodeFromJsonElement(PuzzleAssessment.serializer(), raw)
                                } catch (error: IllegalArgumentException) {
                                    PuzzleAssessment.Unavailable("invalid-input", listOf("Invalid assessment shape"))
                                }
                            }
                        val normalizedSession = if (assessment == null) {
                            session
                        } else {
                            JsonObject(
                                session + (
                                    "assessment" to json.encodeToJsonElement(
                                        PuzzleAssessment.serializer(),
                                        assessment
                                    )
                                    )
                            )
                        }
                        val puzzle = session["puzzle"] as? JsonObject ?: throw InvalidPortableData("Invalid puzzle")
                        val normalizedPuzzle = if (version == "1") {
                            val rules = puzzle["rules"] ?: buildJsonObject { put("kind", JsonPrimitive("classic")) }
                            requireData(
                                rules.jsonObject["kind"]?.jsonPrimitive?.content == "classic",
                                "Legacy records only support Classic"
                            )
                            JsonObject(puzzle + ("rules" to rules))
                        } else {
                            puzzle
                        }
                        validateRuleFields(normalizedPuzzle["rules"])
                        JsonObject(
                            record + ("formatVersion" to JsonPrimitive(2)) +
                                ("session" to JsonObject(normalizedSession + ("puzzle" to normalizedPuzzle)))
                        )
                    }
                )
            }
        )
    }

    private fun validateRuleFields(value: JsonElement?) {
        val rules = value as? JsonObject ?: throw InvalidPortableData("Missing rules")
        val expected = when (rules["kind"]?.jsonPrimitive?.content) {
            "classic", "diagonal" -> setOf("kind")
            "jigsaw" -> setOf("kind", "regions")
            "killer" -> setOf("kind", "cages")
            "thermo" -> setOf("kind", "paths")
            "arrow" -> setOf("kind", "arrows")
            else -> throw InvalidPortableData("Unknown variant")
        }
        requireData(rules.keys == expected, "Invalid rule fields")
    }

    private fun stripAbsent(value: JsonElement): JsonElement = when (value) {
        is JsonArray -> JsonArray(value.map(::stripAbsent))
        is JsonObject -> JsonObject(
            value.filter { (
                key,
                item
            ) ->
                !((key == "assessment" || key == "lessonStages") && item == JsonNull)
            }.mapValues { stripAbsent(it.value) }
        )
        else -> value
    }

    private fun checkResources(value: JsonElement) {
        var nodes = 0
        fun visit(item: JsonElement, depth: Int) {
            requireData(
                ++nodes <= BackupLimits.NODES && depth <= BackupLimits.DEPTH,
                "Backup exceeds traversal limits"
            )
            when (item) {
                is JsonArray -> item.forEach { visit(it, depth + 1) }
                is JsonObject -> item.values.forEach { visit(it, depth + 1) }
                else -> Unit
            }
        }
        visit(value, 0)
    }

    private fun preflightDepth(text: String) {
        var inString = false
        var escaped = false
        var depth = 0
        text.forEach { character ->
            if (inString) {
                if (escaped) {
                    escaped = false
                } else if (character == '\\') {
                    escaped = true
                } else if (character == '"') {
                    inString = false
                }
            } else {
                when (character) {
                    '"' -> inString = true
                    '{',
                    '[' -> {
                        depth++
                        requireData(
                            depth <= BackupLimits.DEPTH + 1,
                            "Backup exceeds nesting limit"
                        )
                    }
                    '}', ']' -> depth--
                }
            }
        }
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
        is EngineOutcome.BudgetExhausted ->
            throw SnapshotValidationUnavailable("Semantic validation exhausted its budget")
        EngineOutcome.Cancelled -> throw SnapshotValidationUnavailable("Semantic validation cancelled")
        EngineOutcome.TimedOut -> throw SnapshotValidationUnavailable("Semantic validation timed out")
        is EngineOutcome.Failed -> throw SnapshotValidationUnavailable(outcome.message)
    }
}

private fun requireData(condition: Boolean, message: String) {
    if (!condition) {
        throw InvalidPortableData(message)
    }
}
private fun identifier(value: String) = value.isNotBlank() && value.length <= 200
private fun safeInteger(value: Long) = value in 0..MAX_SAFE_INTEGER
private fun board(values: List<Int>) = values.size == BOARD_SIZE && values.all { it in 0..9 }

val courseIds: Set<String> = setOf(
    "rules",
    "naked-single",
    "hidden-single",
    "locked-candidate",
    "naked-pair",
    "hidden-pair",
    "naked-triple",
    "hidden-triple",
    "x-wing",
    "swordfish",
    "xy-wing",
    "simple-coloring"
) + listOf(
    "diagonal",
    "jigsaw",
    "killer",
    "thermo",
    "arrow"
).flatMap { variant ->
    when (variant) {
        "diagonal", "jigsaw" -> listOf("rules", "singles", "intersections", "combined")
        "killer" -> listOf("rules", "remainder", "combinations", "combined")
        "thermo" -> listOf("rules", "bounds", "interactions", "combined")
        else -> listOf("rules", "equations", "combinations", "combined")
    }.map { "$variant-$it" }
}
