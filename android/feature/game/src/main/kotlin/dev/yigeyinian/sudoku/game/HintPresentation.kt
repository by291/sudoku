package dev.yigeyinian.sudoku.game

import dev.yigeyinian.sudoku.model.Evidence
import dev.yigeyinian.sudoku.model.LogicalStep
import dev.yigeyinian.sudoku.model.PuzzleRules

internal fun ruleDescription(rules: PuzzleRules): String = when (rules) {
    PuzzleRules.Classic -> "每行、每列、每个九宫格都填入 1–9，不能重复。"
    PuzzleRules.Diagonal -> "遵循标准规则，两条主对角线也各填入 1–9，不能重复。"
    is PuzzleRules.Jigsaw -> "每行、每列和每个粗线围成的不规则区域各填入 1–9；不使用普通九宫格。"
    is PuzzleRules.Killer -> "遵循标准规则。虚线笼内数字不能重复，合计等于左上角的总数。"
    is PuzzleRules.Thermo -> "遵循标准规则。数字从温度计圆球到末端严格递增。"
    is PuzzleRules.Arrow -> "遵循标准规则。箭杆上的数字之和等于圆圈数字；标准规则允许时，箭杆数字可以重复。"
}

/** Translates owned proof facts; no candidate inference or logical validation happens in presentation. */
internal fun explainStep(step: LogicalStep): String {
    val reasoning = when (step.technique) {
        "naked-single" -> "唯一候选数：此格只剩一个合法候选。"
        "hidden-single" -> "单元唯一位置：这个数字在所示单元里只有一个位置。"
        "locked-candidate" -> "区块排除：候选数被限制在单元的交叉区域，可从另一单元的其他位置排除。"
        "naked-pair" -> "显性数对：两格共同占用这两个数字，可从同一单元的其他格排除。"
        "hidden-pair" -> "隐性数对：两个数字只出现在所示两格，可排除两格中的其他候选。"
        "naked-triple" -> "显性三数组：三格共同占用这三个数字，可从同一单元的其他格排除。"
        "hidden-triple" -> "隐性三数组：三个数字只出现在所示三格，可排除三格中的其他候选。"
        "x-wing" -> "X 翼：两组候选位置被限定在相同的交叉行列，可排除外部同数字候选。"
        "swordfish" -> "剑鱼：三组候选位置被限定在同样三组交叉行列，可排除外部同数字候选。"
        "xy-wing" -> "XY 翼：支点和两翼构成互斥关系，共同看到两翼的格子不能保留目标候选。"
        "simple-coloring" -> "简易染色：沿图中强关联关系交替标记，排除与证明冲突的候选。"
        "cage-distinct" -> "笼内互异：笼中已填或已锁定数字不能在同笼重复。"
        "cage-remainder" -> "笼内余数：总和减去已确定数字，得到剩余位置所需的数字。"
        "cage-combination" -> "笼内组合：结合总和、互异和当前候选，排除不属于可行组合的数字。"
        "thermo-bound" -> "温度计界限：从圆球到末端严格递增，路径位置和当前候选共同限制取值。"
        "arrow-equation" -> "箭头等式：箭杆数字之和等于圆圈数字，可确定当前等式中的唯一未知值。"
        "arrow-combination" -> "箭头组合：只保留满足箭杆总和与圆圈等式的候选组合。"
        else -> "推理类型未识别，请查看棋盘上的证明标记。"
    }
    val evidence = when (val value = step.evidence) {
        is Evidence.Cage -> "笼总和为 ${value.sum}。"
        is Evidence.Thermo -> "温度计路径：${value.path.joinToString(" → ", transform = ::position)}。"
        is Evidence.Arrow -> "圆圈位于 ${position(value.circle)}。"
        else -> "观察 ${value.cells.joinToString("、", transform = ::position)}，候选数字 ${value.digits.joinToString("、")}。"
    }
    val action = when (step) {
        is LogicalStep.Place -> "在 ${position(step.placement.cell)} 填入 ${step.placement.digit}。"
        is LogicalStep.Eliminate -> "排除：" + step.removals.joinToString("；") { "${position(it.cell)} 的 ${it.digit}" } +
            "。"
    }
    return "$reasoning\n$evidence\n$action"
}

private fun position(cell: Int): String = "第 ${cell / 9 + 1} 行第 ${cell % 9 + 1} 列"
