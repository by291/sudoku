package dev.sudoku.app.model.learning

/** Portable progress identities and authored stage counts for the current bundled catalogue. */
object LessonIdentity {
    val ids: Set<String> = setOf(
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

    fun stageCount(id: String): Int? = if (id in ids) {
        if (id.endsWith("-combined")) 6 else 2
    } else {
        null
    }
}
