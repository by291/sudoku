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

/** Snapshot clue inputs before dispatch. Rust owns geometry validation. */
internal fun PuzzleRules.native(): RulesDto = when (this) {
    PuzzleRules.Classic -> RulesDto.Classic
    PuzzleRules.Diagonal -> RulesDto.Diagonal
    is PuzzleRules.Jigsaw -> RulesDto.Jigsaw(regions.map { it.nativeCells() })
    is PuzzleRules.Killer -> RulesDto.Killer(
        cages.map { cage ->
            require(cage.sum in 1..45)

            CageDto(cage.cells.nativeCells(), cage.sum.toUShort())
        }
    )
    is PuzzleRules.Thermo -> RulesDto.Thermo(paths.map { it.nativeCells() })
    is PuzzleRules.Arrow -> RulesDto.Arrow(
        arrows.map {
            ArrowDto(it.circle.nativeCell(), it.shaft.nativeCells())
        }
    )
}

internal fun RulesDto.player(): PuzzleRules = when (this) {
    RulesDto.Classic -> PuzzleRules.Classic
    RulesDto.Diagonal -> PuzzleRules.Diagonal
    is RulesDto.Jigsaw -> PuzzleRules.Jigsaw(regions.map { it.playerCells() })
    is RulesDto.Killer -> PuzzleRules.Killer(
        cages.map {
            Cage(it.cells.playerCells(), it.sum.toInt())
        }
    )
    is RulesDto.Thermo -> PuzzleRules.Thermo(paths.map { it.playerCells() })
    is RulesDto.Arrow -> PuzzleRules.Arrow(
        arrows.map {
            ArrowClue(it.circle.toInt(), it.shaft.playerCells())
        }
    )
}

/** Own the metadata snapshot while preserving native unit, clue and relation ordering. */
internal fun MetadataDto.player(): RuleMetadata = RuleMetadata(
    rules = rules.player(),
    units = units.map {
        RuleUnit(it.kind.name.lowercase(), it.index.toInt(), it.cells.playerCells())
    },
    constraints = constraints.map {
        when (it) {
            is ConstraintDto.Cage -> RuleConstraint.Cage(
                id = it.id,
                index = it.index.toInt(),
                cells = it.cells.playerCells(),
                sum = it.sum.toInt()
            )
            is ConstraintDto.Thermo -> RuleConstraint.Thermo(
                it.id,
                it.index.toInt(),
                it.cells.playerCells()
            )
            is ConstraintDto.Arrow -> RuleConstraint.Arrow(
                id = it.id,
                index = it.index.toInt(),
                circle = it.circle.toInt(),
                shaft = it.shaft.playerCells()
            )
        }
    },
    cellUnits = cellUnits.map { it.playerCells() },
    cellConstraints = cellConstraints.map { it.playerCells() },
    duplicatePeers = duplicatePeers.map { it.playerCells() },
    relatedCells = relatedCells.map { it.playerCells() }
)

internal fun ViolationDto.player(): RuleViolation = RuleViolation(
    constraintId,
    cells.playerCells(),
    when (val value = code) {
        ViolationCodeDto.Duplicate -> ViolationCode.Duplicate
        is ViolationCodeDto.CageTotal -> ViolationCode.CageTotal(
            value.index.toLong(),
            value.sum.toInt()
        )
        is ViolationCodeDto.ThermoOrder -> ViolationCode.ThermoOrder(value.index.toLong())
        is ViolationCodeDto.ArrowTotal -> ViolationCode.ArrowTotal(value.index.toLong())
    }
)

internal fun AssessmentIssueDto.player(): AssessmentIssue = when (this) {
    is AssessmentIssueDto.Message -> AssessmentIssue.Message(message)
    is AssessmentIssueDto.Violation -> AssessmentIssue.Violation(violation.player())
}
