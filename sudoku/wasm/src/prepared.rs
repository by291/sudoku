use crate::conversion::editing::PreparedEditInput;
use crate::conversion::rules::metadata_to_dto;
use crate::conversion::values::{DEFAULT_QUERY_WORK, budget, counter, indices};
use crate::conversion::violations::violation_to_dto;
use crate::dto::operations::{
    BoardQueryDto, CandidateResultDto, ConflictResultDto, EditInputDto, EditResultDto,
    PreparedCountInputDto, SearchResultDto, WorkResultDto,
};
use crate::dto::rules::{MetadataDto, PrepareInputDto};
use crate::dto::values::BoardDto;
use crate::js_error;
use sudoku_core::constraints::types::{ConflictStatus, PreparedComputation};
use sudoku_core::editing::EditOutcome;
use sudoku_core::search::types::SearchResult;
use sudoku_core::types::{Board, Bounded, CoreResult};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

pub fn search_to_dto(result: SearchResult) -> CoreResult<SearchResultDto> {
    Ok(match result {
        SearchResult::Complete {
            count,
            solution,
            nodes_visited,
            work_used,
        } => SearchResultDto::Complete {
            count,
            solution: solution.as_ref().map(Into::into),
            nodes_visited: counter(nodes_visited)?,
            work_used: counter(work_used)?,
        },
        SearchResult::BudgetExhausted {
            nodes_visited,
            work_used,
        } => SearchResultDto::BudgetExhausted {
            nodes_visited: counter(nodes_visited)?,
            work_used: counter(work_used)?,
        },
    })
}

/// Own one immutable compiled layout and return independent metadata and operation results.
/// Live operations retain raw-support work; exact queries reuse charged preparation.
#[wasm_bindgen]
pub struct PreparedPuzzle {
    computation: PreparedComputation,
    preparation_work: u32,
}

#[wasm_bindgen]
impl PreparedPuzzle {
    #[wasm_bindgen(constructor)]
    pub fn new(input: Ts<PrepareInputDto>) -> Result<PreparedPuzzle, JsError> {
        let input = input.to_rust()?;
        let rules = input.rules.try_into().map_err(js_error)?;
        let mut work = budget(input.max_work, None, DEFAULT_QUERY_WORK).map_err(js_error)?;
        let Bounded::Complete(computation) =
            sudoku_core::constraints::computation::prepare_computation(&rules, &mut work)
                .map_err(js_error)?
        else {
            return Err(JsError::new("Prepared layout work budget exhausted"));
        };

        Ok(Self {
            computation,
            preparation_work: counter(work.used()).map_err(js_error)?,
        })
    }

    /// Deterministic core work units spent compiling this layout, not elapsed time.
    #[wasm_bindgen(getter, js_name = preparationWork)]
    pub fn preparation_work(&self) -> u32 {
        self.preparation_work
    }

    #[wasm_bindgen(getter, js_name = liveExecution)]
    pub fn live_execution(&self) -> Result<Ts<crate::dto::operations::LiveExecutionDto>, JsError> {
        use crate::dto::operations::LiveExecutionDto;
        use sudoku_core::constraints::types::LiveComputationCost;
        Ok(match self.computation.live_computation_cost() {
            LiveComputationCost::Small => LiveExecutionDto::Immediate,
            LiveComputationCost::HeavyEnumeration => LiveExecutionDto::Worker,
        }
        .into_ts()?)
    }

    pub fn metadata(&self) -> Result<Ts<MetadataDto>, JsError> {
        Ok(metadata_to_dto(self.computation.rules())
            .map_err(js_error)?
            .into_ts()?)
    }

    pub fn is_complete(&self, board: Ts<BoardDto>) -> Result<bool, JsError> {
        let board: Board = board.to_rust()?.try_into().map_err(js_error)?;
        Ok(sudoku_core::board::is_complete(
            &board,
            self.computation.rules(),
        ))
    }

    pub fn review_entries(
        &self,
        input: Ts<crate::dto::operations::ReviewInputDto>,
    ) -> Result<Vec<u32>, JsError> {
        let input = input.to_rust()?;
        let board = input.board.try_into().map_err(js_error)?;
        let solution = input.solution.try_into().map_err(js_error)?;
        indices(sudoku_core::board::incorrect_entries(&board, &solution)).map_err(js_error)
    }

    pub fn base_candidates(&self, board: Ts<BoardDto>) -> Result<Vec<u16>, JsError> {
        let board: Board = board.to_rust()?.try_into().map_err(js_error)?;
        Ok(
            sudoku_core::board::base_candidates(&board, self.computation.rules())
                .iter()
                .map(|mask| mask.bits())
                .collect(),
        )
    }

