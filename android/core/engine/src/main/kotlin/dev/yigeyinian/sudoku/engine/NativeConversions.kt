package dev.yigeyinian.sudoku.engine

import dev.yigeyinian.sudoku.ffi.AdvancedEvidenceDto
import dev.yigeyinian.sudoku.ffi.ArrowDto
import dev.yigeyinian.sudoku.ffi.AssessmentSummaryDto
import dev.yigeyinian.sudoku.ffi.BoundDto
import dev.yigeyinian.sudoku.ffi.CageDto
import dev.yigeyinian.sudoku.ffi.ColoringLinkDto
import dev.yigeyinian.sudoku.ffi.ColoringModeDto
import dev.yigeyinian.sudoku.ffi.ConstraintDto
import dev.yigeyinian.sudoku.ffi.DifficultyDto
import dev.yigeyinian.sudoku.ffi.DomainDto
import dev.yigeyinian.sudoku.ffi.EvidenceDto
import dev.yigeyinian.sudoku.ffi.HintResultDto
import dev.yigeyinian.sudoku.ffi.HintUnavailableDto
import dev.yigeyinian.sudoku.ffi.LogicalStepDto
import dev.yigeyinian.sudoku.ffi.MetadataDto
import dev.yigeyinian.sudoku.ffi.PlacementDto
import dev.yigeyinian.sudoku.ffi.PuzzleAssessmentDto
import dev.yigeyinian.sudoku.ffi.RatingVersionDto
import dev.yigeyinian.sudoku.ffi.RemovalDto
import dev.yigeyinian.sudoku.ffi.RuleEvidenceDto
import dev.yigeyinian.sudoku.ffi.RulesDto
import dev.yigeyinian.sudoku.ffi.StoredAssessmentDto
import dev.yigeyinian.sudoku.ffi.TechniqueDto
import dev.yigeyinian.sudoku.ffi.UnavailableReasonDto
import dev.yigeyinian.sudoku.ffi.UnitDto
import dev.yigeyinian.sudoku.ffi.UnitEvidenceDto
import dev.yigeyinian.sudoku.ffi.UnitEvidenceKindDto
import dev.yigeyinian.sudoku.ffi.UnitKindDto
import dev.yigeyinian.sudoku.ffi.VariantDto
import dev.yigeyinian.sudoku.ffi.ViolationCodeDto
import dev.yigeyinian.sudoku.ffi.ViolationDto
import dev.yigeyinian.sudoku.ffi.WorkloadDto
import dev.yigeyinian.sudoku.model.ArrowClue
import dev.yigeyinian.sudoku.model.AssessmentSummary
import dev.yigeyinian.sudoku.model.AssessmentWorkload
import dev.yigeyinian.sudoku.model.BoundFact
import dev.yigeyinian.sudoku.model.Cage
import dev.yigeyinian.sudoku.model.ColoringLink
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.DomainFact
import dev.yigeyinian.sudoku.model.Evidence
import dev.yigeyinian.sudoku.model.HintResult
import dev.yigeyinian.sudoku.model.LogicalStep
import dev.yigeyinian.sudoku.model.Placement
import dev.yigeyinian.sudoku.model.PuzzleAssessment
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.RuleConstraint
import dev.yigeyinian.sudoku.model.RuleMetadata
import dev.yigeyinian.sudoku.model.RuleUnit
import dev.yigeyinian.sudoku.model.RuleViolation
import dev.yigeyinian.sudoku.model.UnitReference
import dev.yigeyinian.sudoku.model.Variant

// Conversions own collections on both sides; generated handles never enter player state.
internal fun List<Int>.nativeBoard(): ByteArray {
    require(size == 81) { "A board requires exactly 81 cells" }
    require(all { it in 0..9 }) { "Invalid board digit" }
    return ByteArray(size) { this[it].toByte() }
}

