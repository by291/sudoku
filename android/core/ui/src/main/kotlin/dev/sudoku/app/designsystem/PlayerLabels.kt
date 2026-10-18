package dev.sudoku.app.designsystem

import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.Variant
import java.util.Locale

fun variantLabel(variant: Variant): String = when (variant) {
    Variant.CLASSIC -> "标准数独"
    Variant.DIAGONAL -> "对角数独"
    Variant.JIGSAW -> "不规则数独"
    Variant.KILLER -> "杀手数独"
    Variant.THERMO -> "温度计数独"
    Variant.ARROW -> "箭头数独"
}

fun difficultyLabel(difficulty: Difficulty): String = when (difficulty) {
    Difficulty.EASY -> "简单"
    Difficulty.MEDIUM -> "中等"
    Difficulty.HARD -> "困难"
    Difficulty.EXPERT -> "专家"
}

/** Formats a nonnegative elapsed duration in milliseconds, including hours when present. */
fun formatElapsedTime(elapsedMs: Long): String {
    val totalSeconds = elapsedMs.coerceAtLeast(0) / 1_000
    val seconds = totalSeconds % 60
    val minutes = totalSeconds / 60 % 60
    val hours = totalSeconds / 3_600

    return if (hours > 0) {
        String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.ROOT, "%02d:%02d", minutes, seconds)
    }
}

/** Compact labels shared by course and records variant selection. */
fun shortVariantLabel(variant: Variant): String = when (variant) {
    Variant.CLASSIC -> "标准"
    Variant.DIAGONAL -> "对角线"
    Variant.JIGSAW -> "不规则"
    Variant.KILLER -> "杀手"
    Variant.THERMO -> "温度计"
    Variant.ARROW -> "箭头"
}
