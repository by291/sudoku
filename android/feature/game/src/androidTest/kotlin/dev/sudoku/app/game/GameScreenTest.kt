package dev.sudoku.app.game

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.InputModeManager
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.test.withKeyDown
import dev.sudoku.app.designsystem.SudokuTheme
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.Evidence
import dev.sudoku.app.model.HintResult
import dev.sudoku.app.model.LogicalStep
import dev.sudoku.app.model.Placement
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.UnitReference
import dev.sudoku.app.model.createSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class GameScreenTest {
    @get:Rule val compose = createComposeRule()
    private lateinit var inputModeManager: InputModeManager

    @Test
    fun touchAndPhysicalKeysUseTheSameNamedPlayerOperations() {
        val operations = mutableListOf<String>()
        compose.setContent {
            inputModeManager = LocalInputModeManager.current
            SudokuTheme {
                ControlledGame(
                    playingGame(),
                    onDigit = { operations += "digit:$it" },
                    onUndo = { operations += "undo" },
                    onRedo = { operations += "redo" },
                    onErase = { operations += "erase" },
                    onToggleNotes = { operations += "notes" }
                )
            }
        }

        compose.onNodeWithContentDescription("填入数字7").performClick()
        useKeyboard()
        compose.onNodeWithTag("cell-0").performClick().assertIsFocused().performKeyInput {
            pressKey(Key.Five)
            pressKey(Key.N)
            pressKey(Key.Backspace)
            withKeyDown(Key.CtrlLeft) {
                pressKey(Key.Z)
                withKeyDown(Key.ShiftLeft) { pressKey(Key.Z) }
            }
        }

        compose.runOnIdle {
            assertEquals(listOf("digit:7", "digit:5", "notes", "erase", "undo", "redo"), operations)
        }
    }

    @Test
    fun settingsDialogOwnsKeyboardUntilItCloses() {
        val digits = mutableListOf<Int>()
        compose.setContent {
            inputModeManager = LocalInputModeManager.current
            SudokuTheme { ControlledGame(playingGame(), onDigit = digits::add) }
        }
        useKeyboard()
        compose.onNodeWithTag("cell-0").performClick().assertIsFocused().performKeyInput { pressKey(Key.Three) }
        compose.runOnIdle { assertEquals(listOf(3), digits) }
        compose.onNodeWithContentDescription("对局设置与规则").performClick()

        compose.onNode(isDialog()).performKeyInput { pressKey(Key.Five) }
        compose.runOnIdle { assertEquals(listOf(3), digits) }

        compose.onNodeWithText("关闭").performClick()
        compose.onNodeWithTag("cell-0").performClick().assertIsFocused().performKeyInput { pressKey(Key.Five) }
        compose.runOnIdle { assertEquals(listOf(3, 5), digits) }
    }

    @Test
    fun hintSheetOwnsKeyboardAndRequiresTheExplicitApplyAction() {
        val digits = mutableListOf<Int>()
        var applied = 0
        val state = mutableStateOf(playingGame())
        val placement = Placement(0, 5)
        val hint = HintResult.Deduction(
            listOf(
                LogicalStep.Place(
                    "naked-single",
                    Evidence.Unit(listOf(0), listOf(5), UnitReference("row", 0), emptyList()),
                    placement
                )
            ),
            placement
        )
        compose.setContent {
            inputModeManager = LocalInputModeManager.current
            SudokuTheme {
                ControlledGame(state.value, onDigit = digits::add, onApplyHint = { applied++ })
            }
        }

        useKeyboard()
        compose.onNodeWithTag("cell-0").performClick().assertIsFocused().performKeyInput { pressKey(Key.Nine) }
        compose.runOnIdle {
            assertEquals(listOf(9), digits)
            state.value = state.value.copy(hint = hint)
        }

        compose.onNode(isDialog()).performKeyInput { pressKey(Key.Five) }
        compose.runOnIdle {
            assertEquals(listOf(9), digits)
            assertEquals(0, applied)
        }
        compose.onNodeWithText("应用：第 1 行第 1 列填 5").performClick()

        compose.runOnIdle {
            assertEquals(1, applied)
            assertEquals(listOf(9), digits)
        }
    }

    private fun useKeyboard() {
        // Compose's injected key events bypass Android's physical-key input-mode transition.
        // Selectable cells can acquire keyboard focus only after leaving touch mode.
        compose.runOnIdle { assertTrue(inputModeManager.requestInputMode(InputMode.Keyboard)) }
    }
}

@Composable
private fun ControlledGame(
    state: GameUiState,
    onDigit: (Int) -> Unit = {},
    onUndo: () -> Unit = {},
    onRedo: () -> Unit = {},
    onErase: () -> Unit = {},
    onToggleNotes: () -> Unit = {},
    onApplyHint: () -> Unit = {}
) {
    GameScreen(
        state = state,
        departing = false,
        onLeave = {},
        onRecords = {},
        onRetryPreparation = {},
        onCheckEntries = {},
        onGenerateNotes = {},
        onPause = {},
        onSelectCell = {},
        onResume = {},
        onCancelPreparation = {},
        onRetrySave = {},
        onSetShowTimer = {},
        onSetHighlightConflicts = {},
        onCancelPracticeReplacement = {},
        onConfirmPracticeReplacement = {},
        onRestart = {},
        onDismissHint = {},
        onNextHint = {},
        onApplyHint = onApplyHint,
        onEnterDigit = onDigit,
        onToggleNote = {},
        onToggleNotes = onToggleNotes,
        onUndo = onUndo,
        onRedo = onRedo,
        onRequestHint = {},
        onErase = onErase
    )
}

private fun playingGame() = GameUiState(
    phase = GamePhase.PLAYING,
    session = createSession(
        Puzzle(
            List(81) {
                0
            },
            List(81) { it % 9 + 1 },
            PuzzleRules.Classic,
            Difficulty.EASY,
            "00".repeat(32),
            "sudoku-v11"
        ),
        SessionMetadata.Free,
        "screen-test",
        "2026-10-18T00:00:00.000Z"
    ),
    selectedCell = 0
)
