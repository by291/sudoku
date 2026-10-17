package dev.yigeyinian.sudoku.model.learning

import dev.yigeyinian.sudoku.model.ALL_DIGITS_MASK
import dev.yigeyinian.sudoku.model.BOARD_SIZE
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.LogicalStep
import dev.yigeyinian.sudoku.model.Placement
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.variant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
sealed interface ExerciseAnswer {
    @Serializable
    @SerialName("placement")
    data class Place(val expected: Placement) : ExerciseAnswer

    @Serializable
    @SerialName("elimination")
    data class Eliminate(val expected: List<Placement>) : ExerciseAnswer
}

@Serializable
enum class CandidateOrigin {
    @SerialName("base-candidates")
    BASE_CANDIDATES,

    @SerialName("authored-preconditions")
    AUTHORED_PRECONDITIONS
}

@Serializable
data class ExerciseStage(
    val board: List<Int>,
    val candidates: List<Int>,
    val rules: PuzzleRules,
    val step: LogicalStep,
    val answer: ExerciseAnswer,
    val explanation: String,
    val candidateOrigin: CandidateOrigin
)

@Serializable
data class LessonExercise(val title: String, val stages: List<ExerciseStage>)

@Serializable
enum class TeachingTransform {
    @SerialName("transpose")
    TRANSPOSE,

    @SerialName("rotate")
    ROTATE,

    @SerialName("swap-rows")
    SWAP_ROWS
}

@Serializable
enum class TransferSource {
    @SerialName("focused")
    FOCUSED,

    @SerialName("authored-alternate")
    AUTHORED_ALTERNATE
}

@Serializable
data class TransferDescriptor(val kind: TeachingTransform, val source: TransferSource)

@Serializable
data class Lesson(
    val id: String,
    val title: String,
    val introduction: String,
    val explanation: String,
    val practiceVariant: Variant,
    val practiceDifficulty: Difficulty,
    val guided: ExerciseStage,
    val exercises: List<LessonExercise>,
    val transfer: TransferDescriptor
) {
    val stages: List<ExerciseStage> get() = exercises.flatMap { it.stages }
}

@Serializable
data class LessonCursor(val lessonId: String, val stageIndex: Int)

data class ExerciseSubmission(
    val cursor: LessonCursor,
    val correct: Boolean,
    val advance: Boolean,
    val completed: Boolean,
    val explanation: String
)

@Serializable
private data class CatalogueProvenance(
    val source: String,
    val snapshot: String,
    val sha256: String,
    val candidatePolicy: String
)

@Serializable
private data class CatalogueDocument(
    val schemaVersion: Int,
    val provenance: CatalogueProvenance,
    val lessons: List<Lesson>
)

/** Owns authored presentation and structural decoding; bundled mathematical evidence is checked at build time. */
class LessonCatalogue private constructor(val lessons: List<Lesson>) {
    private val byId = lessons.associateBy { it.id }

    fun lesson(id: String): Lesson? = byId[id]

    fun restoreCursor(lessonId: String, stageIndex: Int = 0): LessonCursor? {
        val lesson = lesson(lessonId) ?: return null
        return LessonCursor(lessonId, stageIndex.takeIf { it in lesson.stages.indices } ?: 0)
    }

    /** Returns a proposed transition; the owner persists it with the dataset epoch before publishing progress. */
    fun submit(
        cursor: LessonCursor,
        answer: ExerciseAnswer,
        submittedStageIndex: Int = cursor.stageIndex
    ): ExerciseSubmission {
        val lesson = lesson(cursor.lessonId)
        val stage = lesson?.stages?.getOrNull(cursor.stageIndex)
        if (stage == null || submittedStageIndex != cursor.stageIndex) {
            return ExerciseSubmission(cursor, false, false, false, "请按顺序完成当前阶段，不能跳过推理。")
        }
        if (!sameAnswer(stage.answer, answer)) {
            return ExerciseSubmission(cursor, false, false, false, "还差一点。请重新检查单元内候选数的位置，可以继续尝试。")
        }

        val completed = cursor.stageIndex == lesson.stages.lastIndex
        val next = LessonCursor(cursor.lessonId, if (completed) 0 else cursor.stageIndex + 1)
        return ExerciseSubmission(next, true, !completed, completed, "推理正确！" + stage.explanation)
    }

