package dev.sudoku.app.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

object BackupLimits {
    const val BYTES = 25 * 1024 * 1024
    const val RECORDS = 10_000
    const val HISTORY_PER_SESSION = 2_000
    const val HISTORY_TOTAL = 10_000
    const val NODES = 2_000_000
    const val DEPTH = 32
}

internal fun checkResources(value: JsonElement) {
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

internal fun preflightDepth(text: String) {
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
