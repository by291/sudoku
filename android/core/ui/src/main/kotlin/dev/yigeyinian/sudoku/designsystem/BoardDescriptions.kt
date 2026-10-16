package dev.yigeyinian.sudoku.designsystem

import dev.yigeyinian.sudoku.model.Evidence
import dev.yigeyinian.sudoku.model.PuzzleRules

internal fun noteDigits(mask: Int): List<Int> = (1..9).filter { mask and (1 shl (it - 1)) != 0 }

internal fun cellRuleDescriptions(cell: Int, rules: PuzzleRules): List<String> = when (rules) {
    PuzzleRules.Classic -> emptyList()
    PuzzleRules.Diagonal -> buildList {
        if (cell / 9 == cell % 9) {
            add("主对角线：填入1到9，数字不能重复")
        }
        if (cell / 9 + cell % 9 == 8) {
            add("反对角线：填入1到9，数字不能重复")
        }
    }
    is PuzzleRules.Jigsaw -> rules.regions.mapIndexedNotNull { index, cells ->
        if (cell in cells) "不规则区域${index + 1}：这九格填入1到9，数字不能重复" else null
    }
    is PuzzleRules.Killer -> rules.cages.mapIndexedNotNull { index, cage ->
        if (cell in cage.cells) "笼${index + 1}：${cage.cells.size}格总和为${cage.sum}，数字不能重复" else null
    }
    is PuzzleRules.Thermo -> rules.paths.mapIndexedNotNull { index, path ->
        val position = path.indexOf(cell)
        if (position >= 0) "温度计${index + 1}：从圆球严格递增，当前是第${position + 1}格，共${path.size}格" else null
    }
    is PuzzleRules.Arrow -> rules.arrows.mapIndexedNotNull { index, arrow ->
        if (cell == arrow.circle || cell in arrow.shaft) {
            "箭头${index + 1}：${if (cell == arrow.circle) "圆圈" else "箭杆"}，箭杆${arrow.shaft.size}格总和等于圆圈数字，标准规则允许时箭杆可重复"
        } else {
            null
        }
    }
}

internal fun cellDescription(
    cell: Int,
    given: Int,
    value: Int,
    notes: Int,
    conflict: Boolean,
    evidence: Boolean,
    rules: PuzzleRules
): String = buildList {
    add("第${cell / 9 + 1}行第${cell % 9 + 1}列")
    if (value > 0) {
        add("数字$value")
        if (given > 0) {
            add("题目给定")
        }
    } else {
        add("空格")
        val digits = noteDigits(notes)
        if (digits.isNotEmpty()) {
            add("笔记${digits.joinToString("、")}")
        }
    }
    if (conflict) {
        add("冲突，请检查")
    }
    if (evidence) {
        add("推理依据位置")
    }
    addAll(cellRuleDescriptions(cell, rules))
}.joinToString("，")

internal fun evidenceCellDescription(cell: Int, evidence: Evidence?): String = when (evidence) {
    is Evidence.Coloring -> when {
        cell in evidence.colors.getOrElse(0) { emptyList() } -> "着色第一组，细圆圈"
        cell in evidence.colors.getOrElse(1) { emptyList() } -> "着色第二组，粗圆圈"
        else -> ""
    }
    is Evidence.Wing -> when {
        cell == evidence.pivot -> "XY-Wing枢轴"
        cell in evidence.wings -> "XY-Wing翼格"
        else -> ""
    }
    else -> ""
}
