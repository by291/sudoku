use crate::control::{check, execution, timeout_error};
use crate::conversion::editing::PreparedEditInput;
use crate::conversion::rules::metadata_to_dto;
use crate::conversion::values::{counter, indices};
use crate::conversion::violations::violation_to_dto;
use crate::dto::operations::{
    BoardQueryDto, CandidateResultDto, ComputationResultDto, ConflictResultDto, EditInputDto,
    EditResultDto, PreparedCountInputDto, SearchResultDto,
};
use crate::dto::rules::{MetadataDto, PrepareInputDto};
use crate::dto::values::BoardDto;
use crate::js_error;
use sudoku_core::constraints::types::{ConflictResult, ConflictStatus, PreparedComputation};
use sudoku_core::editing::EditOutcome;
use sudoku_core::search::types::SearchResult;
use sudoku_core::types::{Board, Bounded, CoreResult};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

/// Convert a complete or incomplete exact count to an owned browser result.
pub fn search_to_dto(result: SearchResult) -> CoreResult<SearchResultDto> {
    Ok(match result {
        SearchResult::Complete {
            count,
            solution,
            nodes_visited,
        } => SearchResultDto::Complete {
            count,
            solution: solution.as_ref().map(Into::into),
            nodes_visited: counter(nodes_visited)?,
        },
        SearchResult::Incomplete { nodes_visited } => SearchResultDto::Incomplete {
            nodes_visited: counter(nodes_visited)?,
        },
    })
}

fn conflicts_to_dto(conflicts: ConflictResult) -> CoreResult<ConflictResultDto> {
    let violations = conflicts.violations.iter();
    let violations = violations
        .map(violation_to_dto)
        .collect::<CoreResult<_>>()?;

    Ok(match conflicts.status {
        ConflictStatus::Complete => ConflictResultDto::Complete { violations },
        ConflictStatus::Incomplete => ConflictResultDto::Incomplete { violations },
    })
}

/// Own one immutable compiled layout and return independent metadata and operation results.
/// Exact queries reuse immutable prepared constraints.
#[wasm_bindgen]
pub struct PreparedPuzzle {
    computation: PreparedComputation,
}

#[wasm_bindgen]
impl PreparedPuzzle {
    /// Prepare an owned handle for a rule layout, or throw if preparation times out.
    #[wasm_bindgen(constructor)]
    pub fn new(input: Ts<PrepareInputDto>) -> Result<PreparedPuzzle, JsError> {
        let input = input.to_rust()?;
        let rules = input.rules.try_into().map_err(js_error)?;

        let mut execution_control = execution();
        let result = sudoku_core::constraints::computation::prepare_computation(
            &rules,
            &mut execution_control,
        );

        check(&execution_control)?;

        let Bounded::Complete(computation) = result.map_err(js_error)? else {
            return Err(timeout_error());
        };

        Ok(Self { computation })
    }

    /// Report whether live arithmetic evaluation belongs on a worker.
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

    /// Copy the rule geometry and topology into owned JavaScript metadata.
    pub fn metadata(&self) -> Result<Ts<MetadataDto>, JsError> {
        Ok(metadata_to_dto(self.computation.rules())
            .map_err(js_error)?
            .into_ts()?)
    }

    /// Check whether a full board satisfies this layout.
    pub fn is_complete(&self, board: Ts<BoardDto>) -> Result<bool, JsError> {
        let board: Board = board.to_rust()?.try_into().map_err(js_error)?;
        Ok(sudoku_core::board::is_complete(
            &board,
            self.computation.rules(),
        ))
    }

    /// Return the indices of filled entries that differ from the supplied solution.
    pub fn review_entries(
        &self,
        input: Ts<crate::dto::operations::ReviewInputDto>,
    ) -> Result<Vec<u32>, JsError> {
        let input = input.to_rust()?;
        let board = input.board.try_into().map_err(js_error)?;
        let solution = input.solution.try_into().map_err(js_error)?;
        indices(sudoku_core::board::incorrect_entries(&board, &solution)).map_err(js_error)
    }

    /// Compute candidate masks using duplicate peers alone.
    pub fn base_candidates(&self, board: Ts<BoardDto>) -> Result<Vec<u16>, JsError> {
        let board: Board = board.to_rust()?.try_into().map_err(js_error)?;
        Ok(
            sudoku_core::board::base_candidates(&board, self.computation.rules())
                .iter()
                .map(|mask| mask.bits())
                .collect(),
        )
    }

