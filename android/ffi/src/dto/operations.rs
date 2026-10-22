use super::rules::RulesDto;
use super::values::{BoardDto, DigitDto, SearchOptionsDto};
use serde::{Deserialize, Serialize};

/// An owned computation result; incomplete outcomes never imply success.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ComputationResultDto<T> {
    pub result: T,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct BoardQueryDto {
    pub board: BoardDto,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct CountInputDto {
    pub board: BoardDto,
    pub rules: RulesDto,
    #[serde(default)]
    pub options: Option<SearchOptionsDto>,
}

/// An exhausted search is incomplete and establishes neither a solution count nor uniqueness.
#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum SearchResultDto {
    Complete {
        count: u8,
        solution: Option<BoardDto>,
        #[serde(rename = "nodesVisited")]
        nodes_visited: u32,
    },
    Incomplete {
        #[serde(rename = "nodesVisited")]
        nodes_visited: u32,
    },
}

/// Exhaustion returns no candidate grid; it must not be interpreted as an empty candidate set.
#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum CandidateResultDto {
    Complete { candidates: Vec<u16> },
    Incomplete,
}

#[derive(Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ViolationCodeDto {
    Duplicate,
    CageTotal { index: u32, sum: u16 },
    ThermoOrder { index: u32 },
    ArrowTotal { index: u32 },
}

#[derive(Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ViolationDto {
    pub constraint_id: String,
    pub cells: Vec<u32>,
    pub code: ViolationCodeDto,
}

/// Exhaustion may retain sound violations, but their absence does not establish validity.
#[derive(Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ConflictResultDto {
    Complete { violations: Vec<ViolationDto> },
    Incomplete { violations: Vec<ViolationDto> },
}

#[derive(Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum BoardEditDto {
    Enter { cell: u32, digit: DigitDto },
    Erase { cell: u32 },
    ToggleNote { cell: u32, digit: DigitDto },
    GenerateNotes,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct EditInputDto {
    pub givens: BoardDto,
    pub entries: BoardDto,
    pub notes: Vec<u16>,
    pub action: BoardEditDto,
}

/// Complete edits return independent layers; exhaustion has no layers to commit.
#[derive(Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case", deny_unknown_fields)]
pub enum EditResultDto {
    Complete {
        entries: BoardDto,
        notes: Vec<u16>,
        changed: bool,
        #[serde(rename = "boardComplete")]
        board_complete: bool,
    },
    Incomplete,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct PreparedCountInputDto {
    pub board: BoardDto,
    #[serde(default)]
    pub options: Option<SearchOptionsDto>,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct ReviewInputDto {
    pub board: BoardDto,
    pub solution: BoardDto,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(rename_all = "kebab-case")]
pub enum LiveExecutionDto {
    Immediate,
    Worker,
}

macro_rules! computation_record {
    ($name:ident, $result:ty) => {
        #[derive(uniffi::Record)]
        pub struct $name {
            pub result: $result,
        }
    };
}
computation_record!(CandidateComputationDto, CandidateResultDto);
computation_record!(ConflictComputationDto, ConflictResultDto);
computation_record!(SearchComputationDto, SearchResultDto);
computation_record!(EditComputationDto, EditResultDto);
computation_record!(HintComputationDto, super::logic::HintResultDto);
computation_record!(LogicComputationDto, super::logic::LogicResultDto);
computation_record!(AssessmentComputationDto, super::rating::AssessmentResultDto);
computation_record!(
    AssessmentSummaryComputationDto,
    super::rating::LiveAssessmentOutcomeDto
);
