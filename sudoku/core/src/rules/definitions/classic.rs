use super::super::{
    topology::{classic_units, compile_units},
    types::CompiledVariantRules,
};

/// Compile Classic rows, columns and boxes without arithmetic constraints.
pub(super) fn compile() -> CompiledVariantRules {
    compile_units(classic_units())
}
