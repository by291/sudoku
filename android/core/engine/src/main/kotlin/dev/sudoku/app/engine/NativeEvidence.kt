package dev.sudoku.app.engine

import dev.sudoku.app.ffi.AdvancedEvidenceDto
import dev.sudoku.app.ffi.BoundDto
import dev.sudoku.app.ffi.ColoringLinkDto
import dev.sudoku.app.ffi.ColoringModeDto
import dev.sudoku.app.ffi.DomainDto
import dev.sudoku.app.ffi.EvidenceDto
import dev.sudoku.app.ffi.HintResultDto
import dev.sudoku.app.ffi.HintUnavailableDto
import dev.sudoku.app.ffi.LogicalStepDto
import dev.sudoku.app.ffi.PlacementDto
import dev.sudoku.app.ffi.RemovalDto
import dev.sudoku.app.ffi.RuleEvidenceDto
import dev.sudoku.app.ffi.TechniqueDto
import dev.sudoku.app.ffi.UnitDto
import dev.sudoku.app.ffi.UnitEvidenceDto
import dev.sudoku.app.ffi.UnitEvidenceKindDto
import dev.sudoku.app.ffi.UnitKindDto
import dev.sudoku.app.model.BoundFact
import dev.sudoku.app.model.Cage
import dev.sudoku.app.model.ColoringLink
import dev.sudoku.app.model.DomainFact
import dev.sudoku.app.model.Evidence
import dev.sudoku.app.model.HintResult
import dev.sudoku.app.model.LogicalStep
import dev.sudoku.app.model.Placement
import dev.sudoku.app.model.UnitReference

internal fun TechniqueDto.wire(): String = when (this) {
    TechniqueDto.X_WING -> "x-wing"
    TechniqueDto.XY_WING -> "xy-wing"
    else -> name.lowercase().replace('_', '-')
}

internal fun String.nativeTechnique(): TechniqueDto =
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