internal fun ByteArray.playerBoard(): List<Int> = map { it.toInt() and 255 }
internal fun Int.nativeCell(): UInt {
    require(this in 0..80) { "Invalid cell index" }
    return toUInt()
}
internal fun Int.nativeDigit(): UByte {
    require(this in 1..9) { "Invalid digit" }
    return toUByte()
}
internal fun Int.nativeMask(): UShort {
    require(this in 0..511) { "Invalid candidate mask" }
    return toUShort()
}
private fun List<Int>.nativeCells(): List<UInt> = map { it.nativeCell() }
private fun List<UInt>.playerCells(): List<Int> = map { it.toInt() }

internal fun Variant.native(): VariantDto = when (this) {
    Variant.CLASSIC -> VariantDto.CLASSIC
    Variant.DIAGONAL -> VariantDto.DIAGONAL
    Variant.JIGSAW -> VariantDto.JIGSAW
    Variant.KILLER -> VariantDto.KILLER
    Variant.THERMO -> VariantDto.THERMO
    Variant.ARROW -> VariantDto.ARROW
}

internal fun VariantDto.player(): Variant = when (this) {
    VariantDto.CLASSIC -> Variant.CLASSIC
    VariantDto.DIAGONAL -> Variant.DIAGONAL
    VariantDto.JIGSAW -> Variant.JIGSAW
    VariantDto.KILLER -> Variant.KILLER
    VariantDto.THERMO -> Variant.THERMO
    VariantDto.ARROW -> Variant.ARROW
}

internal fun Difficulty.native(): DifficultyDto = when (this) {
    Difficulty.EASY -> DifficultyDto.EASY
    Difficulty.MEDIUM -> DifficultyDto.MEDIUM
    Difficulty.HARD -> DifficultyDto.HARD
    Difficulty.EXPERT -> DifficultyDto.EXPERT
}

internal fun DifficultyDto.player(): Difficulty = when (this) {
    DifficultyDto.EASY -> Difficulty.EASY
    DifficultyDto.MEDIUM -> Difficulty.MEDIUM
    DifficultyDto.HARD -> Difficulty.HARD
    DifficultyDto.EXPERT -> Difficulty.EXPERT
}

internal fun PuzzleRules.native(): RulesDto = when (this) {
    PuzzleRules.Classic -> RulesDto.Classic
    PuzzleRules.Diagonal -> RulesDto.Diagonal
    is PuzzleRules.Jigsaw -> RulesDto.Jigsaw(regions.map { it.nativeCells() })
    is PuzzleRules.Killer -> RulesDto.Killer(
        cages.map {
            require(it.sum in 1..45)
            CageDto(it.cells.nativeCells(), it.sum.toUShort())
        }
    )
    is PuzzleRules.Thermo -> RulesDto.Thermo(paths.map { it.nativeCells() })
    is PuzzleRules.Arrow -> RulesDto.Arrow(arrows.map { ArrowDto(it.circle.nativeCell(), it.shaft.nativeCells()) })
}

internal fun RulesDto.player(): PuzzleRules = when (this) {
    RulesDto.Classic -> PuzzleRules.Classic
    RulesDto.Diagonal -> PuzzleRules.Diagonal
    is RulesDto.Jigsaw -> PuzzleRules.Jigsaw(regions.map { it.playerCells() })
    is RulesDto.Killer -> PuzzleRules.Killer(cages.map { Cage(it.cells.playerCells(), it.sum.toInt()) })
    is RulesDto.Thermo -> PuzzleRules.Thermo(paths.map { it.playerCells() })
    is RulesDto.Arrow -> PuzzleRules.Arrow(arrows.map { ArrowClue(it.circle.toInt(), it.shaft.playerCells()) })
}

internal fun MetadataDto.player(): RuleMetadata = RuleMetadata(
    rules.player(),
    units.map { RuleUnit(it.kind.name.lowercase(), it.index.toInt(), it.cells.playerCells()) },
    constraints.map {
        when (it) {
            is ConstraintDto.Cage -> RuleConstraint(
                it.id,
                it.index.toInt(),
                it.cells.playerCells(),
                "cage",
                sum = it.sum.toInt()
            )
            is ConstraintDto.Thermo -> RuleConstraint(it.id, it.index.toInt(), it.cells.playerCells(), "thermo")
            is ConstraintDto.Arrow -> RuleConstraint(
                it.id,
                it.index.toInt(),
                listOf(it.circle.toInt()) + it.shaft.playerCells(),
                "arrow",
                circle = it.circle.toInt(),
                shaft = it.shaft.playerCells()
            )
        }
    },
    cellUnits.map {
        it.playerCells()
    },
    cellConstraints.map {
        it.playerCells()
    },
    duplicatePeers.map { it.playerCells() },
    relatedCells.map { it.playerCells() }
)

