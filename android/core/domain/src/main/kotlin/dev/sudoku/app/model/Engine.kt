package dev.sudoku.app.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Incomplete computation cannot be mistaken for a valid empty result. */
sealed interface EngineOutcome<out T> {
    data class Completed<T>(val value: T, val workUsed: Long = 0) : EngineOutcome<T>

    data class BudgetExhausted(val workUsed: Long = 0) : EngineOutcome<Nothing>

    data object Cancelled : EngineOutcome<Nothing>

    data object TimedOut : EngineOutcome<Nothing>

    /** Conclusive input rejection; unlike execution failure it may establish invalid persisted data. */
    data class InvalidInput(val message: String) : EngineOutcome<Nothing>

    data class Failed(val message: String) : EngineOutcome<Nothing>
}

sealed interface Validation {
    data object Valid : Validation

    data class Invalid(val issues: List<String>) : Validation
}

data class EngineInformation(
    val bridgeVersion: String,
    val puzzleVersion: String,
    val variantPuzzleVersion: String,
    val ratingVersion: String
)

data class GenerationRequest(val variant: Variant, val difficulty: Difficulty, val seed: List<UByte>)

data class GeneratedPuzzle(val puzzle: Puzzle, val assessment: PuzzleAssessment?)

data class RuleUnit(val kind: String, val index: Int, val cells: List<Int>)

/** Each constraint carries only facts meaningful for that rule. */
sealed interface RuleConstraint {
    val id: String
    val index: Int
    val cells: List<Int>

    data class Cage(override val id: String, override val index: Int, override val cells: List<Int>, val sum: Int) :
        RuleConstraint

    data class Thermo(override val id: String, override val index: Int, override val cells: List<Int>) : RuleConstraint

    data class Arrow(override val id: String, override val index: Int, val circle: Int, val shaft: List<Int>) :
        RuleConstraint {
        override val cells: List<Int> get() = listOf(circle) + shaft
    }
}

data class RuleMetadata(
    val rules: PuzzleRules,
    val units: List<RuleUnit>,
    val constraints: List<RuleConstraint>,
    val cellUnits: List<List<Int>>,
    val cellConstraints: List<List<Int>>,
    val duplicatePeers: List<List<Int>>,
    val relatedCells: List<List<Int>>
)

sealed interface ViolationCode {
    data object Duplicate : ViolationCode

    data class CageTotal(val index: Long, val sum: Int) : ViolationCode

    data class ThermoOrder(val index: Long) : ViolationCode

    data class ArrowTotal(val index: Long) : ViolationCode
}

data class RuleViolation(val constraintId: String, val cells: List<Int>, val code: ViolationCode)

@Serializable
data class DomainFact(val cell: Int, val mask: Int)

@Serializable
data class BoundFact(val cell: Int, val min: Int, val max: Int)

@Serializable
data class UnitReference(val kind: String, val index: Int)

@Serializable
data class ColoringLink(val unit: UnitReference, val cells: List<Int>)

/** Owned structured facts; presentation formats their Chinese explanation. */
@Serializable
sealed interface Evidence {
    val cells: List<Int>
    val digits: List<Int>

    @Serializable
    @SerialName("cage")
    data class Cage(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val constraintId: String,
        val sum: Int,
        val domains: List<DomainFact>
    ) : Evidence

    @Serializable
    @SerialName("thermo")
    data class Thermo(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val constraintId: String,
        val path: List<Int>,
        val bounds: List<BoundFact>
    ) : Evidence

    @Serializable
    @SerialName("arrow")
    data class Arrow(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val constraintId: String,
        val circle: Int,
        val shaft: List<Int>,
        val domains: List<DomainFact>
    ) : Evidence

    @Serializable
    @SerialName("unit")
    data class Unit(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val unit: UnitReference,
        val premises: List<Evidence>,
        val units: List<UnitReference> = emptyList()
    ) : Evidence

    @Serializable
    @SerialName("subset")
    data class Subset(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val domains: List<DomainFact>,
        val unit: UnitReference,
        val hidden: Boolean
    ) : Evidence

