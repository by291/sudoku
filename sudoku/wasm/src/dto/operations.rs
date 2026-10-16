use super::rules::RulesDto;
use super::values::{BoardDto, DigitDto, SearchOptionsDto, WorkOptionsDto};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

/// Numeric budget consumption is explicit and never shared as mutable JS state across an operation.
#[derive(Serialize, Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[tsify(hashmap_as_object, missing_as_null)]
pub struct WorkResultDto<T> {
    pub result: T,
    pub work_used: u32,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct BoardQueryDto {
    pub board: BoardDto,
    #[serde(default)]
    pub work: Option<WorkOptionsDto>,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct CountInputDto {
    pub board: BoardDto,
    pub rules: RulesDto,
    #[serde(default)]
    pub work: Option<SearchOptionsDto>,
}

#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
#[tsify(hashmap_as_object, missing_as_null)]
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

#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum CandidateResultDto {
    Complete { candidates: Vec<u16> },
    BudgetExhausted,
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ViolationCodeDto {
    Duplicate,
    CageTotal { index: u32, sum: u16 },
    ThermoOrder { index: u32 },
    ArrowTotal { index: u32 },
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ViolationDto {
    pub constraint_id: String,
    pub cells: Vec<u32>,
    pub code: ViolationCodeDto,
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ConflictResultDto {
    Complete { violations: Vec<ViolationDto> },
    BudgetExhausted { violations: Vec<ViolationDto> },
}

#[derive(Deserialize, Tsify)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum BoardEditDto {
    Enter { cell: u32, digit: DigitDto },
    Erase { cell: u32 },
    ToggleNote { cell: u32, digit: DigitDto },
    GenerateNotes,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct EditInputDto {
    pub givens: BoardDto,
    pub entries: BoardDto,
    pub notes: Vec<u16>,
    pub action: BoardEditDto,
    #[serde(default)]
    pub work: Option<WorkOptionsDto>,
}

#[derive(Serialize, Deserialize, Tsify)]
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

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct PreparedCountInputDto {
    pub board: BoardDto,
    #[serde(default)]
    pub work: Option<SearchOptionsDto>,
}

// Tsify 0.5.8's ABI names erase generic arguments. Concrete transparent responses keep generated signatures sound.
macro_rules! work_response {
    ($name:ident, $result:ty) => {
        #[derive(Serialize, Tsify)]
        #[serde(transparent)]
        #[tsify(hashmap_as_object, missing_as_null)]
        pub struct $name(pub WorkResultDto<$result>);
    };
}
work_response!(CandidateWorkDto, CandidateResultDto);

work_response!(SearchWorkDto, SearchResultDto);

work_response!(LogicWorkDto, super::logic::LogicResultDto);
work_response!(HintWorkDto, super::logic::HintResultDto);
work_response!(AssessmentWorkDto, super::rating::AssessmentResultDto);
work_response!(
    AssessmentSummaryWorkDto,
    super::rating::AssessmentOutcomeDto
);

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct ReviewInputDto {
    pub board: BoardDto,
    pub solution: BoardDto,
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(transparent)]
#[tsify(hashmap_as_object, missing_as_null)]
pub struct ConflictWorkDto(pub WorkResultDto<ConflictResultDto>);

#[derive(Serialize, Deserialize, Tsify)]
#[serde(transparent)]
#[tsify(hashmap_as_object, missing_as_null)]
pub struct EditWorkDto(pub WorkResultDto<EditResultDto>);

#[derive(Serialize, Tsify)]
#[serde(rename_all = "kebab-case")]
pub enum LiveExecutionDto {
    Immediate,
    Worker,
}
