package dev.yigeyinian.sudoku.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import dev.yigeyinian.sudoku.design.LocalSudokuPalette
import dev.yigeyinian.sudoku.design.SudokuPalette
import dev.yigeyinian.sudoku.design.SudokuTheme
import dev.yigeyinian.sudoku.model.ThemePreference

internal typealias BoardColors = SudokuPalette
internal val LocalBoardColors = LocalSudokuPalette

/** Adapts the portable preference to the independent visual theme. */
@Composable
fun YigeTheme(preference: ThemePreference = ThemePreference.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (preference) {
        ThemePreference.LIGHT -> false
        ThemePreference.DARK -> true
        ThemePreference.SYSTEM -> isSystemInDarkTheme()
    }
    SudokuTheme(darkTheme = dark, content = content)
}
