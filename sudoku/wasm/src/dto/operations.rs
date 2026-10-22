use super::rules::RulesDto;
use super::values::{BoardDto, DigitDto, SearchOptionsDto};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

/// An owned computation result; incomplete outcomes never imply success.
#[derive(Serialize, Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[tsify(hashmap_as_object, missing_as_null)]
pub struct ComputationResultDto<T> {
    pub result: T,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct BoardQueryDto {
    pub board: BoardDto,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct CountInputDto {
    pub board: BoardDto,
    pub rules: RulesDto,
    #[serde(default)]
    pub options: Option<SearchOptionsDto>,
}

/// An exhausted search is incomplete and establishes neither a solution count nor uniqueness.
#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
#[tsify(hashmap_as_object, missing_as_null)]
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
#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum CandidateResultDto {
    Complete { candidates: Vec<u16> },
    Incomplete,
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

/// Exhaustion may retain sound violations, but their absence does not establish validity.
#[derive(Serialize, Deserialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ConflictResultDto {
    Complete { violations: Vec<ViolationDto> },
    Incomplete { violations: Vec<ViolationDto> },
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
}

/// Complete edits return independent layers; exhaustion has no layers to commit.
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
    Incomplete,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct PreparedCountInputDto {
    pub board: BoardDto,
    #[serde(default)]
    pub options: Option<SearchOptionsDto>,
}

// Tsify 0.5.8's ABI names erase generic arguments. Concrete transparent responses keep generated signatures sound.
macro_rules! computation_response {
    ($name:ident, $result:ty) => {
        #[derive(Serialize, Tsify)]
        #[serde(transparent)]
        #[tsify(hashmap_as_object, missing_as_null)]
        pub struct $name(pub ComputationResultDto<$result>);
    };
}
computation_response!(CandidateComputationDto, CandidateResultDto);

computation_response!(SearchComputationDto, SearchResultDto);

computation_response!(LogicComputationDto, super::logic::LogicResultDto);
computation_response!(HintComputationDto, super::logic::HintResultDto);
computation_response!(AssessmentComputationDto, super::rating::AssessmentResultDto);
computation_response!(
    AssessmentSummaryComputationDto,
    super::rating::LiveAssessmentOutcomeDto
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
pub struct ConflictComputationDto(pub ComputationResultDto<ConflictResultDto>);

#[derive(Serialize, Deserialize, Tsify)]
#[serde(transparent)]
#[tsify(hashmap_as_object, missing_as_null)]
pub struct EditComputationDto(pub ComputationResultDto<EditResultDto>);

#[derive(Serialize, Tsify)]
#[serde(rename_all = "kebab-case")]
pub enum LiveExecutionDto {
    Immediate,
    Worker,
}
