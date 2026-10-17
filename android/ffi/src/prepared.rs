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
#[derive(uniffi::Object)]
pub struct PreparedPuzzle {
    computation: PreparedComputation,
    preparation_work: u32,
}

#[uniffi::export]
impl PreparedPuzzle {
    /// Deterministic core work units spent compiling this layout, not elapsed time.
    pub fn preparation_work(&self) -> u32 {
        self.preparation_work
    }

    pub fn live_execution(&self) -> Result<crate::dto::operations::LiveExecutionDto, NativeError> {
        use crate::dto::operations::LiveExecutionDto;
        use sudoku_core::constraints::types::LiveComputationCost;
        Ok(match self.computation.live_computation_cost() {
            LiveComputationCost::Small => LiveExecutionDto::Immediate,
            LiveComputationCost::HeavyEnumeration => LiveExecutionDto::Worker,
        })
    }

    pub fn metadata(&self) -> Result<MetadataDto, NativeError> {
        Ok(metadata_to_dto(self.computation.rules())?)
    }

    pub fn is_complete(&self, board: BoardDto) -> Result<bool, NativeError> {
        let board: Board = board.try_into()?;
        Ok(sudoku_core::board::is_complete(
            &board,
            self.computation.rules(),
        ))
    }

    pub fn review_entries(
        &self,
        input: crate::dto::operations::ReviewInputDto,
    ) -> Result<Vec<u32>, NativeError> {
        let board = input.board.try_into()?;
        let solution = input.solution.try_into()?;
        indices(sudoku_core::board::incorrect_entries(&board, &solution)).map_err(NativeError::from)
    }

    pub fn base_candidates(&self, board: BoardDto) -> Result<Vec<u16>, NativeError> {
        let board: Board = board.try_into()?;
        Ok(
            sudoku_core::board::base_candidates(&board, self.computation.rules())
                .iter()
                .map(|mask| mask.bits())
                .collect(),
        )
    }

    pub fn candidates(
        &self,
        input: BoardQueryDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::CandidateWorkDto, NativeError> {
        let board: Board = input.board.try_into()?;
        let options = input.work.unwrap_or_default();
        let mut work = control::budget(options.max_work, options.initial_work, token)?;

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
        control::check(&work)?;

        Ok(crate::dto::operations::CandidateWorkDto {
            result,
            work_used: counter(work.used())?,
        })
    }

    pub fn conflicts(
        &self,
        input: BoardQueryDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::ConflictWorkDto, NativeError> {
        let board: Board = input.board.try_into()?;
        let options = input.work.unwrap_or_default();
        let mut work = control::budget(options.max_work, options.initial_work, token)?;

        let conflicts = sudoku_core::constraints::conflicts::evaluate_conflicts(
            &board,
            self.computation.rules(),
            &mut work,
        );
        let violations = conflicts
            .violations
            .iter()
            .map(violation_to_dto)
            .collect::<CoreResult<_>>()?;
        let result = match conflicts.status {
            ConflictStatus::Complete => ConflictResultDto::Complete { violations },
            ConflictStatus::BudgetExhausted => ConflictResultDto::BudgetExhausted { violations },
        };
        control::check(&work)?;

        Ok(crate::dto::operations::ConflictWorkDto {
            result,
            work_used: counter(work.used())?,
        })
    }

    pub fn count_solutions(
        &self,
        input: PreparedCountInputDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::SearchWorkDto, NativeError> {
        let board: Board = input.board.try_into()?;
        let options = input.work.unwrap_or_default();
        let mut work = control::budget(options.max_work, options.initial_work, token)?;
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
        control::check(&work)?;

        Ok(crate::dto::operations::SearchWorkDto {
            result: search_to_dto(result)?,
            work_used: counter(work.used())?,
        })
    }

    pub fn edit(
        &self,
        input: EditInputDto,
        token: Arc<CancellationToken>,
    ) -> Result<crate::dto::operations::EditWorkDto, NativeError> {
        let PreparedEditInput {
            givens,
            before,
            action,
            work: options,
        } = input.try_into()?;

        let mut work = control::budget(options.max_work, options.initial_work, token)?;

        let result = match sudoku_core::editing::edit_board(
            &givens,
            &before,
            &action,
            self.computation.rules(),
            &mut work,
        )? {
            EditOutcome::Complete(result) => EditResultDto::Complete {
                entries: (&result.layers.entries).into(),
                notes: result.layers.notes.iter().map(|mask| mask.bits()).collect(),
                changed: result.changed,
                board_complete: result.board_complete,
            },
            EditOutcome::BudgetExhausted => EditResultDto::BudgetExhausted,
        };
        control::check(&work)?;

        Ok(crate::dto::operations::EditWorkDto {
            result,
            work_used: counter(work.used())?,
        })
    }
}

impl PreparedPuzzle {
    pub fn new(
        input: PrepareInputDto,
        token: Arc<CancellationToken>,
    ) -> Result<PreparedPuzzle, NativeError> {
        let rules = input.rules.try_into()?;
        let mut work = control::budget(input.max_work, None, token)?;
        let Bounded::Complete(computation) =
            sudoku_core::constraints::computation::prepare_computation(&rules, &mut work)?
        else {
            control::check(&work)?;
            return Err(NativeError::BudgetExhausted {
                work_used: work.used(),
            });
        };
        control::check(&work)?;

        Ok(Self {
            computation,
            preparation_work: counter(work.used())?,
        })
    }
}
