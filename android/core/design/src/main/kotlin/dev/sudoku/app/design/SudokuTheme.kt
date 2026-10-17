package dev.sudoku.app.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Board-specific tokens mirror the shared Web palette; platform controls use the matching Material scheme. */
@Immutable
data class SudokuPalette(
    val surface: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val accentSoft: Color,
    val border: Color,
    val error: Color,
    val errorSoft: Color,
    val evidence: Color,
    val peer: Color,
    val clueStroke: Color,
    val clueFill: Color
)

private val lightSudokuPalette = SudokuPalette(
    surface = Color(0xFFFFFEF9),
    text = Color(0xFF233A36),
    muted = Color(0xFF5F6D65),
    accent = Color(0xFF147D71),
    accentSoft = Color(0xFFE0EFEA),
    border = Color(0xFF81958B),
    error = Color(0xFFB14444),
    errorSoft = Color(0xFFFAE4DF),
    evidence = Color(0xFFF3E4B7),
    peer = Color(0xFFF0F3E9),
    clueStroke = Color(0xFF5F796C),
    clueFill = Color(0xFF91AB9C)
)

private val darkSudokuPalette = SudokuPalette(
    surface = Color(0xFF20332E),
    text = Color(0xFFE4ECE3),
    muted = Color(0xFFADC0B2),
    accent = Color(0xFF74CBBB),
    accentSoft = Color(0xFF294C41),
    border = Color(0xFF84998D),
    error = Color(0xFFFFB0A0),
    errorSoft = Color(0xFF633E36),
    evidence = Color(0xFF66582C),
    peer = Color(0xFF293F34),
    clueStroke = Color(0xFFA3BFAE),
    clueFill = Color(0xFF617E6E)
)

val LocalSudokuPalette = staticCompositionLocalOf { lightSudokuPalette }

@Composable
fun SudokuTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
    val board = if (darkTheme) darkSudokuPalette else lightSudokuPalette
    val scheme = if (darkTheme) {
        darkColorScheme(
            primary = board.accent,
            onPrimary = Color(0xFF162521),
            primaryContainer = board.accentSoft,
            onPrimaryContainer = board.text,
            secondary = Color(0xFF829FAA),
            onSecondary = Color(0xFF162521),
            secondaryContainer = Color(0xFF354851),
            onSecondaryContainer = board.text,
            surfaceContainerLowest = Color(0xFF162521),
            surfaceContainerLow = board.surface,
            surfaceContainer = board.peer,
            surfaceContainerHigh = board.peer,
            surfaceContainerHighest = board.peer,
            surfaceTint = board.accent,
            background = Color(0xFF162521),
            onBackground = board.text,
            surface = board.surface,
            onSurface = board.text,
            surfaceVariant = board.peer,
            onSurfaceVariant = board.muted,
            outline = board.border,
            error = board.error,
            onError = Color(0xFF162521),
            errorContainer = board.errorSoft,
            onErrorContainer = board.error
        )
    } else {
        lightColorScheme(
            primary = board.accent,
            onPrimary = board.surface,
            primaryContainer = board.accentSoft,
            onPrimaryContainer = board.text,
            secondary = Color(0xFF526D7A),
            onSecondary = board.surface,
            secondaryContainer = Color(0xFFDCE7EB),
            onSecondaryContainer = board.text,
            surfaceContainerLowest = board.surface,
            surfaceContainerLow = board.surface,
            surfaceContainer = board.peer,
            surfaceContainerHigh = board.peer,
            surfaceContainerHighest = board.peer,
            surfaceTint = board.accent,
            background = Color(0xFFF5F4EE),
            onBackground = board.text,
            surface = board.surface,
            onSurface = board.text,
            surfaceVariant = board.peer,
            onSurfaceVariant = board.muted,
            outline = board.border,
            error = board.error,
            onError = board.surface,
            errorContainer = board.errorSoft,
            onErrorContainer = board.error
        )
    }

    CompositionLocalProvider(LocalSudokuPalette provides board) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
