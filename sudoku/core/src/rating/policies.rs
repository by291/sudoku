use crate::logic::techniques::{ALL_CLASSIC_TECHNIQUES, BASIC_TECHNIQUES, Technique};
use crate::rules::types::SudokuVariant;
use crate::types::Difficulty;

pub fn supported_difficulties(variant: SudokuVariant) -> &'static [Difficulty] {
    if variant == SudokuVariant::Classic {
        &Difficulty::ALL
    } else {
        &Difficulty::ALL[..3]
    }
}

pub fn supports_difficulty(variant: SudokuVariant, difficulty: Difficulty) -> bool {
    supported_difficulties(variant).contains(&difficulty)
}

/// Fixed catalogues are borrowed internally; the public wrapper retains native source compatibility.
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

    let (catalogue, easy, medium): (&[Technique], usize, usize) = match variant {
        SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw => {
            (&ALL_CLASSIC_TECHNIQUES, 2, 3)
        }
        SudokuVariant::Killer => (KILLER, 4, 6),
        SudokuVariant::Thermo => (THERMO, 3, 4),
        SudokuVariant::Arrow => (ARROW, 3, 5),
    };
    let length = match difficulty {
        Difficulty::Easy => easy,
        Difficulty::Medium => medium,
        Difficulty::Expert if variant == SudokuVariant::Classic => catalogue.len(),
        Difficulty::Hard | Difficulty::Expert => {
            if matches!(
                variant,
                SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw
            ) {
                BASIC_TECHNIQUES.len()
            } else {
                catalogue.len()
            }
        }
    };
    &catalogue[..length]
}

pub fn policy(variant: SudokuVariant, difficulty: Difficulty) -> Vec<Technique> {
    policy_slice(variant, difficulty).to_vec()
}

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

/// Classic always follows catalogue order even if a caller's allowed list has another order.
pub(crate) fn execution_order(
    variant: SudokuVariant,
    allowed: &[Technique],
) -> impl Iterator<Item = Technique> + Clone + '_ {
    let classic = variant == SudokuVariant::Classic;
    let order = if classic {
        &ALL_CLASSIC_TECHNIQUES[..]
    } else {
        allowed
    };
    order
        .iter()
        .copied()
        .filter(move |technique| !classic || allowed.contains(technique))
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
