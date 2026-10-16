mod arrow;
mod classic;
mod diagonal;
mod jigsaw;
mod killer;
mod thermo;

use super::types::{CompiledVariantRules, PuzzleRules};
use crate::types::CoreResult;

pub(super) fn validate(rules: &PuzzleRules) -> CoreResult<()> {
    match rules {
        PuzzleRules::Classic | PuzzleRules::Diagonal => Ok(()),
        PuzzleRules::Jigsaw { regions } => jigsaw::validate(regions),
        PuzzleRules::Killer { cages } => killer::validate(cages),
        PuzzleRules::Thermo { paths } => thermo::validate(paths),
        PuzzleRules::Arrow { arrows } => arrow::validate(arrows),
    }
}

pub(super) fn compile(rules: &PuzzleRules) -> CompiledVariantRules {
    match rules {
        PuzzleRules::Classic => classic::compile(),
        PuzzleRules::Diagonal => diagonal::compile(),
        PuzzleRules::Jigsaw { regions } => jigsaw::compile(regions),
        PuzzleRules::Killer { cages } => killer::compile(cages),
        PuzzleRules::Thermo { paths } => thermo::compile(paths),
        PuzzleRules::Arrow { arrows } => arrow::compile(arrows),
    }
}
