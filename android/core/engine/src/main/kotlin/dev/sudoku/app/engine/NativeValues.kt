package dev.sudoku.app.engine

import dev.sudoku.app.ffi.DifficultyDto
import dev.sudoku.app.ffi.VariantDto
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.Variant

// Conversions own collections on both sides; generated handles never enter player state.

internal fun List<Int>.nativeBoard(): ByteArray {
    require(size == 81) { "A board requires exactly 81 cells" }
    require(all { it in 0..9 }) { "Invalid board digit" }
    return ByteArray(size) { this[it].toByte() }
}

internal fun ByteArray.playerBoard(): List<Int> = map { it.toInt() and 255 }

internal fun Int.nativeCell(): UInt {
    require(this in 0..80) { "Invalid cell index" }
    return toUInt()
}

internal fun Int.nativeDigit(): UByte {
    require(this in 1..9) { "Invalid digit" }
    return toUByte()
}

internal fun Int.nativeMask(): UShort {
    require(this in 0..511) { "Invalid candidate mask" }
    return toUShort()
}

internal fun List<Int>.nativeCells(): List<UInt> = map { it.nativeCell() }

internal fun List<UInt>.playerCells(): List<Int> = map { it.toInt() }

internal fun Variant.native(): VariantDto = when (this) {
    Variant.CLASSIC -> VariantDto.CLASSIC
    Variant.DIAGONAL -> VariantDto.DIAGONAL
    Variant.JIGSAW -> VariantDto.JIGSAW
    Variant.KILLER -> VariantDto.KILLER
    Variant.THERMO -> VariantDto.THERMO
    Variant.ARROW -> VariantDto.ARROW
}

internal fun VariantDto.player(): Variant = when (this) {
    VariantDto.CLASSIC -> Variant.CLASSIC
    VariantDto.DIAGONAL -> Variant.DIAGONAL
    VariantDto.JIGSAW -> Variant.JIGSAW
    VariantDto.KILLER -> Variant.KILLER
    VariantDto.THERMO -> Variant.THERMO
    VariantDto.ARROW -> Variant.ARROW
}

internal fun Difficulty.native(): DifficultyDto = when (this) {
    Difficulty.EASY -> DifficultyDto.EASY
    Difficulty.MEDIUM -> DifficultyDto.MEDIUM
    Difficulty.HARD -> DifficultyDto.HARD
    Difficulty.EXPERT -> DifficultyDto.EXPERT
}

internal fun DifficultyDto.player(): Difficulty = when (this) {
    DifficultyDto.EASY -> Difficulty.EASY
    DifficultyDto.MEDIUM -> Difficulty.MEDIUM
    DifficultyDto.HARD -> Difficulty.HARD
    DifficultyDto.EXPERT -> Difficulty.EXPERT
}
