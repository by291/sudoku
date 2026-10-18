@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package dev.sudoku.app.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

const val BOARD_SIZE = 81
const val ALL_DIGITS_MASK = 511
const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

@Serializable
enum class Variant {
    @SerialName("classic")
    CLASSIC,

    @SerialName("diagonal")
    DIAGONAL,

    @SerialName("jigsaw")
    JIGSAW,

    @SerialName("killer")
    KILLER,

    @SerialName("thermo")
    THERMO,

    @SerialName("arrow")
    ARROW;

    val wireName: String get() = name.lowercase()
    val difficulties: List<Difficulty> get() = if (this == CLASSIC) Difficulty.entries else Difficulty.entries.take(3)
}

@Serializable
enum class Difficulty {
    @SerialName("easy")
    EASY,

    @SerialName("medium")
    MEDIUM,

    @SerialName("hard")
    HARD,

    @SerialName("expert")
    EXPERT
}

@Serializable
sealed interface PuzzleRules {
    @Serializable
    @SerialName("classic")
    data object Classic : PuzzleRules

    @Serializable
    @SerialName("diagonal")
    data object Diagonal : PuzzleRules

    @Serializable
    @SerialName("jigsaw")
    data class Jigsaw(val regions: List<List<Int>>) : PuzzleRules

    @Serializable
    @SerialName("killer")
    data class Killer(val cages: List<Cage>) : PuzzleRules

    @Serializable
    @SerialName("thermo")
    data class Thermo(val paths: List<List<Int>>) : PuzzleRules

    @Serializable
    @SerialName("arrow")
    data class Arrow(val arrows: List<ArrowClue>) : PuzzleRules
}

@Serializable data class Cage(val cells: List<Int>, val sum: Int)

@Serializable data class ArrowClue(val circle: Int, val shaft: List<Int>)

val PuzzleRules.variant: Variant get() = when (this) {
    PuzzleRules.Classic -> Variant.CLASSIC
    PuzzleRules.Diagonal -> Variant.DIAGONAL
    is PuzzleRules.Jigsaw -> Variant.JIGSAW
    is PuzzleRules.Killer -> Variant.KILLER
    is PuzzleRules.Thermo -> Variant.THERMO
    is PuzzleRules.Arrow -> Variant.ARROW
}

/** Portable text is retained verbatim. Only PuzzleContent crosses the mathematical boundary. */
@Serializable
data class Puzzle(
    val givens: List<Int>,
    val solution: List<Int>,
    val rules: PuzzleRules,
    val difficulty: Difficulty,
    val seed: String,
    val puzzleVersion: String
)

data class PuzzleContent(
    val givens: List<Int>,
    val solution: List<Int>,
    val rules: PuzzleRules,
    val difficulty: Difficulty
)

fun Puzzle.content() = PuzzleContent(givens.toList(), solution.toList(), rules, difficulty)

@Serializable
data class AssessmentWorkload(
    val steps: Long,
    val placements: Long,
    val eliminations: Long,
    val candidateRemovals: Long,
    val techniqueCounts: Map<String, Long>,
    val highestTier: Difficulty? = null,
    val highestTechnique: String? = null,
    val variantSteps: Long
)

@Serializable
data class AssessmentSummary(
    val ratingVersion: String,
    val variant: Variant,
    val difficulty: Difficulty,
    val workload: AssessmentWorkload
)

@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("status")
sealed interface PuzzleAssessment {
    @Serializable
    @SerialName("rated")
    data class Rated(val summary: AssessmentSummary) : PuzzleAssessment

    @Serializable
    @SerialName("unavailable")
    data class Unavailable(val reason: String, val issues: List<String>) : PuzzleAssessment
}
