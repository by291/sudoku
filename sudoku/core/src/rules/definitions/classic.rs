use super::super::{
    topology::{classic_units, compile_units},
    types::CompiledVariantRules,
};

pub(super) fn compile() -> CompiledVariantRules {
    compile_units(classic_units())
}
