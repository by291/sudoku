use crate::conversion::editing::PreparedEditInput;
use crate::conversion::violations::violation_to_dto;
use crate::conversion::{
    rules::metadata_to_dto,
    values::{counter, indices},
};
use crate::{
    control::{self, CancellationToken, NativeError},
    dto::{operations::*, rules::*, values::*},
};
use std::sync::Arc;
use sudoku_core::constraints::types::{ConflictStatus, PreparedComputation};
use sudoku_core::editing::EditOutcome;
use sudoku_core::search::types::SearchResult;
use sudoku_core::types::{Board, Bounded, CoreResult};

/// Project exact-search outcomes without treating an incomplete count as conclusive.
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

/// Own one immutable compiled layout and return independent metadata and operation results.
/// Exact queries reuse immutable prepared constraints.
#[derive(uniffi::Object)]
pub struct PreparedPuzzle {
    computation: PreparedComputation,
}

#[uniffi::export]
impl PreparedPuzzle {
    /// Classify whether full live queries require the analysis lane.
    pub fn live_execution(&self) -> Result<crate::dto::operations::LiveExecutionDto, NativeError> {
        use crate::dto::operations::LiveExecutionDto;
        use sudoku_core::constraints::types::LiveComputationCost;
        Ok(match self.computation.live_computation_cost() {
            LiveComputationCost::Small => LiveExecutionDto::Immediate,
            LiveComputationCost::HeavyEnumeration => LiveExecutionDto::Worker,
        })
    }

    /// Return owned layout metadata without exposing the prepared handle's state.
    pub fn metadata(&self) -> Result<MetadataDto, NativeError> {
        Ok(metadata_to_dto(self.computation.rules())?)
    }

    /// Check a terminal board against every unit and clue in the layout.
    pub fn is_complete(&self, board: BoardDto) -> Result<bool, NativeError> {
        let board: Board = board.try_into()?;

        Ok(sudoku_core::board::is_complete(
            &board,
            self.computation.rules(),
        ))
    }

    /// List nonempty entries that differ from the supplied solution.
    pub fn review_entries(
        &self,
        input: crate::dto::operations::ReviewInputDto,
    ) -> Result<Vec<u32>, NativeError> {
        let board = input.board.try_into()?;
        let solution = input.solution.try_into()?;

        indices(sudoku_core::board::incorrect_entries(&board, &solution)).map_err(NativeError::from)
    }

    /// Return candidate masks after only duplicate-peer exclusions.
    pub fn base_candidates(&self, board: BoardDto) -> Result<Vec<u16>, NativeError> {
        let board: Board = board.try_into()?;
        let candidates = sudoku_core::board::base_candidates(&board, self.computation.rules());

        Ok(candidates.iter().map(|mask| mask.bits()).collect())
    }

    /// Compute full candidate masks under the caller's cancellation signal.
    pub fn candidates(
        &self,
        input: BoardQueryDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::CandidateComputationDto, NativeError> {
        let board: Board = input.board.try_into()?;
        let mut execution_control = control::execution(token)?;

        let result = match sudoku_core::constraints::candidates::evaluate_candidates(
            &board,
            self.computation.rules(),
            &mut execution_control,
        ) {
            Bounded::Complete(candidates) => CandidateResultDto::Complete {
                candidates: candidates.iter().map(|mask| mask.bits()).collect(),
            },
            Bounded::Cancelled => CandidateResultDto::Incomplete,
        };
        control::check(&execution_control)?;

        Ok(crate::dto::operations::CandidateComputationDto { result })
    }

    /// Evaluate conflicts against immutable prepared support for this layout.
    pub fn conflicts(
        &self,
        input: BoardQueryDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::ConflictComputationDto, NativeError> {
        let board: Board = input.board.try_into()?;
        let mut execution_control = control::execution(token)?;

        // Reuse cage catalogues while keeping the board's domains local to this request.
        let conflicts = sudoku_core::constraints::conflicts::evaluate_prepared_conflicts(
            &board,
            &self.computation,
            &mut execution_control,
        );

        let violations = conflicts
            .violations
            .iter()
            .map(violation_to_dto)
            .collect::<CoreResult<_>>()?;

        let result = match conflicts.status {
            ConflictStatus::Complete => ConflictResultDto::Complete { violations },
            ConflictStatus::Incomplete => ConflictResultDto::Incomplete { violations },
        };
        control::check(&execution_control)?;

        Ok(crate::dto::operations::ConflictComputationDto { result })
    }

    /// Count solutions with a node bound while retaining incomplete search outcomes.
    pub fn count_solutions(
        &self,
        input: PreparedCountInputDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::SearchComputationDto, NativeError> {
        let board: Board = input.board.try_into()?;
        let options = input.options.unwrap_or_default();
        let mut execution_control = control::execution(token)?;
        let nodes = options.node_limit.map(u64::from).unwrap_or(u64::MAX);

        let result = sudoku_core::search::exact::count_solutions(
            &board,
            &self.computation,
            &mut execution_control,
            nodes,
        );
        control::check(&execution_control)?;

        Ok(crate::dto::operations::SearchComputationDto {
            result: search_to_dto(result)?,
        })
    }

    /// Apply an edit to an owned snapshot; cancellation publishes no partial layers.
    pub fn edit(
        &self,
        input: EditInputDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::EditComputationDto, NativeError> {
        let PreparedEditInput {
            givens,
            before,
            action,
        } = input.try_into()?;

        let mut execution_control = control::execution(token)?;

        let result = match sudoku_core::editing::edit_board(
            &givens,
            &before,
            &action,
            self.computation.rules(),
            &mut execution_control,
        )? {
            EditOutcome::Complete(result) => EditResultDto::Complete {
                entries: (&result.layers.entries).into(),
                notes: result.layers.notes.iter().map(|mask| mask.bits()).collect(),
                changed: result.changed,
                board_complete: result.board_complete,
            },
            EditOutcome::Incomplete => EditResultDto::Incomplete,
        };
        control::check(&execution_control)?;

        Ok(crate::dto::operations::EditComputationDto { result })
    }
}

impl PreparedPuzzle {
    /// Compile a complete immutable layout before handing ownership to the caller.
    pub fn new(
        input: PrepareInputDto,
        token: Arc<CancellationToken>,
    ) -> Result<PreparedPuzzle, NativeError> {
        let rules = input.rules.try_into()?;
        let mut execution_control = control::execution(token)?;

        let Bounded::Complete(computation) =
            sudoku_core::constraints::computation::prepare_computation(
                &rules,
                &mut execution_control,
            )?
        else {
            control::check(&execution_control)?;
            return Err(NativeError::Cancelled);
        };
        control::check(&execution_control)?;

        Ok(Self { computation })
    }
}
