//! Compatibility paths; hint chains and teaching proofs live with their respective owners.
pub use super::teaching::{validate_teaching_step, validate_teaching_step_with_budget};
pub use crate::hint::validation::{
    HINT_VALIDATION_WORK_LIMIT, validate_hint_evidence, validate_hint_evidence_with_budget,
    validate_hint_shape,
};
