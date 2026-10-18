package dev.sudoku.app.model

import dev.sudoku.app.model.learning.LessonIdentity
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/** Conclusive structural or mathematical rejection; storage may quarantine with source fencing. */
class InvalidPortableData(message: String) : IllegalArgumentException(message)

/** Inconclusive validation; callers must preserve canonical data for retry. */
class SnapshotValidationUnavailable(message: String) : IllegalStateException(message)

private val canonicalInstant = DateTimeFormatterBuilder().appendInstant(3).toFormatter()

fun isIsoInstant(value: String): Boolean = runCatching {
    val instant = Instant.parse(value)
    instant.toEpochMilli() in -8_640_000_000_000_000L..8_640_000_000_000_000L &&
        canonicalInstant.format(instant) == value
}.getOrDefault(false)

fun isoInstant(value: Instant): String = canonicalInstant.format(value)

/** Parses portable facts separately from the injected mathematical authority; never owns storage. */
class PortableCodec(validator: MathematicalValidator) {
    val json = Json {
        classDiscriminator = "kind"
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    private val normalization = PortableNormalization(json)
    private val sessions = PortableSessionValidator(json, validator)

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
            normalization.normalizeBackup(tree, transferLimits)
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

    /** Encodes local facts without transfer normalization or quotas; callers validate before writing. */
    fun <T> encodeRecord(serializer: SerializationStrategy<T>, value: T): String =
        escapeSurrogates(json.encodeToString(serializer, value))

    fun encodeBackup(backup: LocalBackup): String {
        val tree = json.encodeToJsonElement(LocalBackup.serializer(), backup)
        val text = normalization.stripAbsent(tree).toString()
        val escaped = escapeSurrogates(text)

        requireData(
            escaped.toByteArray(Charsets.UTF_8).size <= BackupLimits.BYTES,
            "Backup exceeds byte limit"
        )

        return escaped
    }

    // Escape UTF-16 units before UTF-8 transport: replacing malformed surrogates loses legacy metadata.
    private fun escapeSurrogates(text: String): String = buildString(text.length) {
        text.forEach { character ->
            if (character.isSurrogate()) {
                append("\\u")
                append(character.code.toString(16).padStart(4, '0'))
            } else {
                append(character)
            }
        }
    }

    suspend fun validateSession(input: GameSession): GameSession = sessions.validate(input)

    fun validateSettings(settings: Settings) {
        requireData(
            settings.currentLessonId == null || settings.currentLessonId in LessonIdentity.ids,
            "Invalid current lesson"
        )

        val stages = settings.lessonStages ?: return
        requireData(
            stages.size <= 32 && stages.all { (
                id,
                stage
            ) ->
                LessonIdentity.stageCount(id)?.let { stage in 0 until it } == true
            },
            "Invalid lesson cursor"
        )
    }

    fun validateLesson(progress: LessonProgress) {
        // Historical completion IDs deliberately remain valid after a catalogue revision.
        requireData(identifier(progress.lessonId) && isIsoInstant(progress.completedAt), "Invalid lesson progress")
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
}

internal fun requireData(condition: Boolean, message: String) {
    if (!condition) {
        throw InvalidPortableData(message)
    }
}

internal fun identifier(value: String) = value.isNotBlank() && value.length <= 200

internal fun safeInteger(value: Long) = value in 0..MAX_SAFE_INTEGER

internal fun board(values: List<Int>) = values.size == BOARD_SIZE && values.all { it in 0..9 }