internal fun ViolationDto.player(): RuleViolation = when (val value = code) {
    ViolationCodeDto.Duplicate -> RuleViolation(constraintId, cells.playerCells(), "duplicate")
    is ViolationCodeDto.CageTotal -> RuleViolation(
        constraintId,
        cells.playerCells(),
        "cage-total",
        value.index.toInt(),
        value.sum.toInt()
    )
    is ViolationCodeDto.ThermoOrder -> RuleViolation(
        constraintId,
        cells.playerCells(),
        "thermo-order",
        value.index.toInt()
    )
    is ViolationCodeDto.ArrowTotal -> RuleViolation(
        constraintId,
        cells.playerCells(),
        "arrow-total",
        value.index.toInt()
    )
}

internal fun TechniqueDto.wire(): String = when (this) {
    TechniqueDto.X_WING -> "x-wing"
    TechniqueDto.XY_WING -> "xy-wing"
    else -> name.lowercase().replace('_', '-')
}

private fun String.nativeTechnique(): TechniqueDto =
    TechniqueDto.entries.firstOrNull { it.wire() == this } ?: error("Unknown technique: $this")
private fun UnitDto.player(): UnitReference = UnitReference(kind.name.lowercase(), index.toInt())
private fun UnitReference.native(): UnitDto {
    val kind = UnitKindDto.entries.firstOrNull { it.name.lowercase() == this.kind } ?: error("Unknown unit kind")
    require(index in 0..8 && (kind != UnitKindDto.DIAGONAL || index < 2))
    return UnitDto(kind, index.toUInt())
}
private fun DomainDto.player(): DomainFact = DomainFact(cell.toInt(), mask.toInt())
private fun DomainFact.native(): DomainDto = DomainDto(cell.nativeCell(), mask.nativeMask())
private fun RuleEvidenceDto.player(): Evidence = when (this) {
    is RuleEvidenceDto.Cage -> Evidence.Cage(
        cells.playerCells(),
        digits.map {
            it.toInt()
        },
        constraintId,
        sum.toInt(),
        domains.map { it.player() }
    )
    is RuleEvidenceDto.Thermo -> Evidence.Thermo(
        cells.playerCells(),
        digits.map {
            it.toInt()
        },
        constraintId,
        path.playerCells(),
        bounds.map { BoundFact(it.cell.toInt(), it.min.toInt(), it.max.toInt()) }
    )
    is RuleEvidenceDto.Arrow -> Evidence.Arrow(
        cells.playerCells(),
        digits.map {
            it.toInt()
        },
        constraintId,
        circle.toInt(),
        shaft.playerCells(),
        domains.map { it.player() }
    )
}

internal fun EvidenceDto.player(): Evidence = when (this) {
    is EvidenceDto.Rule -> value.player()
    is EvidenceDto.Unit -> Evidence.Unit(
        value.cells.playerCells(),
        value.digits.map {
            it.toInt()
        },
        value.unit.player(),
        value.premises.map { it.player() },
        value.units.map { it.player() }
    )
    is EvidenceDto.Advanced -> when (val source = value) {
        is AdvancedEvidenceDto.Subset -> Evidence.Subset(
            source.cells.playerCells(),
            source.digits.map {
                it.toInt()
            },
            source.domains.map { it.player() },
            source.unit.player(),
            source.hidden
        )
        is AdvancedEvidenceDto.Fish -> Evidence.Fish(
            source.cells.playerCells(),
            source.digits.map {
                it.toInt()
            },
            source.domains.map { it.player() },
            source.bases.map { it.player() },
            source.covers.map { it.player() }
        )
        is AdvancedEvidenceDto.Wing -> Evidence.Wing(
            source.cells.playerCells(),
            source.digits.map {
                it.toInt()
            },
            source.domains.map { it.player() },
            source.pivot.toInt(),
            source.wings.playerCells()
        )
        is AdvancedEvidenceDto.Coloring -> Evidence.Coloring(
            source.cells.playerCells(),
            source.digits.map {
                it.toInt()
            },
            source.domains.map {
                it.player()
            },
            source.mode.name.lowercase(),
            source.colors.map {
                it.playerCells()
            },
            source.links.map { ColoringLink(it.unit.player(), it.cells.playerCells()) }
        )
    }
}

