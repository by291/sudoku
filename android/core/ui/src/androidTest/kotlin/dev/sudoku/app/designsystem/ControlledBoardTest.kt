package dev.sudoku.app.designsystem

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertContentDescriptionContains
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import dev.sudoku.app.model.ArrowClue
import dev.sudoku.app.model.Cage
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.ThemePreference
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ControlledBoardTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun cellSelectionReportsAnActionAndKeepsProvidedBoardFacts() {
        var selected: Int? = null
        val givens = List(81) { if (it == 0) 5 else 0 }
        compose.setContent {
            SudokuTheme(ThemePreference.LIGHT) {
                SudokuBoard(
                    givens,
                    List(81) { 0 },
                    List(81) {
                        if (it ==
                            1
                        ) {
                            5
                        } else {
                            0
                        }
                    },
                    PuzzleRules.Classic,
                    0,
                    { selected = it },
                    Modifier.size(360.dp),
                    conflictCells = setOf(1)
                )
            }
        }

        compose.onNodeWithTag(
            "cell-0"
        ).assertIsSelected().assertContentDescriptionContains("数字5，题目给定", substring = true)
        compose.onNodeWithTag(
            "cell-1"
        ).assertContentDescriptionContains("第1行第2列，空格，笔记1、3，冲突，请检查", substring = true).performClick()
        compose.runOnIdle {
            assertEquals(1, selected)
            assertEquals(5, givens[0])
        }
    }

    @Test
    fun disabledBoardExposesDisabledCells() {
        compose.setContent {
            SudokuTheme(ThemePreference.DARK) {
                SudokuBoard(
                    List(81) {
                        0
                    },
                    List(81) {
                        0
                    },
                    List(81) { 0 },
                    PuzzleRules.Classic,
                    null,
                    {},
                    Modifier.size(360.dp),
                    enabled = false
                )
            }
        }

        compose.onNodeWithTag("cell-0").assertIsNotEnabled()
    }

    @Test
    fun everyVariantProvidesItsClueMeaningAtTheSelectedCell() {
        val rules = mutableStateOf<PuzzleRules>(PuzzleRules.Diagonal)
        compose.setContent {
            SudokuTheme(ThemePreference.LIGHT) {
                SudokuBoard(List(81) { 0 }, List(81) { 0 }, List(81) { 0 }, rules.value, 0, {}, Modifier.size(360.dp))
            }
        }

        compose.onNodeWithTag("cell-0").assertContentDescriptionContains("主对角线", substring = true)
        compose.runOnIdle { rules.value = PuzzleRules.Jigsaw(List(9) { row -> List(9) { row * 9 + it } }) }
        compose.onNodeWithTag("cell-0").assertContentDescriptionContains("不规则区域1", substring = true)
        compose.runOnIdle { rules.value = PuzzleRules.Killer(listOf(Cage(listOf(0, 1, 2), 6))) }
        compose.onNodeWithTag("cell-0").assertContentDescriptionContains("总和为6，数字不能重复", substring = true)
        compose.runOnIdle { rules.value = PuzzleRules.Thermo(listOf(listOf(0, 1, 2))) }
        compose.onNodeWithTag("cell-0").assertContentDescriptionContains("从圆球严格递增", substring = true)
        compose.runOnIdle { rules.value = PuzzleRules.Arrow(listOf(ArrowClue(0, listOf(1, 2)))) }
        compose.onNodeWithTag("cell-0").assertContentDescriptionContains("圆圈，箭杆2格总和等于圆圈数字", substring = true)
    }

    @Test
    fun numberPadReportsOneDigitAndAnnouncesNoteMode() {
        var digit = 0
        compose.setContent {
            SudokuTheme(ThemePreference.LIGHT) {
                NumberPad(enabled = true, noteMode = true, onDigit = { digit = it })
            }
        }

        compose.onNodeWithContentDescription("笔记数字7").performClick()
        compose.runOnIdle { assertEquals(7, digit) }
    }
}
