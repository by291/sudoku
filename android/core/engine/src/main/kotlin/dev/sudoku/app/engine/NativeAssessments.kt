package dev.sudoku.app.engine

import dev.sudoku.app.ffi.AssessmentSummaryDto
import dev.sudoku.app.ffi.PuzzleAssessmentDto
import dev.sudoku.app.ffi.RatingVersionDto
import dev.sudoku.app.ffi.StoredAssessmentDto
import dev.sudoku.app.ffi.UnavailableReasonDto
import dev.sudoku.app.ffi.WorkloadDto
import dev.sudoku.app.model.AssessmentSummary
import dev.sudoku.app.model.AssessmentWorkload
import dev.sudoku.app.model.PuzzleAssessment

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
        if (summary.ratingVersion == "sudoku-rating-v2") {
            summary.native()
        } else {
            null
        }
    )
    is PuzzleAssessment.Unavailable -> StoredAssessmentDto.Unavailable(
        if (reason == "budget-exhausted") {
            UnavailableReasonDto.INCOMPLETE
        } else {
            UnavailableReasonDto.entries.firstOrNull {
                it.name.lowercase().replace('_', '-') == reason
            } ?: error("Unknown assessment availability")
        },
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