private fun Evidence.nativeRule(): RuleEvidenceDto = when (this) {
    is Evidence.Cage -> {
        require(sum in 1..45)
        RuleEvidenceDto.Cage(
            constraintId,
            cells.nativeCells(),
            digits.map {
                it.nativeDigit()
            },
            sum.toUShort(),
            domains.map { it.native() }
        )
    }
    is Evidence.Thermo -> RuleEvidenceDto.Thermo(
        constraintId,
        cells.nativeCells(),
        digits.map {
            it.nativeDigit()
        },
        path.nativeCells(),
        bounds.map { BoundDto(it.cell.nativeCell(), it.min.nativeDigit(), it.max.nativeDigit()) }
    )
    is Evidence.Arrow -> RuleEvidenceDto.Arrow(
        constraintId,
        cells.nativeCells(),
        digits.map {
            it.nativeDigit()
        },
        circle.nativeCell(),
        shaft.nativeCells(),
        domains.map { it.native() }
    )
    else -> error("Only rule evidence may be a premise")
}

internal fun Evidence.native(): EvidenceDto {
    val cells = cells.nativeCells()
    val digits = digits.map { it.nativeDigit() }
    return when (this) {
        is Evidence.Cage, is Evidence.Thermo, is Evidence.Arrow -> EvidenceDto.Rule(nativeRule())
        is Evidence.Unit -> EvidenceDto.Unit(
            UnitEvidenceDto(
                UnitEvidenceKindDto.UNIT,
                unit.native(),
                cells,
                digits,
                premises.map {
                    it.nativeRule()
                },
                units.map { it.native() }
            )
        )
        is Evidence.Subset -> EvidenceDto.Advanced(
            AdvancedEvidenceDto.Subset(
                cells,
                digits,
                domains.map {
                    it.native()
                },
                unit.native(),
                hidden
            )
        )
        is Evidence.Fish -> EvidenceDto.Advanced(
            AdvancedEvidenceDto.Fish(
                cells,
                digits,
                domains.map {
                    it.native()
                },
                bases.map { it.native() },
                covers.map { it.native() }
            )
        )
        is Evidence.Wing -> EvidenceDto.Advanced(
            AdvancedEvidenceDto.Wing(
                cells,
                digits,
                domains.map {
                    it.native()
                },
                pivot.nativeCell(),
                wings.nativeCells()
            )
        )
        is Evidence.Coloring -> {
            val coloringMode =
                ColoringModeDto.entries.firstOrNull { it.name.lowercase() == mode } ?: error("Unknown coloring mode")
            EvidenceDto.Advanced(
                AdvancedEvidenceDto.Coloring(
                    cells,
                    digits,
                    domains.map {
                        it.native()
                    },
                    coloringMode,
                    colors.map {
                        it.nativeCells()
                    },
                    links.map { ColoringLinkDto(it.unit.native(), it.cells.nativeCells()) }
                )
            )
        }
    }
}

internal fun LogicalStepDto.player(): LogicalStep = when (this) {
    is LogicalStepDto.Placement -> LogicalStep.Place(
        technique.wire(),
        evidence.player(),
        Placement(cell.toInt(), digit.toInt())
    )
    is LogicalStepDto.Elimination -> LogicalStep.Eliminate(
        technique.wire(),
        evidence.player(),
        removals.map {
            Placement(it.cell.toInt(), it.digit.toInt())
        }
    )
}

