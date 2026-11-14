use crate::rules::types::SudokuVariant;

/// Stable engine identities; player-facing names belong to the presentation layer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum Technique {
    NakedSingle,
    HiddenSingle,
    LockedCandidate,
    NakedPair,
    HiddenPair,
    NakedTriple,
    HiddenTriple,
    XWing,
    Swordfish,
    XYWing,
    SimpleColoring,
    CageDistinct,
    CageRemainder,
    CageCombination,
    ThermoBound,
    ArrowEquation,
    ArrowCombination,
}

pub const BASIC_TECHNIQUES: [Technique; 5] = [
    Technique::NakedSingle,
    Technique::HiddenSingle,
    Technique::LockedCandidate,
    Technique::NakedPair,
    Technique::HiddenPair,
];

pub const ADVANCED_TECHNIQUES: [Technique; 6] = [
    Technique::NakedTriple,
    Technique::HiddenTriple,
    Technique::XWing,
    Technique::Swordfish,
    Technique::XYWing,
    Technique::SimpleColoring,
];

pub const ALL_CLASSIC_TECHNIQUES: [Technique; 11] = [
    Technique::NakedSingle,
    Technique::HiddenSingle,
    Technique::LockedCandidate,
    Technique::NakedPair,
    Technique::HiddenPair,
    Technique::NakedTriple,
    Technique::HiddenTriple,
    Technique::XWing,
    Technique::Swordfish,
    Technique::XYWing,
    Technique::SimpleColoring,
];

pub const ALL_TECHNIQUES: [Technique; 17] = [
    Technique::NakedSingle,
    Technique::HiddenSingle,
    Technique::LockedCandidate,
    Technique::NakedPair,
    Technique::HiddenPair,
    Technique::NakedTriple,
    Technique::HiddenTriple,
    Technique::XWing,
    Technique::Swordfish,
    Technique::XYWing,
    Technique::SimpleColoring,
    Technique::CageDistinct,
    Technique::CageRemainder,
    Technique::CageCombination,
    Technique::ThermoBound,
    Technique::ArrowEquation,
    Technique::ArrowCombination,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TechniqueAction {
    Placement,
    Elimination,
    Either,
}

impl Technique {
    /// Return the stable identifier used in serialized evidence.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NakedSingle => "naked-single",
            Self::HiddenSingle => "hidden-single",
            Self::LockedCandidate => "locked-candidate",
            Self::NakedPair => "naked-pair",
            Self::HiddenPair => "hidden-pair",
            Self::NakedTriple => "naked-triple",
            Self::HiddenTriple => "hidden-triple",
            Self::XWing => "x-wing",
            Self::Swordfish => "swordfish",
            Self::XYWing => "xy-wing",
            Self::SimpleColoring => "simple-coloring",
            Self::CageDistinct => "cage-distinct",
            Self::CageRemainder => "cage-remainder",
            Self::CageCombination => "cage-combination",
            Self::ThermoBound => "thermo-bound",
            Self::ArrowEquation => "arrow-equation",
            Self::ArrowCombination => "arrow-combination",
        }
    }

    /// Resolve an exact stable technique identifier.
    pub fn parse(value: &str) -> Option<Self> {
        ALL_TECHNIQUES
            .into_iter()
            .find(|technique| technique.as_str() == value)
    }

    /// Report whether the technique belongs to the advanced catalogue.
    pub fn is_advanced(self) -> bool {
        ADVANCED_TECHNIQUES.contains(&self)
    }

    /// Report whether the technique belongs to the Classic catalogue.
    pub fn is_classic(self) -> bool {
        ALL_CLASSIC_TECHNIQUES.contains(&self)
    }

    /// Return the action kinds the technique can produce.
    pub fn action(self) -> TechniqueAction {
        match self {
            Self::NakedSingle | Self::HiddenSingle | Self::CageRemainder | Self::ArrowEquation => {
                TechniqueAction::Placement
            }
            Self::LockedCandidate
            | Self::NakedPair
            | Self::HiddenPair
            | Self::NakedTriple
            | Self::HiddenTriple
            | Self::XWing
            | Self::Swordfish
            | Self::XYWing
            | Self::SimpleColoring => TechniqueAction::Elimination,
            Self::CageDistinct
            | Self::CageCombination
            | Self::ThermoBound
            | Self::ArrowCombination => TechniqueAction::Either,
        }
    }
}

/// Borrow allowed techniques in their actual solver priority order.
/// Classic uses catalogue order; variants retain caller order, including repeated entries.
pub(crate) fn execution_order(
    variant: SudokuVariant,
    allowed: &[Technique],
) -> impl Iterator<Item = Technique> + Clone + '_ {
    let is_classic = variant == SudokuVariant::Classic;
    let order = if is_classic {
        &ALL_CLASSIC_TECHNIQUES[..]
    } else {
        allowed
    };

    order
        .iter()
        .copied()
        .filter(move |technique| !is_classic || allowed.contains(technique))
}
