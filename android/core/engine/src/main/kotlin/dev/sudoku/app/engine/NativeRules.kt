package dev.sudoku.app.engine

import dev.sudoku.app.ffi.ArrowDto
import dev.sudoku.app.ffi.AssessmentIssueDto
import dev.sudoku.app.ffi.CageDto
import dev.sudoku.app.ffi.ConstraintDto
import dev.sudoku.app.ffi.MetadataDto
import dev.sudoku.app.ffi.RulesDto
import dev.sudoku.app.ffi.ViolationCodeDto
import dev.sudoku.app.ffi.ViolationDto
import dev.sudoku.app.model.ArrowClue
import dev.sudoku.app.model.AssessmentIssue
import dev.sudoku.app.model.Cage
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.RuleConstraint
import dev.sudoku.app.model.RuleMetadata
import dev.sudoku.app.model.RuleUnit
import dev.sudoku.app.model.RuleViolation
import dev.sudoku.app.model.ViolationCode

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
            is ConstraintDto.Cage -> RuleConstraint.Cage(
                it.id,
                it.index.toInt(),
                it.cells.playerCells(),
                it.sum.toInt()
            )
            is ConstraintDto.Thermo -> RuleConstraint.Thermo(it.id, it.index.toInt(), it.cells.playerCells())
            is ConstraintDto.Arrow -> RuleConstraint.Arrow(
                it.id,
                it.index.toInt(),
                it.circle.toInt(),
                it.shaft.playerCells()
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

internal fun ViolationDto.player(): RuleViolation = RuleViolation(
    constraintId,
    cells.playerCells(),
    when (val value = code) {
        ViolationCodeDto.Duplicate -> ViolationCode.Duplicate
        is ViolationCodeDto.CageTotal -> ViolationCode.CageTotal(value.index.toLong(), value.sum.toInt())
        is ViolationCodeDto.ThermoOrder -> ViolationCode.ThermoOrder(value.index.toLong())
        is ViolationCodeDto.ArrowTotal -> ViolationCode.ArrowTotal(value.index.toLong())
    }
)

internal fun AssessmentIssueDto.player(): AssessmentIssue = when (this) {
    is AssessmentIssueDto.Message -> AssessmentIssue.Message(message)
    is AssessmentIssueDto.Violation -> AssessmentIssue.Violation(violation.player())
}
