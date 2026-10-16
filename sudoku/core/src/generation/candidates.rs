//! Own bounded clue exploration only; boards, logical domains and geometry stay with layout evaluators.
use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::rc::Rc;

use crate::budget::{WorkBudget, WorkStage};
use crate::random::SeededRandom;
use crate::rating::types::TargetFeedback;
use crate::types::{BOARD_SIZE, Board, CoreResult, Difficulty, EngineError};

pub const ACTIVE_LAYOUTS: usize = 2;
pub const MAX_CHECKPOINTS: usize = 8;
pub const MAX_SEEN_MASKS: usize = 4096;
pub const MAX_PROPOSALS: usize = 32;
pub const STAGNATION_LIMIT: usize = 8;
const INITIAL_SWEEP_PROPOSALS: usize = 24;

/// Bit N retains cell N. This 81-bit internal value never crosses a JS/WASM DTO boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct GivenMask(u128);

impl GivenMask {
    pub const FULL: Self = Self((1_u128 << BOARD_SIZE) - 1);
    pub fn bits(self) -> u128 {
        self.0
    }
    pub fn clue_count(self) -> u32 {
        self.0.count_ones()
    }
    pub fn from_board(board: &Board) -> Self {
        Self(
            board
                .values()
                .iter()
                .enumerate()
                .fold(0, |mask, (cell, &digit)| {
                    if digit == 0 {
                        mask
                    } else {
                        mask | (1_u128 << cell)
                    }
                }),
        )
    }

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
    fn edit(self, cell: usize, restore: bool) -> Self {
        let bit = 1_u128 << cell;
        Self(if restore { self.0 | bit } else { self.0 & !bit })
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

struct CluePartition {
    present: Vec<usize>,
    missing: Vec<usize>,
}

struct FrontierEntry {
    checkpoint: CandidateCheckpoint,
    cursor: usize,
    order: Option<[usize; BOARD_SIZE]>,
    partition: Option<CluePartition>,
    sweep_cursor: usize,
}

// Pool, pending parent and continued sweep refer to the same small owner. Entries contain no back-references.
type Entry = Rc<RefCell<FrontierEntry>>;

pub struct CandidateFrontier {
    layout_id: u32,
    target: Difficulty,
    seen: BTreeSet<GivenMask>,
    entries: Vec<Entry>,
    sweep_entry: Option<Entry>,
    pending_mask: Option<GivenMask>,
    pending_parent: Option<Entry>,
    pending_kind: Option<ProposalKind>,
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
            return target
                .rank()
                .abs_diff(first.rank())
                .cmp(&target.rank().abs_diff(second.rank()))
                .then_with(|| {
                    left.feedback
                        .remaining_cells
                        .cmp(&right.feedback.remaining_cells)
                })
                // Completed traces measure workload; fewer clues win before total deductions.
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

impl FrontierEntry {
    fn prepare_order(&mut self, random: &mut SeededRandom) {
        let order = self.order.get_or_insert_with(|| {
            let mut cells = std::array::from_fn(|cell| cell);
            random.shuffle(&mut cells);
            cells
        });
        if self.partition.is_none() {
            self.partition = Some(CluePartition {
                present: order
                    .iter()
                    .copied()
                    .filter(|&cell| self.checkpoint.mask.contains(cell))
                    .collect(),
                missing: order
                    .iter()
                    .copied()
                    .filter(|&cell| !self.checkpoint.mask.contains(cell))
                    .collect(),
            });
        }
    }

    fn neighboring_proposal(&mut self, budget: &mut WorkBudget) -> Option<CandidateProposal> {
        let Some(order) = &self.order else {
            panic!("Candidate edit order must be prepared before proposing");
        };
        let Some(partition) = &self.partition else {
            panic!("Candidate clue partition must be prepared before proposing");
        };
        let present = &partition.present;
        let missing = &partition.missing;
        let mut intermediate_masks = vec![];
        let mut mask = self.checkpoint.mask;
        let mut edit = |cell, restore| {
            if !budget.consume(1) {
                return false;
            }
            intermediate_masks.push(mask);
            mask = mask.edit(cell, restore);
            true
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

        let kind;
        if let Some(cell) = sweep_cell {
            kind = ProposalKind::Remove;
            if !edit(cell, false) {
                return None;
            }
        } else if !missing.is_empty()
            && ((!self.checkpoint.status.solved() && self.cursor % 3 != 2) || present.is_empty())
        {
            kind = ProposalKind::Restore;
            if !edit(missing[self.cursor % missing.len()], true) {
                return None;
            }
        } else if !missing.is_empty() && !present.is_empty() {
            kind = ProposalKind::Exchange;
            let restores = if self.cursor.is_multiple_of(2) && missing.len() > 1 {
                2_usize
            } else {
                1
            };
            for index in 0..restores {
                if !edit(missing[(self.cursor + index) % missing.len()], true) {
                    return None;
                }
            }

            let removals = if self.checkpoint.status.solved() {
                present.len().min(restores + 1)
            } else {
                1.max(restores - 1)
            };
            for index in 0..removals {
                if !edit(present[(self.cursor + index) % present.len()], false) {
                    return None;
                }
            }
        } else {
            return None;
        }
        // These are executed edit masks, not logical proofs; the evaluator decides which masks to screen.
        Some(CandidateProposal {
            kind,
            mask,
            intermediates: intermediate_masks.into_iter().skip(1).collect(),
        })
    }
}

impl CandidateFrontier {
    pub fn new(layout_id: u32, terminal: &Board, target: Difficulty) -> CoreResult<Self> {
        GivenMask::FULL.materialize(terminal)?;
        Ok(Self {
            layout_id,
            target,
            seen: BTreeSet::new(),
            entries: vec![],
            sweep_entry: None,
            pending_mask: None,
            pending_parent: None,
            pending_kind: None,
            non_improving: 0,
            selections: 0,
        })
    }

    pub fn retain(&mut self, checkpoint: CandidateCheckpoint) -> CoreResult<bool> {
        if checkpoint.layout_id != self.layout_id {
            return Err(EngineError::invalid(
                "Checkpoint belongs to a different layout",
            ));
        }
        if self.seen.len() >= MAX_SEEN_MASKS
            || (self.seen.contains(&checkpoint.mask) && Some(checkpoint.mask) != self.pending_mask)
            || self
                .entries
                .iter()
                .any(|entry| entry.borrow().checkpoint.mask == checkpoint.mask)
        {
            return Ok(false);
        }
        // Removal children inherit the remaining sweep; restoring/exchanging clues starts another order.
        let inherited = if Some(checkpoint.mask) == self.pending_mask
            && self.pending_kind == Some(ProposalKind::Remove)
        {
            self.pending_parent.clone()
        } else {
            None
        };
        self.pending_mask = None;
        self.pending_parent = None;
        self.pending_kind = None;
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
        let (order, sweep_cursor) = inherited.as_ref().map_or((None, 0), |parent| {
            let parent = parent.borrow();
            (parent.order, parent.sweep_cursor)
        });
        let retained = Rc::new(RefCell::new(FrontierEntry {
            checkpoint,
            cursor: 0,
            order,
            partition: None,
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
        let solved_count = self.rank_indices(true, &mut solved);
        let stalled_count = self.rank_indices(false, &mut stalled);
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

    fn rank_indices(&self, solved: bool, ranked: &mut [usize; MAX_CHECKPOINTS + 1]) -> usize {
        let mut count = 0;
        for (index, entry) in self.entries.iter().enumerate() {
            if entry.borrow().checkpoint.status.solved() != solved {
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

    pub fn next(
        &mut self,
        random: &mut SeededRandom,
        budget: &mut WorkBudget,
    ) -> Option<CandidateProposal> {
        budget.with_stage(WorkStage::Proposals, |budget| {
            while self.seen.len() < MAX_SEEN_MASKS {
                let eligible = self
                    .entries
                    .iter()
                    .filter(|entry| entry.borrow().cursor < MAX_PROPOSALS);
                if eligible.clone().next().is_none() || !budget.consume(1) {
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
                    entry.prepare_order(random);
                    let proposal = entry.neighboring_proposal(budget);
                    entry.cursor += 1;
                    proposal
                };
                let Some(proposal) = proposal else {
                    if budget.remaining() == 0 {
                        return None;
                    }
                    continue;
                };
                if self.seen.contains(&proposal.mask) {
                    if budget.remaining() == 0 {
                        return None;
                    }
                    continue;
                }
                self.pending_mask = Some(proposal.mask);
                self.pending_parent = Some(selected);
                self.pending_kind = Some(proposal.kind);
                self.seen.insert(proposal.mask);
                return Some(proposal);
            }
            None
        })
    }

    pub fn record_evaluation(&mut self, improved: bool) {
        self.non_improving = if improved {
            0
        } else {
            self.non_improving.saturating_add(1)
        };
    }
    pub fn seen_count(&self) -> usize {
        self.seen.len()
    }
    pub fn checkpoint_count(&self) -> usize {
        self.entries.len()
    }
    pub fn stagnant(&self) -> bool {
        self.non_improving >= STAGNATION_LIMIT
    }
    pub fn exhausted(&self) -> bool {
        self.seen.len() >= MAX_SEEN_MASKS
            || self
                .entries
                .iter()
                .all(|entry| entry.borrow().cursor >= MAX_PROPOSALS)
    }
}
