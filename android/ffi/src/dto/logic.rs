use super::rules::UnitDto;
use super::values::{BoardDto, DigitDto};
use serde::{Deserialize, Serialize};

#[derive(
    Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, uniffi::Enum,
)]
#[serde(rename_all = "kebab-case")]
pub enum TechniqueDto {
    NakedSingle,
    HiddenSingle,
    LockedCandidate,
    NakedPair,
    HiddenPair,
    NakedTriple,
    HiddenTriple,
    XWing,
    Swordfish,
    #[serde(rename = "xy-wing")]
    XYWing,
    SimpleColoring,
    CageDistinct,
    CageRemainder,
    CageCombination,
    ThermoBound,
    ArrowEquation,
    ArrowCombination,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct DomainDto {
    pub cell: u32,
    pub mask: u16,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct BoundDto {
    pub cell: u32,
    pub min: DigitDto,
    pub max: DigitDto,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum RuleEvidenceDto {
    Cage {
        #[serde(rename = "constraintId")]
        constraint_id: String,
        cells: Vec<u32>,
        digits: Vec<DigitDto>,
        sum: u16,
        domains: Vec<DomainDto>,
    },
    Thermo {
        #[serde(rename = "constraintId")]
        constraint_id: String,
        cells: Vec<u32>,
        digits: Vec<DigitDto>,
        path: Vec<u32>,
        bounds: Vec<BoundDto>,
    },
    Arrow {
        #[serde(rename = "constraintId")]
        constraint_id: String,
        cells: Vec<u32>,
        digits: Vec<DigitDto>,
        circle: u32,
        shaft: Vec<u32>,
        domains: Vec<DomainDto>,
    },
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct ColoringLinkDto {
    pub unit: UnitDto,
    pub cells: Vec<u32>,
}

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum ColoringModeDto {
    Trap,
    Wrap,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum AdvancedEvidenceDto {
    Subset {
        cells: Vec<u32>,
        digits: Vec<DigitDto>,
        domains: Vec<DomainDto>,
        unit: UnitDto,
        hidden: bool,
    },
    Fish {
        cells: Vec<u32>,
        digits: Vec<DigitDto>,
        domains: Vec<DomainDto>,
        bases: Vec<UnitDto>,
        covers: Vec<UnitDto>,
    },
    Wing {
        cells: Vec<u32>,
        digits: Vec<DigitDto>,
        domains: Vec<DomainDto>,
        pivot: u32,
        wings: Vec<u32>,
    },
    Coloring {
        cells: Vec<u32>,
        digits: Vec<DigitDto>,
        domains: Vec<DomainDto>,
        mode: ColoringModeDto,
        colors: Vec<Vec<u32>>,
        links: Vec<ColoringLinkDto>,
    },
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct UnitEvidenceDto {
    pub kind: UnitEvidenceKindDto,
    pub unit: UnitDto,
    pub cells: Vec<u32>,
    pub digits: Vec<DigitDto>,
    pub premises: Vec<RuleEvidenceDto>,
    #[serde(default)]
    pub units: Vec<UnitDto>,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum UnitEvidenceKindDto {
    Unit,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Enum)]
#[serde(untagged)]
pub enum EvidenceDto {
    Rule { value: RuleEvidenceDto },
    Advanced { value: AdvancedEvidenceDto },
    Unit { value: UnitEvidenceDto },
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct RemovalDto {
    pub cell: u32,
    pub digit: DigitDto,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum LogicalStepDto {
    Placement {
        technique: TechniqueDto,
        evidence: EvidenceDto,
        cell: u32,
        digit: DigitDto,
    },
    Elimination {
        technique: TechniqueDto,
        evidence: EvidenceDto,
        removals: Vec<RemovalDto>,
    },
}

#[derive(Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct PlacementDto {
    pub cell: u32,
    pub digit: DigitDto,
}

#[derive(Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "kebab-case")]
pub enum HintUnavailableDto {
    Complete,
    Unsupported,
    Incomplete,
}

#[derive(Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum HintResultDto {
    ReviewEntry {
        cell: u32,
    },
    Deduction {
        steps: Vec<LogicalStepDto>,
        placement: PlacementDto,
    },
    Unavailable {
        reason: HintUnavailableDto,
    },
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct HintInputDto {
    pub board: BoardDto,
    pub solution: BoardDto,
    pub rules: super::rules::RulesDto,
    #[serde(default)]
    pub max_steps: Option<u32>,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct HintValidationInputDto {
    pub hint: HintResultDto,
    pub rules: super::rules::RulesDto,
    #[serde(default)]
    pub board: Option<BoardDto>,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LogicInputDto {
    pub board: BoardDto,
    pub rules: super::rules::RulesDto,
    pub allowed: Vec<TechniqueDto>,
    pub max_steps: u32,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum LogicResultDto {
    Solved {
        board: BoardDto,
        steps: Vec<LogicalStepDto>,
    },
    Stalled {
        board: BoardDto,
        steps: Vec<LogicalStepDto>,
    },
    Incomplete {
        board: BoardDto,
        steps: Vec<LogicalStepDto>,
        cause: super::rating::ExhaustionCauseDto,
    },
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum HintValidationDto {
    Valid { hint: HintResultDto },
    Invalid { issues: Vec<String> },
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct TeachingStepInputDto {
    pub board: super::values::BoardDto,
    pub candidates: Vec<u16>,
    pub rules: super::rules::RulesDto,
    pub step: LogicalStepDto,
}
