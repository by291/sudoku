package dev.sudoku.app.game

import dev.sudoku.app.model.AssessmentIssue
import dev.sudoku.app.model.AssessmentResult
import dev.sudoku.app.model.AssessmentSummary
import dev.sudoku.app.model.AssessmentWorkload
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.PuzzleAssessment
import dev.sudoku.app.model.RuleViolation
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.ViolationCode
import kotlin.test.Test
import kotlin.test.assertEquals

class AssessmentPresentationTest {
    private val issues = listOf(
        AssessmentIssue.Message("  original diagnostic  "),
        AssessmentIssue.Violation(RuleViolation("row:0", listOf(0, 1), ViolationCode.Duplicate)),
        AssessmentIssue.Violation(RuleViolation("cage:2", listOf(12, 3), ViolationCode.CageTotal(2, 11))),
        AssessmentIssue.Violation(RuleViolation("thermo:4", listOf(20, 11, 2), ViolationCode.ThermoOrder(4))),
        AssessmentIssue.Violation(RuleViolation("arrow:6", listOf(30, 21, 12), ViolationCode.ArrowTotal(6)))
    )
    private val messages = listOf(
        "  original diagnostic  ",
        "row:0: 同一行、列、宫、区域、对角线或笼中的数字不能重复。",
        "cage:2: 第3个笼内数字不能重复，总和必须为11。",
        "thermo:4: 第5支温度计的数字必须从圆头开始严格递增。",
        "arrow:6: 第7条箭头上的数字总和必须等于圆圈内数字。"
    )

    @Test
    fun factsRenderWithTheOriginalPrefixAndMessagesPassThrough() {
        assertEquals(messages, issues.map(::assessmentIssueMessage))
    }

    @Test
    fun mixedIssuesProjectToStoredStringsInTheirOriginalOrder() {
        val assessment = AssessmentResult.Invalid(issues).toStoredAssessment()

        assertEquals(PuzzleAssessment.Unavailable("invalid-input", messages), assessment)
    }

    @Test
    fun ungradedAndRatedProjectToTheExistingStoredShapes() {
        val summary = AssessmentSummary(
            "sudoku-rating-v2",
            Variant.CLASSIC,
            Difficulty.EASY,
            AssessmentWorkload(0, 0, 0, 0, emptyMap(), null, null, 0)
        )

        assertEquals(
            PuzzleAssessment.Unavailable("ungraded", emptyList()),
            AssessmentResult.Ungraded(Variant.CLASSIC).toStoredAssessment()
        )
        assertEquals(
            PuzzleAssessment.Rated(summary),
            AssessmentResult.Rated(summary, emptyList()).toStoredAssessment()
        )
    }
}