    companion object {
        private val json = Json { classDiscriminator = "kind" }
        private val stableIds = listOf(
            "rules", "naked-single", "hidden-single", "locked-candidate", "naked-pair", "hidden-pair",
            "naked-triple", "hidden-triple", "x-wing", "swordfish", "xy-wing", "simple-coloring",
            "diagonal-rules", "diagonal-singles", "diagonal-intersections", "diagonal-combined",
            "jigsaw-rules", "jigsaw-singles", "jigsaw-intersections", "jigsaw-combined",
            "killer-rules", "killer-remainder", "killer-combinations", "killer-combined",
            "thermo-rules", "thermo-bounds", "thermo-interactions", "thermo-combined",
            "arrow-rules", "arrow-equations", "arrow-combinations", "arrow-combined"
        )

        fun decode(source: String): LessonCatalogue {
            val document = json.decodeFromString<CatalogueDocument>(source)
            require(document.schemaVersion == 1) { "Unsupported lesson catalogue schema" }
            require(
                document.provenance.source.isNotBlank() && document.provenance.snapshot.isNotBlank() &&
                    document.provenance.sha256.matches(Regex("[0-9a-f]{64}"))
            ) {
                "Missing authored catalogue provenance"
            }
            require(document.lessons.map { it.id } == stableIds) { "Course identities or order changed" }

            for (lesson in document.lessons) {
                require(
                    lesson.title.isNotBlank() && hasChineseCopy(lesson.introduction) &&
                        hasChineseCopy(lesson.explanation)
                ) { "Missing course copy in ${lesson.id}" }
                require(lesson.practiceDifficulty in lesson.practiceVariant.difficulties) {
                    "Unsupported practice difficulty in ${lesson.id}"
                }
                require(
                    lesson.exercises.size == 2 &&
                        lesson.exercises.all {
                            hasChineseCopy(it.title) && it.stages.isNotEmpty()
                        }
                ) { "Missing focused or transfer exercise in ${lesson.id}" }
                require(lesson.stages.size == if (lesson.id.endsWith("-combined")) 6 else 2) {
                    "Changed stage count in ${lesson.id}"
                }
                require(lesson.guided == lesson.stages.first()) {
                    "Guided stage must match the first exercise in ${lesson.id}"
                }
                require(
                    lesson.transfer.kind != TeachingTransform.SWAP_ROWS || lesson.practiceVariant == Variant.CLASSIC
                ) {
                    "Row permutations cannot change variant clues"
                }
                require((lesson.transfer.source == TransferSource.AUTHORED_ALTERNATE) == (lesson.id == "arrow-rules")) {
                    "Unexpected authored transfer source"
                }

                for (stage in lesson.stages) {
                    require(stage.rules.variant == lesson.practiceVariant) { "Mismatched course rules in ${lesson.id}" }
                    require(
                        stage.board.size == BOARD_SIZE && stage.board.all {
                            it in 0..9
                        }
                    ) { "Invalid teaching board in ${lesson.id}" }
                    require(
                        stage.candidates.size == BOARD_SIZE && stage.candidates.all {
                            it in 0..ALL_DIGITS_MASK
                        }
                    ) { "Invalid candidate preconditions in ${lesson.id}" }
                    require(
                        stage.board.indices.all {
                            stage.board[it] == 0 || stage.candidates[it] == 0
                        }
                    ) { "Filled cells cannot have candidate preconditions" }
                    require(hasChineseCopy(stage.explanation)) { "Missing Chinese stage explanation" }
                    require(sameAnswer(stage.answer, expectedAnswer(stage.step))) {
                        "Stage answer disagrees with authored conclusion"
                    }
                    require(
                        answerPairs(stage.answer).isNotEmpty() &&
                            answerPairs(stage.answer).all {
                                it.cell in 0 until BOARD_SIZE && it.digit in 1..9
                            }
                    ) { "Invalid stage answer" }
                }
            }
            return LessonCatalogue(document.lessons)
        }
    }
}

private fun hasChineseCopy(value: String): Boolean = value.any { it in '\u4e00'..'\u9fff' }

private fun expectedAnswer(step: LogicalStep): ExerciseAnswer = when (step) {
    is LogicalStep.Place -> ExerciseAnswer.Place(step.placement)
    is LogicalStep.Eliminate -> ExerciseAnswer.Eliminate(step.removals)
}

private fun answerPairs(answer: ExerciseAnswer): List<Placement> = when (answer) {
    is ExerciseAnswer.Place -> listOf(answer.expected)
    is ExerciseAnswer.Eliminate -> answer.expected
}

private fun sameAnswer(expected: ExerciseAnswer, supplied: ExerciseAnswer): Boolean = when {
    expected is ExerciseAnswer.Place && supplied is ExerciseAnswer.Place -> expected.expected == supplied.expected
    expected is ExerciseAnswer.Eliminate && supplied is ExerciseAnswer.Eliminate -> expected.expected.toSet() ==
        supplied.expected.toSet()
    else -> false
}
