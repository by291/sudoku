use crate::logic::techniques::{
    ADVANCED_TECHNIQUES, ALL_CLASSIC_TECHNIQUES, BASIC_TECHNIQUES, Technique,
};
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

fn applicable(variant: SudokuVariant, technique: Technique) -> bool {
    if BASIC_TECHNIQUES.contains(&technique)
        || (variant == SudokuVariant::Classic && technique.is_advanced())
    {
        return true;
    }
    match variant {
        SudokuVariant::Killer => matches!(
            technique,
            Technique::CageDistinct | Technique::CageRemainder | Technique::CageCombination
        ),
        SudokuVariant::Thermo => technique == Technique::ThermoBound,
        SudokuVariant::Arrow => matches!(
            technique,
            Technique::ArrowEquation | Technique::ArrowCombination
        ),
        SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw => false,
    }
}

pub fn policy(variant: SudokuVariant, difficulty: Difficulty) -> Vec<Technique> {
    let mut ordered = vec![
        Technique::NakedSingle,
        Technique::HiddenSingle,
        Technique::CageDistinct,
        Technique::CageRemainder,
        Technique::ThermoBound,
        Technique::ArrowEquation,
    ];
    if difficulty != Difficulty::Easy {
        ordered.extend([
            Technique::LockedCandidate,
            Technique::CageCombination,
            Technique::ArrowCombination,
        ]);
    }
    if matches!(difficulty, Difficulty::Hard | Difficulty::Expert) {
        ordered.extend([Technique::NakedPair, Technique::HiddenPair]);
    }
    if difficulty == Difficulty::Expert {
        ordered.extend(ADVANCED_TECHNIQUES);
    }
    ordered
        .into_iter()
        .filter(|&technique| applicable(variant, technique))
        .collect()
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
pub(crate) fn execution_order(variant: SudokuVariant, allowed: &[Technique]) -> Vec<Technique> {
    if variant == SudokuVariant::Classic {
        ALL_CLASSIC_TECHNIQUES
            .into_iter()
            .filter(|technique| allowed.contains(technique))
            .collect()
    } else {
        allowed.to_vec()
    }
}

/// Hint orchestration uses the supported hard policy; Classic additionally permits expert patterns.
pub fn hint_techniques(variant: SudokuVariant) -> Vec<Technique> {
    if variant == SudokuVariant::Classic {
        ALL_CLASSIC_TECHNIQUES.to_vec()
    } else {
        policy(variant, Difficulty::Hard)
    }
}
