package dev.sudoku.app.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Wire compatibility and shape normalization; no mathematical validation or storage ownership. */
internal class PortableNormalization(private val json: Json) {

    fun normalizeBackup(tree: JsonElement, hasTransferLimits: Boolean): JsonObject {
        val root = tree as? JsonObject ?: throw InvalidPortableData("Backup object required")
        validateSettingsShape(root)
        validateLessonFormats(root)

        return JsonObject(
            root.mapValues { (key, value) ->
                if (key == "sessions" || key == "results") {
                    normalizeRecords(value, transferLimits = hasTransferLimits)
                } else {
                    value
                }
            }
        )
    }

    private fun validateSettingsShape(root: JsonObject) {
        val settings = root["settings"] as? JsonObject
            ?: throw InvalidPortableData("Settings object required")
        val required = setOf(
            "theme",
            "showTimer",
            "highlightConflicts"
        )
        requireData(required.all(settings::containsKey), "Missing settings fields")

        val version = settings["formatVersion"]?.jsonPrimitive?.content
        requireData(version == null || version == "1", "Unsupported settings format")
    }

    private fun validateLessonFormats(root: JsonObject) {
        val lessons = root["lessons"] as? JsonArray ?: return
        for (raw in lessons) {
            val lesson = raw as? JsonObject ?: throw InvalidPortableData("Invalid lesson record")
            val version = lesson["formatVersion"]?.jsonPrimitive?.content
            requireData(version == null || version == "1", "Unsupported lesson format")
        }
    }

    private fun normalizeRecords(value: JsonElement, transferLimits: Boolean): JsonArray {
        val records =
            value as? JsonArray ?: throw InvalidPortableData("Backup collections required")

        return JsonArray(records.map { normalizeRecord(it, transferLimits = transferLimits) })
    }

    private fun normalizeRecord(value: JsonElement, transferLimits: Boolean): JsonObject {
        val record = value as? JsonObject ?: throw InvalidPortableData("Invalid record")
        val version = record["formatVersion"]?.jsonPrimitive?.content
        requireData(version == "1" || version == "2", "Unsupported record format")

        val session =
            record["session"] as? JsonObject ?: throw InvalidPortableData("Invalid session")
        validateSessionShape(session)
        val normalizedSession = normalizeAssessment(session, transferLimits = transferLimits)
        val puzzle = normalizePuzzle(session, isLegacy = version == "1")

        return JsonObject(
            record + ("formatVersion" to JsonPrimitive(2)) +
                ("session" to JsonObject(normalizedSession + ("puzzle" to puzzle)))
        )
    }

    private fun validateSessionShape(session: JsonObject) {
        val required = setOf(
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
        )
        requireData(required.all(session::containsKey), "Missing session fields")

        val assistance = session["assistance"] as? JsonObject
            ?: throw InvalidPortableData("Missing assistance")
        val counters = setOf(
            "hintCount",
            "checkCount",
            "candidateCount",
            "assisted"
        )
        requireData(counters.all(assistance::containsKey), "Missing assistance fields")
    }

    private fun normalizeAssessment(session: JsonObject, transferLimits: Boolean): JsonObject {
        // Local serialization uses null for absent metadata. Explicit portable null is invalid.
        val value = session["assessment"] ?: return session
        if (value == JsonNull && !transferLimits) {
            return session
        }

        val assessment = try {
            json.decodeFromJsonElement(PuzzleAssessment.serializer(), value)
        } catch (error: IllegalArgumentException) {
            PuzzleAssessment.Unavailable("invalid-input", listOf("Invalid assessment shape"))
        }
        val normalized = json.encodeToJsonElement(PuzzleAssessment.serializer(), assessment)

        return JsonObject(session + ("assessment" to normalized))
    }

    private fun normalizePuzzle(session: JsonObject, isLegacy: Boolean): JsonObject {
        val puzzle = session["puzzle"] as? JsonObject ?: throw InvalidPortableData("Invalid puzzle")
        if (!isLegacy) {
            validateRuleFields(puzzle["rules"])
            return puzzle
        }

        // Older records only represented Classic and could omit its rule object.
        val rules = puzzle["rules"] ?: buildJsonObject { put("kind", JsonPrimitive("classic")) }
        requireData(
            rules.jsonObject["kind"]?.jsonPrimitive?.content == "classic",
            "Legacy records only support Classic"
        )
        validateRuleFields(rules)

        return JsonObject(puzzle + ("rules" to rules))
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

    fun stripAbsent(value: JsonElement): JsonElement = when (value) {
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
}
