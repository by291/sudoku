use crate::logic::techniques::{ALL_CLASSIC_TECHNIQUES, BASIC_TECHNIQUES, Technique};
use crate::rules::types::SudokuVariant;

/// Hint orchestration uses the supported hard policy; Classic additionally permits expert patterns.
pub fn hint_techniques(variant: SudokuVariant) -> Vec<Technique> {
    if variant == SudokuVariant::Classic {
        return ALL_CLASSIC_TECHNIQUES.to_vec();
    }
    let ordered = [
        Technique::NakedSingle,
        Technique::HiddenSingle,
        Technique::CageDistinct,
        Technique::CageRemainder,
        Technique::ThermoBound,
        Technique::ArrowEquation,
        Technique::LockedCandidate,
        Technique::CageCombination,
        Technique::ArrowCombination,
        Technique::NakedPair,
        Technique::HiddenPair,
    ];
    ordered
        .into_iter()
        .filter(|technique| {
            if BASIC_TECHNIQUES.contains(technique) {
                return true;
            }
            match variant {
                SudokuVariant::Killer => matches!(
                    technique,
                    Technique::CageDistinct | Technique::CageRemainder | Technique::CageCombination
                ),
                SudokuVariant::Thermo => *technique == Technique::ThermoBound,
                SudokuVariant::Arrow => matches!(
                    technique,
                    Technique::ArrowEquation | Technique::ArrowCombination
                ),
                SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw => false,
            }
        })
        .collect()
}