    @Serializable
    @SerialName("fish")
    data class Fish(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val domains: List<DomainFact>,
        val bases: List<UnitReference>,
        val covers: List<UnitReference>
    ) : Evidence

    @Serializable
    @SerialName("wing")
    data class Wing(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val domains: List<DomainFact>,
        val pivot: Int,
        val wings: List<Int>
    ) : Evidence

    @Serializable
    @SerialName("coloring")
    data class Coloring(
        override val cells: List<Int>,
        override val digits: List<Int>,
        val domains: List<DomainFact>,
        val mode: String,
        val colors: List<List<Int>>,
        val links: List<ColoringLink>
    ) : Evidence
}

@Serializable
data class Placement(val cell: Int, val digit: Int)

@Serializable
sealed interface LogicalStep {
    val technique: String
    val evidence: Evidence

    @Serializable
    @SerialName("placement")
    data class Place(override val technique: String, override val evidence: Evidence, val cell: Int, val digit: Int) :
        LogicalStep {
        constructor(
            technique: String,
            evidence: Evidence,
            placement: Placement
        ) : this(technique, evidence, placement.cell, placement.digit)

        val placement: Placement get() = Placement(cell, digit)
    }

    @Serializable
    @SerialName("elimination")
    data class Eliminate(
        override val technique: String,
        override val evidence: Evidence,
        val removals: List<Placement>
    ) : LogicalStep
}

sealed interface HintResult {
    data class ReviewEntry(val cell: Int) : HintResult

    data class Deduction(val steps: List<LogicalStep>, val placement: Placement) : HintResult

    data class Unavailable(val reason: String) : HintResult
}

/** Newly computed diagnostics retain facts until a feature chooses player-facing rendering. */
sealed interface AssessmentIssue {
    data class Message(val message: String) : AssessmentIssue

    data class Violation(val violation: RuleViolation) : AssessmentIssue
}

sealed interface AssessmentResult {
    data class Rated(val summary: AssessmentSummary, val trace: List<LogicalStep>) : AssessmentResult

    data class Ungraded(val variant: Variant) : AssessmentResult

    data class Invalid(val issues: List<AssessmentIssue>) : AssessmentResult
}

/** Main-safe calls own input snapshots. Close waits for executing native calls to release ownership. */
interface PreparedPuzzle {
    val metadata: RuleMetadata

    suspend fun edit(givens: List<Int>, layers: BoardLayers, action: BoardEdit): EngineOutcome<EditResult>

    suspend fun candidates(board: List<Int>): EngineOutcome<List<Int>>

    suspend fun conflicts(board: List<Int>): EngineOutcome<List<RuleViolation>>

    suspend fun isComplete(board: List<Int>): EngineOutcome<Boolean>

    suspend fun reviewEntries(board: List<Int>, solution: List<Int>): EngineOutcome<List<Int>>

    suspend fun hint(board: List<Int>, solution: List<Int>): EngineOutcome<HintResult>

    suspend fun close()
}

/** Storage validates copies before opening transactions and sends no historical text into Rust. */
interface MathematicalValidator {

    suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation>

    suspend fun validateAssessment(
        value: PuzzleAssessment?,
        variant: Variant,
        difficulty: Difficulty
    ): EngineOutcome<PuzzleAssessment?>
}

interface SudokuEngine : MathematicalValidator {

    suspend fun information(): EngineOutcome<EngineInformation>

    suspend fun deriveSeed(material: List<UByte>): EngineOutcome<List<UByte>>

    suspend fun generate(request: GenerationRequest): EngineOutcome<GeneratedPuzzle>

    suspend fun prepare(rules: PuzzleRules): EngineOutcome<PreparedPuzzle>

    suspend fun assess(board: List<Int>, rules: PuzzleRules): EngineOutcome<AssessmentResult>

    suspend fun validateHint(hint: HintResult, board: List<Int>, rules: PuzzleRules): EngineOutcome<Validation>

    suspend fun transformRules(rules: PuzzleRules, symmetry: Int, complement: Boolean): EngineOutcome<PuzzleRules>

    suspend fun validateTeachingStep(
        board: List<Int>,
        candidates: List<Int>,
        rules: PuzzleRules,
        step: LogicalStep
    ): EngineOutcome<Validation>
}
