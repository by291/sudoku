package dev.sudoku.app.game

import dev.sudoku.app.model.AssessmentIssue
import dev.sudoku.app.model.AssessmentResult
import dev.sudoku.app.model.PuzzleAssessment
import dev.sudoku.app.model.RuleViolation
import dev.sudoku.app.model.ViolationCode

internal fun violationMessage(violation: RuleViolation): String = when (val code = violation.code) {
    ViolationCode.Duplicate -> "同一行、列、宫、区域、对角线或笼中的数字不能重复。"
    is ViolationCode.CageTotal -> "第${code.index + 1}个笼内数字不能重复，总和必须为${code.sum}。"
    is ViolationCode.ThermoOrder -> "第${code.index + 1}支温度计的数字必须从圆头开始严格递增。"
    is ViolationCode.ArrowTotal -> "第${code.index + 1}条箭头上的数字总和必须等于圆圈内数字。"
}

internal fun assessmentIssueMessage(issue: AssessmentIssue): String = when (issue) {
    is AssessmentIssue.Message -> issue.message
    is AssessmentIssue.Violation -> "${issue.violation.constraintId}: ${violationMessage(issue.violation)}"
}

/** Historical metadata stores rendered strings; the engine never constructs that presentation. */
internal fun AssessmentResult.toStoredAssessment(): PuzzleAssessment = when (this) {
    is AssessmentResult.Rated -> PuzzleAssessment.Rated(summary)
    is AssessmentResult.Ungraded -> PuzzleAssessment.Unavailable("ungraded", emptyList())
    is AssessmentResult.Invalid -> PuzzleAssessment.Unavailable("invalid-input", issues.map(::assessmentIssueMessage))
}