    /// Propagate local arithmetic support into an owned candidate grid.
    pub fn candidates(
        &self,
        input: Ts<BoardQueryDto>,
    ) -> Result<Ts<crate::dto::operations::CandidateComputationDto>, JsError> {
        let input = input.to_rust()?;
        let board: Board = input.board.try_into().map_err(js_error)?;
        let mut execution_control = execution();

        // Keep live candidate evaluation on the raw traversal used by board edits. The static
        // catalogue is reserved here for exact search, whose propagation uses prepared support.
        let candidates = sudoku_core::constraints::candidates::evaluate_candidates(
            &board,
            self.computation.rules(),
            &mut execution_control,
        );

        check(&execution_control)?;

        let result = match candidates {
            Bounded::Complete(candidates) => CandidateResultDto::Complete {
                candidates: candidates.iter().map(|mask| mask.bits()).collect(),
            },
            Bounded::Cancelled => CandidateResultDto::Incomplete,
        };

        Ok(
            crate::dto::operations::CandidateComputationDto(ComputationResultDto { result })
                .into_ts()?,
        )
    }

    /// Return sound direct conflicts without enumerating partial arithmetic constraints.
    /// An incomplete preview must not establish that the board is valid.
    pub fn preview_conflicts(
        &self,
        board: Ts<BoardDto>,
    ) -> Result<Ts<crate::dto::operations::ConflictComputationDto>, JsError> {
        let board: Board = board.to_rust()?.try_into().map_err(js_error)?;

        let conflicts = sudoku_core::constraints::conflicts::preview_conflicts(
            &board,
            self.computation.rules(),
        );

        let result = conflicts_to_dto(conflicts).map_err(js_error)?;
        Ok(
            crate::dto::operations::ConflictComputationDto(ComputationResultDto { result })
                .into_ts()?,
        )
    }

    /// Evaluate direct and arithmetic conflicts, preserving explicit incompleteness.
    pub fn conflicts(
        &self,
        input: Ts<BoardQueryDto>,
    ) -> Result<Ts<crate::dto::operations::ConflictComputationDto>, JsError> {
        let input = input.to_rust()?;
        let board: Board = input.board.try_into().map_err(js_error)?;
        let mut execution_control = execution();

        // Use the live conflict traversal so preparation does not change cancellation order.
        let conflicts = sudoku_core::constraints::conflicts::evaluate_conflicts(
            &board,
            self.computation.rules(),
            &mut execution_control,
        );

        check(&execution_control)?;

        let result = conflicts_to_dto(conflicts).map_err(js_error)?;

        Ok(
            crate::dto::operations::ConflictComputationDto(ComputationResultDto { result })
                .into_ts()?,
        )
    }

    /// Count up to two solutions using this handle's prepared support.
    /// Node exhaustion returns an incomplete result. The host deadline throws a timeout.
    pub fn count_solutions(
        &self,
        input: Ts<PreparedCountInputDto>,
    ) -> Result<Ts<crate::dto::operations::SearchComputationDto>, JsError> {
        let input = input.to_rust()?;
        let board: Board = input.board.try_into().map_err(js_error)?;
        let options = input.options.unwrap_or_default();
        let node_limit = options.node_limit.map(u64::from).unwrap_or(u64::MAX);

        let mut execution_control = execution();
        let result = sudoku_core::search::exact::count_solutions(
            &board,
            &self.computation,
            &mut execution_control,
            node_limit,
        );

        check(&execution_control)?;

        Ok(
            crate::dto::operations::SearchComputationDto(ComputationResultDto {
                result: search_to_dto(result).map_err(js_error)?,
            })
            .into_ts()?,
        )
    }

    /// Apply an edit to owned input layers and return a new snapshot on completion.
    pub fn edit(
        &self,
        input: Ts<EditInputDto>,
    ) -> Result<Ts<crate::dto::operations::EditComputationDto>, JsError> {
        let PreparedEditInput {
            givens,
            before,
            action,
        } = input.to_rust()?.try_into().map_err(js_error)?;

        let mut execution_control = execution();
        let result = sudoku_core::editing::edit_board(
            &givens,
            &before,
            &action,
            self.computation.rules(),
            &mut execution_control,
        );

        check(&execution_control)?;

        let result = match result.map_err(js_error)? {
            EditOutcome::Complete(result) => EditResultDto::Complete {
                entries: (&result.layers.entries).into(),
                notes: result.layers.notes.iter().map(|mask| mask.bits()).collect(),
                changed: result.changed,
                board_complete: result.board_complete,
            },
            EditOutcome::Incomplete => EditResultDto::Incomplete,
        };

        Ok(
            crate::dto::operations::EditComputationDto(ComputationResultDto { result })
                .into_ts()?,
        )
    }
}
