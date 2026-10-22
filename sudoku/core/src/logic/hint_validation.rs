//! Compatibility paths; hint chains and teaching proofs live with their respective owners.
pub use super::teaching::{validate_teaching_step, validate_teaching_step_with_control};
pub use crate::hint::validation::{
    validate_hint_evidence, validate_hint_evidence_with_control, validate_hint_shape,
};
