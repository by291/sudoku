use super::types::{AssessmentInput, AssessmentLimits, RATING_VERSION};
use crate::rules::context::validate_rules;
use crate::rules::types::PuzzleRules;
use crate::types::Board;
use crate::types::{CoreResult, EngineError};

pub const MAX_ASSESSMENT_STEPS: u32 = 500;
pub const MAX_ASSESSMENT_WORK: u64 = 4000000;

impl Default for AssessmentLimits {
    fn default() -> Self {
        Self {
            max_steps: MAX_ASSESSMENT_STEPS,
            max_work: MAX_ASSESSMENT_WORK,
        }
    }
}

impl AssessmentLimits {
    pub(crate) fn validate(self) -> CoreResult<()> {
        if self.max_steps > MAX_ASSESSMENT_STEPS || self.max_work > MAX_ASSESSMENT_WORK {
            return Err(EngineError::invalid("Invalid assessment work limits"));
        }
        Ok(())
    }
}

pub fn create_assessment_input(
    board: &Board,
    rules: &PuzzleRules,
    limits: AssessmentLimits,
) -> AssessmentInput {
    AssessmentInput {
        board: board.clone(),
        rules: rules.clone(),
        rating_version: RATING_VERSION.to_string(),
        limits,
    }
}

pub(crate) fn validate_input(input: &AssessmentInput) -> CoreResult<()> {
    if input.rating_version != RATING_VERSION {
        return Err(EngineError::invalid(
            "Invalid assessment envelope or rating version",
        ));
    }
    validate_rules(&input.rules)?;
    input.limits.validate()
}
