//! Own bounded clue exploration only; boards, logical domains and geometry stay with layout
//! evaluators.
use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::rc::Rc;

use crate::control::ExecutionControl;
use crate::random::SeededRandom;
use crate::rating::types::TargetFeedback;
use crate::types::{BOARD_SIZE, Board, CoreResult, Difficulty, EngineError};

// These local exploration bounds fix selection and random-draw order.
pub const ACTIVE_LAYOUTS: usize = 2;
pub const MAX_CHECKPOINTS: usize = 8;
pub const MAX_SEEN_MASKS: usize = 4096;
pub const MAX_PROPOSALS: usize = 32;
pub const STAGNATION_LIMIT: usize = 8;
const INITIAL_SWEEP_PROPOSALS: usize = 24;
const STALLED_PROPOSAL_CYCLE: usize = 3;
const STALLED_EXCHANGE_SLOT: usize = STALLED_PROPOSAL_CYCLE - 1;

enum ClueEdit {
    Remove,
    Restore,
}

/// Bit N retains cell N. This 81-bit internal value never crosses a JS/WASM DTO boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct GivenMask(u128);

impl GivenMask {
    pub const FULL: Self = Self((1_u128 << BOARD_SIZE) - 1);

    /// Return the raw cell bits in board order.
    pub fn bits(self) -> u128 {
        self.0
    }

    /// Count the cells kept as givens.
    pub fn clue_count(self) -> u32 {
        self.0.count_ones()
    }

    /// Retain one bit for each nonempty cell in the board.
    pub fn from_board(board: &Board) -> Self {
        let cells = board.values();
        let mut mask = 0;
        for (cell, &digit) in cells.iter().enumerate() {
            if digit != 0 {
                mask |= 1_u128 << cell;
            }
        }

        Self(mask)
    }

    /// Copy the retained clues from a filled terminal into an owned board.
    pub fn materialize(self, terminal: &Board) -> CoreResult<Board> {
        if terminal.values().contains(&0) {
            return Err(EngineError::invalid("Candidate terminal must be complete"));
        }

        Ok(Board::from_computed_values(std::array::from_fn(|cell| {
            if self.contains(cell) {
                terminal.values()[cell]
            } else {
                0
            }
        })))
    }

    fn contains(self, cell: usize) -> bool {
        self.0 & (1_u128 << cell) != 0
    }

    fn edit(self, cell: usize, edit: ClueEdit) -> Self {
        let bit = 1_u128 << cell;
        match edit {
            ClueEdit::Remove => Self(self.0 & !bit),
            ClueEdit::Restore => Self(self.0 | bit),
        }
    }
}

impl TryFrom<u128> for GivenMask {
    type Error = EngineError;

