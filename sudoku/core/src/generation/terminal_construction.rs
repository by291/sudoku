use crate::board::is_complete;
use crate::control::ExecutionControl;
use crate::random::SeededRandom;
use crate::rules::types::{PreparedRules, PuzzleRules};
use crate::types::{ALL_DIGITS_MASK, BOARD_SIZE, Board, UNIT_SIZE};

// The regional attempt cap is 6,561 visits; exhausting it retires the layout.
const REGIONAL_TERMINAL_NODE_LIMIT: u64 = (BOARD_SIZE * BOARD_SIZE) as u64;

pub enum TerminalConstructionResult {
    Ready { solution: Board },
    Incomplete,
    AttemptExhausted,
    Failed { reason: String },
}

struct Construction<'a> {
    rules: &'a PreparedRules,
    random: &'a mut SeededRandom,
    control: &'a mut ExecutionControl,
    board: [u8; BOARD_SIZE],
    unit_masks: Vec<u16>,
    regional: bool,
    node_limit: Option<u64>,
    nodes: u64,
    exhausted: bool,
    attempt_exhausted: bool,
}

impl Construction<'_> {
    fn assign(&mut self, cell: usize, digit: u8) {
        let previous = self.board[cell];
        self.board[cell] = digit;
        // Each candidate is distinct in every unit, so undo removes only this cell's own bit.
        for &index in &self.rules.context().cell_units[cell] {
            if previous != 0 {
                self.unit_masks[index] &= !(1 << (previous - 1));
            }
            if digit != 0 {
                self.unit_masks[index] |= 1 << (digit - 1);
            }
        }
    }

    fn candidates(&self) -> [u16; BOARD_SIZE] {
        std::array::from_fn(|cell| {
            if self.board[cell] != 0 {
                return 0;
            }

            let used = self.rules.context().cell_units[cell]
                .iter()
                .fold(0, |bits, &index| bits | self.unit_masks[index]);
            ALL_DIGITS_MASK & !used
        })
    }

    fn visit(&mut self) -> bool {
        if self.node_limit.is_some_and(|limit| self.nodes >= limit) {
            self.attempt_exhausted = true;
            return false;
        }
        if !self.control.check() {
            self.exhausted = true;
            return false;
        }
        self.nodes += 1;

        let candidates = self.candidates();
        let mut target = None;
        let mut smallest = UNIT_SIZE as u32 + 1;
        for (cell, &mask) in candidates.iter().enumerate() {
            if self.board[cell] != 0 {
                continue;
            }

            let choices = mask.count_ones();
            if choices == 0 {
                return false;
            }
            if choices < smallest {
                target = Some(cell);
                smallest = choices;
            }
        }

        let Some(target) = target else {
            return is_complete(&Board::from_computed_values(self.board), self.rules);
        };
        let mut assignments = [(0, 0); UNIT_SIZE];
        let mut assignment_count = 0;
        for digit in 1..=9 {
            if candidates[target] & (1 << (digit - 1)) != 0 {
                assignments[assignment_count] = (target, digit);
                assignment_count += 1;
            }
        }
        if self.regional {
            // Regional units can offer fewer positions for a missing digit than the cell MRV choice.
            for (index, unit) in self.rules.context().units.iter().enumerate() {
                for digit in 1..=9 {
                    let bit = 1 << (digit - 1);
                    if self.unit_masks[index] & bit != 0 {
                        continue;
                    }
                    let mut positions = [0; UNIT_SIZE];
                    let mut position_count = 0;
                    for &cell in &unit.cells {
                        if candidates[cell] & bit != 0 {
                            positions[position_count] = cell;
                            position_count += 1;
                            // Equal/larger branches cannot win; skipping their tail preserves tie/draw order.
                            if position_count >= assignment_count {
                                break;
                            }
                        }
                    }
                    if position_count == 0 {
                        return false;
                    }
                    if position_count < assignment_count {
                        assignment_count = position_count;
                        for (assignment, &cell) in
                            assignments.iter_mut().zip(&positions[..position_count])
                        {
                            *assignment = (cell, digit);
                        }
                    }
                }
            }
        }

        // Ascending MRV ties and one descending Fisher-Yates shuffle per branch are seed identity.
        self.random.shuffle(&mut assignments[..assignment_count]);
        for &(cell, digit) in &assignments[..assignment_count] {
            self.assign(cell, digit);
            if self.visit() {
                return true;
            }
            self.assign(cell, 0);
            if self.exhausted || self.attempt_exhausted {
                return false;
            }
        }
        false
    }
}

/// Own all mutable search state and publish only a complete terminal. Local limits permit a new layout.
pub fn construct_unit_terminal(
    rules: &PreparedRules,
    random: &mut SeededRandom,
    control: &mut ExecutionControl,
    node_limit: Option<u64>,
) -> TerminalConstructionResult {
    if !matches!(
        rules.rules(),
        PuzzleRules::Classic | PuzzleRules::Diagonal | PuzzleRules::Jigsaw { .. }
    ) || !rules.context().constraints.is_empty()
        || rules.context().units.len() < UNIT_SIZE * 3
        || rules
            .context()
            .units
            .iter()
            .any(|unit| unit.cells.len() != UNIT_SIZE)
    {
        return TerminalConstructionResult::Failed {
            reason: "Terminal construction requires complete Sudoku units".to_string(),
        };
    }

    let regional = matches!(rules.rules(), PuzzleRules::Jigsaw { .. });
    let node_limit = node_limit.or(if regional {
        Some(REGIONAL_TERMINAL_NODE_LIMIT)
    } else {
        None
    });
    let mut state = Construction {
        rules,
        random,
        control,
        board: [0; BOARD_SIZE],
        unit_masks: vec![0; rules.context().units.len()],
        regional,
        node_limit,
        nodes: 0,
        exhausted: false,
        attempt_exhausted: false,
    };
    if regional {
        // Fixing a full unit removes digit-label symmetry without excluding regional solution families.
        let mut digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        state.random.shuffle(&mut digits);
        for (&cell, digit) in rules.context().units[0].cells.iter().zip(digits) {
            if !state.control.check() {
                return TerminalConstructionResult::Incomplete;
            }
            state.assign(cell, digit);
        }
    }
    if state.visit() {
        return TerminalConstructionResult::Ready {
            solution: Board::from_computed_values(state.board),
        };
    }
    if state.attempt_exhausted {
        return TerminalConstructionResult::AttemptExhausted;
    }
    if state.exhausted {
        TerminalConstructionResult::Incomplete
    } else {
        TerminalConstructionResult::Failed {
            reason: "No complete terminal satisfies these units".to_string(),
        }
    }
}
