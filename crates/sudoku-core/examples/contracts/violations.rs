use serde_json::{Value, json};
use sudoku_core::constraints::types::{RuleViolation, ViolationCode};

pub fn message(violation: &RuleViolation) -> String {
    match violation.code {
        ViolationCode::Duplicate => "同一行、列、宫、区域、对角线或笼中的数字不能重复。".to_owned(),
        ViolationCode::CageTotal { index, sum } => {
            format!("第{}个笼内数字不能重复，总和必须为{}。", index + 1, sum)
        }
        ViolationCode::ThermoOrder { index } => {
            format!("第{}支温度计的数字必须从圆头开始严格递增。", index + 1)
        }
        ViolationCode::ArrowTotal { index } => {
            format!("第{}条箭头上的数字总和必须等于圆圈内数字。", index + 1)
        }
    }
}

pub fn project_violation(violation: RuleViolation) -> Value {
    json!({"constraintId":violation.constraint_id,"cells":violation.cells,"message":message(&violation)})
}