    fn try_from(value: u128) -> CoreResult<Self> {
        if value <= Self::FULL.0 {
            Ok(Self(value))
        } else {
            Err(EngineError::invalid(
                "Given mask must contain only cells 0 through 80",
            ))
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum SolvedExact {
    Unchecked,
    Unique,
}

#[derive(Clone, Copy, Debug)]
pub enum StalledExact {
    Unknown,
    Unique,
}

#[derive(Clone, Copy, Debug)]
pub enum CheckpointStatus {
    Solved {
        difficulty: Difficulty,
        exact: SolvedExact,
    },
    Stalled {
        exact: StalledExact,
    },
}

impl CheckpointStatus {
    fn solved(self) -> bool {
        matches!(self, Self::Solved { .. })
    }
}

#[derive(Clone, Copy, Debug)]
pub struct CandidateCheckpoint {
    pub layout_id: u32,
    pub mask: GivenMask,
    pub feedback: TargetFeedback,
    pub status: CheckpointStatus,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProposalKind {
    Remove,
    Restore,
    Exchange,
}

#[derive(Clone, Debug)]
pub struct CandidateProposal {
    pub kind: ProposalKind,
    pub mask: GivenMask,
    pub intermediates: Vec<GivenMask>,
}

// The partition must always describe the same immutable checkpoint mask as the ordered cells.
struct PreparedEditOrder {
    cells: [usize; BOARD_SIZE],
    present: Vec<usize>,
    missing: Vec<usize>,
}

enum EditOrder {
    Fresh,
    Inherited([usize; BOARD_SIZE]),
    Prepared(PreparedEditOrder),
}

impl EditOrder {
    fn prepare(&mut self, mask: GivenMask, random: &mut SeededRandom) -> &PreparedEditOrder {
        let cells = match self {
            Self::Fresh => {
                let mut cells = std::array::from_fn(|cell| cell);
                random.shuffle(&mut cells);
                cells
            }
            Self::Inherited(cells) => *cells,
            Self::Prepared(prepared) => return prepared,
        };

        let (present, missing) = cells.iter().copied().partition(|&cell| mask.contains(cell));
        *self = Self::Prepared(PreparedEditOrder {
            cells,
            present,
            missing,
        });
        let Self::Prepared(prepared) = self else {
            unreachable!("Edit order was prepared above");
        };
        prepared
    }

    fn inherited(&self) -> Self {
        match self {
            Self::Fresh => Self::Fresh,
            Self::Inherited(cells) => Self::Inherited(*cells),
            Self::Prepared(prepared) => Self::Inherited(prepared.cells),
        }
    }
}

enum CheckpointClass {
    Solved,
    Stalled,
}

struct FrontierEntry {
    checkpoint: CandidateCheckpoint,
    cursor: usize,
    edit_order: EditOrder,
    sweep_cursor: usize,
}

// Pool, pending parent and continued sweep refer to the same small owner. Entries contain no
// back-references.
type Entry = Rc<RefCell<FrontierEntry>>;

struct PendingProposal {
    mask: GivenMask,
    parent: Entry,
    kind: ProposalKind,
}

pub struct CandidateFrontier {
    layout_id: u32,
    target: Difficulty,
    seen: BTreeSet<GivenMask>,
    entries: Vec<Entry>,
    sweep_entry: Option<Entry>,
    pending: Option<PendingProposal>,
    non_improving: usize,
    selections: usize,
}

fn compare(
    left: &CandidateCheckpoint,
    right: &CandidateCheckpoint,
    target: Difficulty,
) -> Ordering {
    match (left.status, right.status) {
        (
            CheckpointStatus::Solved {
                difficulty: first, ..
            },
            CheckpointStatus::Solved {
                difficulty: second, ..
            },
        ) => {
            let target_rank = target.rank();
            let left_distance = target_rank.abs_diff(first.rank());
            let right_distance = target_rank.abs_diff(second.rank());
            let by_distance = left_distance.cmp(&right_distance);
            let by_distance_and_remaining = by_distance.then_with(|| {
                left.feedback
                    .remaining_cells
                    .cmp(&right.feedback.remaining_cells)
            });

            // Completed traces measure workload; fewer clues win before total deductions.
            return by_distance_and_remaining
                .then_with(|| left.mask.clue_count().cmp(&right.mask.clue_count()))
                .then_with(|| right.feedback.deductions.cmp(&left.feedback.deductions));
        }
        (CheckpointStatus::Stalled { .. }, CheckpointStatus::Stalled { .. })
            if left.feedback.remaining_cells != right.feedback.remaining_cells =>
        {
            return left
                .feedback
                .remaining_cells
                .cmp(&right.feedback.remaining_cells);
        }
        _ => {}
    }
    right
        .feedback
        .deductions
        .cmp(&left.feedback.deductions)
        .then_with(|| left.mask.clue_count().cmp(&right.mask.clue_count()))
}

struct ClueExchange<'a> {
    cursor: usize,
    present: &'a [usize],
    missing: &'a [usize],
    status: CheckpointStatus,
}

fn exchange_clues(
    exchange: ClueExchange<'_>,
    mut edit: impl FnMut(usize, ClueEdit) -> Option<()>,
) -> Option<()> {
    let cursor = exchange.cursor;
    let missing = exchange.missing;
    let present = exchange.present;
    let restores = if cursor.is_multiple_of(2) && missing.len() > 1 {
        2_usize
    } else {
        1
    };
    for index in 0..restores {
        let cell = missing[(cursor + index) % missing.len()];
        edit(cell, ClueEdit::Restore)?;
    }

    let removals = if exchange.status.solved() {
        present.len().min(restores + 1)
    } else {
        1.max(restores - 1)
    };
    for index in 0..removals {
        let cell = present[(cursor + index) % present.len()];
        edit(cell, ClueEdit::Remove)?;
    }

    Some(())
}

impl FrontierEntry {
    fn neighboring_proposal(
        &mut self,
        random: &mut SeededRandom,
        control: &mut ExecutionControl,
    ) -> Option<CandidateProposal> {
        // Partition only after choosing the inherited/shuffled order; inheritance consumes no
        // draws.
        let prepared = self.edit_order.prepare(self.checkpoint.mask, random);
        let order = &prepared.cells;
        let present = &prepared.present;
        let missing = &prepared.missing;

        let mut intermediate_masks = vec![];
        let mut mask = self.checkpoint.mask;
        let mut edit = |cell, action| {
            if !control.check() {
                return None;
            }
            intermediate_masks.push(mask);
            mask = mask.edit(cell, action);
            Some(())
        };

        let mut sweep_cell = None;
        if self.checkpoint.status.solved()
            && (self.cursor < INITIAL_SWEEP_PROPOSALS || missing.is_empty())
        {
            while self.sweep_cursor < order.len() {
                let cell = order[self.sweep_cursor];
                self.sweep_cursor += 1;
                if self.checkpoint.mask.contains(cell) {
                    sweep_cell = Some(cell);
                    break;
                }
            }
        }

        let is_solved = self.checkpoint.status.solved();
        let is_restore_slot = self.cursor % STALLED_PROPOSAL_CYCLE != STALLED_EXCHANGE_SLOT;
        let can_restore =
            !missing.is_empty() && ((!is_solved && is_restore_slot) || present.is_empty());
        let kind = if let Some(cell) = sweep_cell {
            edit(cell, ClueEdit::Remove)?;
            ProposalKind::Remove
        } else if can_restore {
            let cell = missing[self.cursor % missing.len()];
            edit(cell, ClueEdit::Restore)?;
            ProposalKind::Restore
        } else if !missing.is_empty() && !present.is_empty() {
            let exchange = ClueExchange {
                cursor: self.cursor,
                present,
                missing,
                status: self.checkpoint.status,
            };
            exchange_clues(exchange, edit)?;
            ProposalKind::Exchange
        } else {
            return None;
        };

        // These are executed edit masks, not logical proofs; the evaluator decides which masks to
        // screen.
        Some(CandidateProposal {
            kind,
            mask,
            intermediates: intermediate_masks.into_iter().skip(1).collect(),
        })
    }
}

impl CandidateFrontier {
    /// Start an empty frontier scoped to one completed terminal and target tier.
    pub fn new(layout_id: u32, terminal: &Board, target: Difficulty) -> CoreResult<Self> {
        GivenMask::FULL.materialize(terminal)?;
        Ok(Self {
            layout_id,
            target,
            seen: BTreeSet::new(),
            entries: vec![],
            sweep_entry: None,
            pending: None,
            non_improving: 0,
            selections: 0,
        })
    }

    /// Retain a checkpoint for this layout and report whether it improved the search.
    ///
    /// A matching pending removal can pass its parent's remaining sweep to the child.
    /// Duplicate or closed checkpoints leave the frontier unchanged.
    pub fn retain(&mut self, checkpoint: CandidateCheckpoint) -> CoreResult<bool> {
        if checkpoint.layout_id != self.layout_id {
            return Err(EngineError::invalid(
                "Checkpoint belongs to a different layout",
            ));
        }

        // The proposal is marked seen when scheduled, before its evaluation can retain it.
        let cannot_retain = self.seen.len() >= MAX_SEEN_MASKS
            || (self.seen.contains(&checkpoint.mask)
                && !self
                    .pending
                    .as_ref()
                    .is_some_and(|pending| pending.mask == checkpoint.mask))
            || self
                .entries
                .iter()
                .any(|entry| entry.borrow().checkpoint.mask == checkpoint.mask);
        if cannot_retain {
            let improved = false;
            return Ok(improved);
        }

        // Removal children inherit the remaining sweep; restoring/exchanging clues starts another
        // order.
        let inherited = self.pending.take().and_then(|pending| {
            if pending.mask == checkpoint.mask && pending.kind == ProposalKind::Remove {
                Some(pending.parent)
            } else {
                None
            }
        });
        self.seen.insert(checkpoint.mask);

        // Novelty survives eviction; closed entries must not crowd out viable children.
        self.entries
            .retain(|entry| entry.borrow().cursor < MAX_PROPOSALS);

        let previous_best = self
            .entries
            .iter()
            .filter(|entry| entry.borrow().checkpoint.status.solved() == checkpoint.status.solved())
            .min_by(|left, right| {
                compare(
                    &left.borrow().checkpoint,
                    &right.borrow().checkpoint,
                    self.target,
                )
            });
        let improved = previous_best.is_none_or(|entry| {
            compare(&checkpoint, &entry.borrow().checkpoint, self.target) == Ordering::Less
        });

        let (edit_order, sweep_cursor) =
            inherited.as_ref().map_or((EditOrder::Fresh, 0), |parent| {
                let parent = parent.borrow();
                (parent.edit_order.inherited(), parent.sweep_cursor)
            });
        let retained = Rc::new(RefCell::new(FrontierEntry {
            checkpoint,
            cursor: 0,
            edit_order,
            sweep_cursor,
        }));
        self.entries.push(retained.clone());
        let continuing_sweep = inherited.is_some() && checkpoint.status.solved();
        if continuing_sweep {
            self.sweep_entry = Some(retained);
        }

        // Insertion temporarily owns nine entries before the retained pool returns to eight.
        let mut solved = [0; MAX_CHECKPOINTS + 1];
        let mut stalled = [0; MAX_CHECKPOINTS + 1];
        let solved_count = self.rank_indices(CheckpointClass::Solved, &mut solved);
        let stalled_count = self.rank_indices(CheckpointClass::Stalled, &mut stalled);

        // Each class can use any part of the other class's reservation left empty.

        let reserved = MAX_CHECKPOINTS / 2;
        let solved_capacity = reserved.max(MAX_CHECKPOINTS.saturating_sub(stalled_count));
        let stalled_capacity = reserved.max(MAX_CHECKPOINTS.saturating_sub(solved_count));
        let solved_count = solved_count.min(solved_capacity);
        let stalled_count = stalled_count.min(stalled_capacity);

        let mut retained: [Option<Entry>; MAX_CHECKPOINTS] = std::array::from_fn(|_| None);
        for (slot, &index) in retained.iter_mut().zip(&solved[..solved_count]) {
            *slot = Some(self.entries[index].clone());
        }

        // A temporary tier drop must not cut a solved removal lineage's ordinary sweep short.
        if let Some(sweep) = &self.sweep_entry
            && solved_count != 0
            && !retained[..solved_count]
                .iter()
                .flatten()
                .any(|entry| Rc::ptr_eq(entry, sweep))
        {
            retained[solved_count - 1] = Some(sweep.clone());
        }
        for (slot, &index) in retained[solved_count..]
            .iter_mut()
            .zip(&stalled[..stalled_count])
        {
            *slot = Some(self.entries[index].clone());
        }

        self.entries.clear();
        self.entries.extend(retained.into_iter().flatten());
        Ok(improved || continuing_sweep)
    }

    fn rank_indices(
        &self,
        class: CheckpointClass,
        ranked: &mut [usize; MAX_CHECKPOINTS + 1],
    ) -> usize {
        let is_solved = matches!(class, CheckpointClass::Solved);
        let mut count = 0;
        for (index, entry) in self.entries.iter().enumerate() {
            if entry.borrow().checkpoint.status.solved() != is_solved {
                continue;
            }
            let mut position = count;
            // Strict replacement keeps equal checkpoints in their original stable insertion order.
            while position != 0
                && compare(
                    &entry.borrow().checkpoint,
                    &self.entries[ranked[position - 1]].borrow().checkpoint,
                    self.target,
                ) == Ordering::Less
            {
                ranked[position] = ranked[position - 1];
                position -= 1;
            }
            ranked[position] = index;
            count += 1;
        }
        count
    }

    /// Schedule and remember the next novel proposal for evaluation.
    ///
    /// Returns `None` when the frontier is exhausted or cancellation stops selection.
    /// The caller uses the same frontier to retain the resulting checkpoint.
    pub fn next(
        &mut self,
        random: &mut SeededRandom,
        control: &mut ExecutionControl,
    ) -> Option<CandidateProposal> {
        while self.seen.len() < MAX_SEEN_MASKS {
            let eligible = self
                .entries
                .iter()
                .filter(|entry| entry.borrow().cursor < MAX_PROPOSALS);
            if eligible.clone().next().is_none() || !control.check() {
                return None;
            }

            let desired_solved = self.selections.is_multiple_of(2);
            self.selections += 1;
            let has_desired = eligible
                .clone()
                .any(|entry| entry.borrow().checkpoint.status.solved() == desired_solved);
            let ranked = eligible.clone().filter(|entry| {
                !has_desired || entry.borrow().checkpoint.status.solved() == desired_solved
            });
            let Some(best) = ranked.clone().min_by(|left, right| {
                compare(
                    &left.borrow().checkpoint,
                    &right.borrow().checkpoint,
                    self.target,
                )
            }) else {
                panic!("Nonempty candidate pool has no best checkpoint");
            };
            let tied = ranked.filter(|entry| {
                compare(
                    &entry.borrow().checkpoint,
                    &best.borrow().checkpoint,
                    self.target,
                ) == Ordering::Equal
            });

            if self.sweep_entry.as_ref().is_some_and(|sweep| {
                !eligible.clone().any(|entry| Rc::ptr_eq(entry, sweep))
                    || sweep.borrow().sweep_cursor >= BOARD_SIZE
            }) {
                self.sweep_entry = None;
            }

            // Continuing sweeps skip the tie-selection draw; every other choice consumes one draw.
            let selected = if let Some(sweep) = &self.sweep_entry {
                sweep.clone()
            } else {
                let index = (random.next_f64() * tied.clone().count() as f64) as usize;
                let Some(selected) = tied.clone().nth(index) else {
                    panic!("Nonempty tied checkpoint selection must be in range");
                };
                selected.clone()
            };

            let proposal = {
                let mut entry = selected.borrow_mut();
                let proposal = entry.neighboring_proposal(random, control);
                entry.cursor += 1;
                proposal
            };

            let Some(proposal) = proposal else {
                if control.is_cancelled() {
                    return None;
                }
                continue;
            };

            if self.seen.contains(&proposal.mask) {
                if control.is_cancelled() {
                    return None;
                }
                continue;
            }

            self.pending = Some(PendingProposal {
                mask: proposal.mask,
                parent: selected,
                kind: proposal.kind,
            });
            self.seen.insert(proposal.mask);
            return Some(proposal);
        }
        None
    }

    /// Update the stagnation counter after evaluating a scheduled proposal.
    pub fn record_evaluation(&mut self, improved: bool) {
        self.non_improving = if improved {
            0
        } else {
            self.non_improving.saturating_add(1)
        };
    }

    /// Count the distinct masks recorded for this layout, including evicted checkpoints.
    pub fn seen_count(&self) -> usize {
        self.seen.len()
    }

    /// Count the currently retained checkpoints.
    pub fn checkpoint_count(&self) -> usize {
        self.entries.len()
    }

    /// Check whether the consecutive non-improving evaluations have reached the local limit.
    pub fn stagnant(&self) -> bool {
        self.non_improving >= STAGNATION_LIMIT
    }

    /// Check whether this layout can schedule more proposals under its local bounds.
    pub fn exhausted(&self) -> bool {
        self.seen.len() >= MAX_SEEN_MASKS
            || self
                .entries
                .iter()
                .all(|entry| entry.borrow().cursor >= MAX_PROPOSALS)
    }
}
