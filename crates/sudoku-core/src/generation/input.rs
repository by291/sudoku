use super::types::GenerationLimits;
use crate::types::{CoreResult, EngineError};

impl GenerationLimits {
    pub(crate) fn validate(self) -> CoreResult<()> {
        let maximum = Self::default();
        if self.max_layouts > maximum.max_layouts {
            return Err(EngineError::invalid("Invalid generation limit: maxLayouts"));
        }
        if self.max_work > maximum.max_work {
            return Err(EngineError::invalid("Invalid generation limit: maxWork"));
        }
        if self.max_steps > maximum.max_steps {
            return Err(EngineError::invalid("Invalid generation limit: maxSteps"));
        }
        Ok(())
    }
}
