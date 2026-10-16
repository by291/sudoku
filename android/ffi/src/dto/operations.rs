use super::rules::RulesDto;
use super::values::{BoardDto, DigitDto, SearchOptionsDto, WorkOptionsDto};
use serde::{Deserialize, Serialize};

/// Numeric budget consumption is explicit and never shared as mutable JS state across an operation.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WorkResultDto<T> {
    pub result: T,
    pub work_used: u32,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct BoardQueryDto {
    pub board: BoardDto,
    #[serde(default)]
    pub work: Option<WorkOptionsDto>,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct CountInputDto {
    pub board: BoardDto,
    pub rules: RulesDto,
    #[serde(default)]
    pub work: Option<SearchOptionsDto>,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum SearchResultDto {
    Complete {
        count: u8,
        solution: Option<BoardDto>,
        #[serde(rename = "nodesVisited")]
        nodes_visited: u32,
        #[serde(rename = "workUsed")]
        work_used: u32,
    },
    BudgetExhausted {
        #[serde(rename = "nodesVisited")]
        nodes_visited: u32,
        #[serde(rename = "workUsed")]
        work_used: u32,
    },
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum CandidateResultDto {
    Complete { candidates: Vec<u16> },
    BudgetExhausted,
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

#[derive(Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ConflictResultDto {
    Complete { violations: Vec<ViolationDto> },
    BudgetExhausted { violations: Vec<ViolationDto> },
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
    #[serde(default)]
    pub work: Option<WorkOptionsDto>,
}

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
    BudgetExhausted,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct PreparedCountInputDto {
    pub board: BoardDto,
    #[serde(default)]
    pub work: Option<SearchOptionsDto>,
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

macro_rules! work_record {
    ($name:ident, $result:ty) => {
        #[derive(uniffi::Record)]
        pub struct $name {
            pub result: $result,
            pub work_used: u32,
        }
    };
}
work_record!(CandidateWorkDto, CandidateResultDto);
work_record!(ConflictWorkDto, ConflictResultDto);
work_record!(SearchWorkDto, SearchResultDto);
work_record!(EditWorkDto, EditResultDto);
work_record!(HintWorkDto, super::logic::HintResultDto);
work_record!(LogicWorkDto, super::logic::LogicResultDto);
work_record!(AssessmentWorkDto, super::rating::AssessmentResultDto);
work_record!(
    AssessmentSummaryWorkDto,
    super::rating::AssessmentOutcomeDto
);