internal fun LogicalStep.native(): LogicalStepDto = when (this) {
    is LogicalStep.Place -> LogicalStepDto.Placement(
        technique.nativeTechnique(),
        evidence.native(),
        placement.cell.nativeCell(),
        placement.digit.nativeDigit()
    )
    is LogicalStep.Eliminate -> LogicalStepDto.Elimination(
        technique.nativeTechnique(),
        evidence.native(),
        removals.map {
            RemovalDto(it.cell.nativeCell(), it.digit.nativeDigit())
        }
    )
}

internal fun HintResultDto.player(): HintResult = when (this) {
    is HintResultDto.ReviewEntry -> HintResult.ReviewEntry(cell.toInt())
    is HintResultDto.Deduction -> HintResult.Deduction(
        steps.map {
            it.player()
        },
        Placement(placement.cell.toInt(), placement.digit.toInt())
    )
    is HintResultDto.Unavailable -> HintResult.Unavailable(reason.name.lowercase().replace('_', '-'))
}

internal fun HintResult.native(): HintResultDto = when (this) {
    is HintResult.ReviewEntry -> HintResultDto.ReviewEntry(cell.nativeCell())
    is HintResult.Deduction -> HintResultDto.Deduction(
        steps.map {
            it.native()
        },
        PlacementDto(placement.cell.nativeCell(), placement.digit.nativeDigit())
    )
    is HintResult.Unavailable -> HintResultDto.Unavailable(
        HintUnavailableDto.entries.firstOrNull {
            it.name.lowercase().replace('_', '-') == reason
        }
            ?: error("Unknown hint outcome")
    )
}

internal fun AssessmentSummaryDto.player(): AssessmentSummary = AssessmentSummary(
    "sudoku-rating-v2",
    variant.player(),
    difficulty.player(),
    AssessmentWorkload(
        workload.steps.toLong(),
        workload.placements.toLong(),
        workload.eliminations.toLong(),
        workload.candidateRemovals.toLong(),
        workload.techniqueCounts.mapKeys {
            it.key.wire()
        }.mapValues {
            it.value.toLong()
        },
        workload.highestTier?.player(),
        workload.highestTechnique?.wire(),
        workload.variantSteps.toLong()
    )
)

private fun Long.nativeCount(): UInt {
    require(this in 0..UInt.MAX_VALUE.toLong()) { "Invalid assessment count" }
    return toUInt()
}
internal fun AssessmentSummary.native(): AssessmentSummaryDto = AssessmentSummaryDto(
    RatingVersionDto.V2,
    variant.native(),
    difficulty.native(),
    WorkloadDto(
        workload.steps.nativeCount(),
        workload.placements.nativeCount(),
        workload.eliminations.nativeCount(),
        workload.candidateRemovals.nativeCount(),
        workload.techniqueCounts.mapKeys {
            it.key.nativeTechnique()
        }.mapValues {
            it.value.nativeCount()
        },
        workload.highestTier?.native(),
        workload.highestTechnique?.nativeTechnique(),
        workload.variantSteps.nativeCount()
    )
)

internal fun PuzzleAssessment.native(): StoredAssessmentDto = when (this) {
    is PuzzleAssessment.Rated -> StoredAssessmentDto.Rated(
        summary.ratingVersion,
        if (summary.ratingVersion ==
            "sudoku-rating-v2"
        ) {
            summary.native()
        } else {
            null
        }
    )
    is PuzzleAssessment.Unavailable -> StoredAssessmentDto.Unavailable(
        UnavailableReasonDto.entries.firstOrNull {
            it.name.lowercase().replace('_', '-') == reason
        }
            ?: error("Unknown assessment availability"),
        issues.toList()
    )
}

internal fun PuzzleAssessmentDto.player(): PuzzleAssessment = when (this) {
    is PuzzleAssessmentDto.Rated -> PuzzleAssessment.Rated(summary.player())
    is PuzzleAssessmentDto.Unavailable -> PuzzleAssessment.Unavailable(
        reason.name.lowercase().replace('_', '-'),
        issues.toList()
    )
}
