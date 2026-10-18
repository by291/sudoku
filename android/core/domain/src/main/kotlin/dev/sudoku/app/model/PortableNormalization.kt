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

    fun normalizeBackup(tree: JsonElement, transferLimits: Boolean): JsonObject {
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
