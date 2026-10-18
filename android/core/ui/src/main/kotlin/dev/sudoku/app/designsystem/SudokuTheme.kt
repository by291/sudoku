package dev.sudoku.app.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import dev.sudoku.app.design.LocalSudokuPalette
import dev.sudoku.app.design.SudokuPalette
import dev.sudoku.app.design.SudokuTheme
import dev.sudoku.app.model.ThemePreference

internal typealias BoardColors = SudokuPalette

internal val LocalBoardColors = LocalSudokuPalette

/** Adapts the portable preference to the independent visual theme. */
@Composable
fun SudokuTheme(preference: ThemePreference = ThemePreference.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (preference) {
        ThemePreference.LIGHT -> false
        ThemePreference.DARK -> true
        ThemePreference.SYSTEM -> isSystemInDarkTheme()
    }
    SudokuTheme(darkTheme = dark, content = content)
}
