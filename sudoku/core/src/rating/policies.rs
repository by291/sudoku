use crate::logic::techniques::{ALL_CLASSIC_TECHNIQUES, BASIC_TECHNIQUES, Technique};
use crate::rules::types::SudokuVariant;
use crate::types::Difficulty;

// Non-Classic variants support the first three tiers through Hard.
const VARIANT_DIFFICULTY_COUNT: usize = 3;

struct PolicyCatalogue {
    techniques: &'static [Technique],
    easy_len: usize,
    medium_len: usize,
}

/// List the grades that can be requested for this variant, in ascending order.
pub fn supported_difficulties(variant: SudokuVariant) -> &'static [Difficulty] {
    if variant == SudokuVariant::Classic {
        &Difficulty::ALL
    } else {
        &Difficulty::ALL[..VARIANT_DIFFICULTY_COUNT]
    }
}

/// Report whether a difficulty can be requested for this variant.
pub fn supports_difficulty(variant: SudokuVariant, difficulty: Difficulty) -> bool {
    supported_difficulties(variant).contains(&difficulty)
}

/// Borrow a policy prefix without allocating an owned copy.
pub(crate) fn policy_slice(variant: SudokuVariant, difficulty: Difficulty) -> &'static [Technique] {
    use Technique::*;
    const KILLER: &[Technique] = &[
        NakedSingle,
        HiddenSingle,
        CageDistinct,
        CageRemainder,
        LockedCandidate,
        CageCombination,
        NakedPair,
        HiddenPair,
    ];
    const THERMO: &[Technique] = &[
        NakedSingle,
        HiddenSingle,
        ThermoBound,
        LockedCandidate,
        NakedPair,
        HiddenPair,
    ];
    const ARROW: &[Technique] = &[
        NakedSingle,
        HiddenSingle,
        ArrowEquation,
        LockedCandidate,
        ArrowCombination,
        NakedPair,
        HiddenPair,
    ];

    // The two lengths mark where each tier ends in its cumulative technique order.
    let catalogue = match variant {
        SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw => {
            PolicyCatalogue {
                techniques: &ALL_CLASSIC_TECHNIQUES,
                easy_len: 2,
                medium_len: 3,
            }
        }
        SudokuVariant::Killer => PolicyCatalogue {
            techniques: KILLER,
            easy_len: 4,
            medium_len: 6,
        },
        SudokuVariant::Thermo => PolicyCatalogue {
            techniques: THERMO,
            easy_len: 3,
            medium_len: 4,
        },
        SudokuVariant::Arrow => PolicyCatalogue {
            techniques: ARROW,
            easy_len: 3,
            medium_len: 5,
        },
    };

    let length = match difficulty {
        Difficulty::Easy => catalogue.easy_len,
        Difficulty::Medium => catalogue.medium_len,
        Difficulty::Expert if variant == SudokuVariant::Classic => catalogue.techniques.len(),
        Difficulty::Hard | Difficulty::Expert => {
            if matches!(
                variant,
                SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw
            ) {
                BASIC_TECHNIQUES.len()
            } else {
                catalogue.techniques.len()
            }
        }
    };

    &catalogue.techniques[..length]
}

/// Return the owned technique policy; query supported grades separately before rating.
pub fn policy(variant: SudokuVariant, difficulty: Difficulty) -> Vec<Technique> {
    policy_slice(variant, difficulty).to_vec()
}

/// Return the lowest policy tier to which this technique belongs.
pub fn technique_tier(technique: Technique) -> Difficulty {
    match technique {
        Technique::NakedSingle
        | Technique::HiddenSingle
        | Technique::CageDistinct
        | Technique::CageRemainder
        | Technique::ThermoBound
        | Technique::ArrowEquation => Difficulty::Easy,
        Technique::LockedCandidate | Technique::CageCombination | Technique::ArrowCombination => {
            Difficulty::Medium
        }
        Technique::NakedPair | Technique::HiddenPair => Difficulty::Hard,
        Technique::NakedTriple
        | Technique::HiddenTriple
        | Technique::XWing
        | Technique::Swordfish
        | Technique::XYWing
        | Technique::SimpleColoring => Difficulty::Expert,
    }
}

pub(crate) fn hint_techniques_slice(variant: SudokuVariant) -> &'static [Technique] {
    if variant == SudokuVariant::Classic {
        &ALL_CLASSIC_TECHNIQUES
    } else {
        policy_slice(variant, Difficulty::Hard)
    }
}

/// Hint orchestration uses the supported hard policy; Classic additionally permits expert patterns.
pub fn hint_techniques(variant: SudokuVariant) -> Vec<Technique> {
    hint_techniques_slice(variant).to_vec()
}
