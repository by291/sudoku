use super::values::{index, indices};
use crate::dto::operations::{ViolationCodeDto, ViolationDto};
use sudoku_core::constraints::types::{RuleViolation, ViolationCode};
use sudoku_core::types::CoreResult;

/// Copies checked violation facts without interpreting or rendering them.
pub(crate) fn violation_to_dto(violation: &RuleViolation) -> CoreResult<ViolationDto> {
    let code = match violation.code {
        ViolationCode::Duplicate => ViolationCodeDto::Duplicate,
        ViolationCode::CageTotal {
            index: clue_index,
            sum,
        } => ViolationCodeDto::CageTotal {
            index: index(clue_index)?,
            sum,
        },
        ViolationCode::ThermoOrder { index: clue_index } => ViolationCodeDto::ThermoOrder {
            index: index(clue_index)?,
        },
        ViolationCode::ArrowTotal { index: clue_index } => ViolationCodeDto::ArrowTotal {
            index: index(clue_index)?,
        },
    };

    Ok(ViolationDto {
        constraint_id: violation.constraint_id.clone(),
        cells: indices(&violation.cells)?,
        code,
    })
}