    pub fn candidates(
        &self,
        input: Ts<BoardQueryDto>,
    ) -> Result<Ts<crate::dto::operations::CandidateWorkDto>, JsError> {
        let input = input.to_rust()?;
        let board: Board = input.board.try_into().map_err(js_error)?;
        let options = input.work.unwrap_or_default();
        let mut work =
            budget(options.max_work, options.initial_work, DEFAULT_QUERY_WORK).map_err(js_error)?;

        let result = match sudoku_core::constraints::candidates::evaluate_candidates(
            &board,
            self.computation.rules(),
            &mut work,
        ) {
            Bounded::Complete(candidates) => CandidateResultDto::Complete {
                candidates: candidates.iter().map(|mask| mask.bits()).collect(),
            },
            Bounded::BudgetExhausted => CandidateResultDto::BudgetExhausted,
        };

        Ok(crate::dto::operations::CandidateWorkDto(WorkResultDto {
            result,
            work_used: counter(work.used()).map_err(js_error)?,
        })
        .into_ts()?)
    }

    pub fn conflicts(
        &self,
        input: Ts<BoardQueryDto>,
    ) -> Result<Ts<crate::dto::operations::ConflictWorkDto>, JsError> {
        let input = input.to_rust()?;
        let board: Board = input.board.try_into().map_err(js_error)?;
        let options = input.work.unwrap_or_default();
        let mut work =
            budget(options.max_work, options.initial_work, DEFAULT_QUERY_WORK).map_err(js_error)?;

        let conflicts = sudoku_core::constraints::conflicts::evaluate_conflicts(
            &board,
            self.computation.rules(),
            &mut work,
        );
        let violations = conflicts
            .violations
            .iter()
            .map(violation_to_dto)
            .collect::<CoreResult<_>>()
            .map_err(js_error)?;
        let result = match conflicts.status {
            ConflictStatus::Complete => ConflictResultDto::Complete { violations },
            ConflictStatus::BudgetExhausted => ConflictResultDto::BudgetExhausted { violations },
        };

        Ok(crate::dto::operations::ConflictWorkDto(WorkResultDto {
            result,
            work_used: counter(work.used()).map_err(js_error)?,
        })
        .into_ts()?)
    }

    pub fn count_solutions(
        &self,
        input: Ts<PreparedCountInputDto>,
    ) -> Result<Ts<crate::dto::operations::SearchWorkDto>, JsError> {
        let input = input.to_rust()?;
        let board: Board = input.board.try_into().map_err(js_error)?;
        let options = input.work.unwrap_or_default();
        let mut work =
            budget(options.max_work, options.initial_work, DEFAULT_QUERY_WORK).map_err(js_error)?;
        let nodes = options
            .node_limit
            .map(u64::from)
            .unwrap_or(work.remaining());

        let result = sudoku_core::search::exact::count_solutions(
            &board,
            &self.computation,
            &mut work,
            nodes,
        );

        Ok(crate::dto::operations::SearchWorkDto(WorkResultDto {
            result: search_to_dto(result).map_err(js_error)?,
            work_used: counter(work.used()).map_err(js_error)?,
        })
        .into_ts()?)
    }

    pub fn edit(
        &self,
        input: Ts<EditInputDto>,
    ) -> Result<Ts<crate::dto::operations::EditWorkDto>, JsError> {
        let PreparedEditInput {
            givens,
            before,
            action,
            work: options,
        } = input.to_rust()?.try_into().map_err(js_error)?;

        let mut work =
            budget(options.max_work, options.initial_work, DEFAULT_QUERY_WORK).map_err(js_error)?;

        let result = match sudoku_core::editing::edit_board(
            &givens,
            &before,
            &action,
            self.computation.rules(),
            &mut work,
        )
        .map_err(js_error)?
        {
            EditOutcome::Complete(result) => EditResultDto::Complete {
                entries: (&result.layers.entries).into(),
                notes: result.layers.notes.iter().map(|mask| mask.bits()).collect(),
                changed: result.changed,
                board_complete: result.board_complete,
            },
            EditOutcome::BudgetExhausted => EditResultDto::BudgetExhausted,
        };

        Ok(crate::dto::operations::EditWorkDto(WorkResultDto {
            result,
            work_used: counter(work.used()).map_err(js_error)?,
        })
        .into_ts()?)
    }
}
