use serde::{Deserialize, Serialize};

mod search;
mod support;
#[cfg(target_arch = "wasm32")]
mod wasm;

pub const BOARD_SIZE: usize = 81;
const UNIT_SIZE: usize = 9;
const MAX_DIGIT: u8 = 9;
// Bit zero represents digit 1; only the low nine bits belong to a cell domain.
const ALL_DIGITS_MASK: u16 = (1 << UNIT_SIZE) - 1;
const MAX_CAGE_SUM: u16 = 45;
const MAX_CATALOGUE_CELLS: usize = 4;
const MAX_TUPLES_PER_CAGE: usize = 512;
const MAX_TUPLES_PER_LAYOUT: usize = 8192;

pub type Board = [u8; BOARD_SIZE];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Topology {
    pub units: Vec<Vec<usize>>,
    pub duplicate_peers: Vec<Vec<usize>>,
    pub constraints: Vec<Constraint>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConstraintKind {
    Cage,
    Thermo,
    Arrow,
}

#[derive(Deserialize)]
pub struct Constraint {
    pub kind: ConstraintKind,
    pub cells: Vec<usize>,
    pub sum: u16,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum SearchResult {
    Complete {
        count: u8,
        solution: Option<Vec<u8>>,
        nodes_visited: u64,
        work_used: u64,
    },
    BudgetExhausted {
        nodes_visited: u64,
        work_used: u64,
    },
}

pub struct PreparedContext {
    topology: Topology,
    cell_units: Vec<Vec<usize>>,
    cell_constraints: Vec<Vec<usize>>,
    catalogues: Vec<Option<Vec<Vec<u16>>>>,
}

impl PreparedContext {
    /// Borrows no caller data. Topology/catalogues are prepared outside measured probes.
    pub fn new(topology: Topology) -> Result<Self, String> {
        let valid_cells = |cells: &[usize]| {
            cells.iter().all(|&cell| cell < BOARD_SIZE)
                && cells
                    .iter()
                    .enumerate()
                    .all(|(i, cell)| !cells[..i].contains(cell))
        };
        if topology.units.is_empty()
            || topology
                .units
                .iter()
                .any(|unit| unit.len() != UNIT_SIZE || !valid_cells(unit))
            || topology.duplicate_peers.len() != BOARD_SIZE
            || topology
                .duplicate_peers
                .iter()
                .enumerate()
                .any(|(cell, peers)| !valid_cells(peers) || peers.contains(&cell))
            || topology.constraints.iter().any(|constraint| {
                !valid_cells(&constraint.cells)
                    || match constraint.kind {
                        ConstraintKind::Cage => {
                            !(1..=UNIT_SIZE).contains(&constraint.cells.len())
                                || !(1..=MAX_CAGE_SUM).contains(&constraint.sum)
                        }
                        ConstraintKind::Thermo => {
                            !(2..=UNIT_SIZE).contains(&constraint.cells.len())
                        }
                        ConstraintKind::Arrow => {
                            !(2..=UNIT_SIZE + 1).contains(&constraint.cells.len())
                        }
                    }
            })
        {
            return Err("Invalid compiled topology".into());
        }

        let mut cell_units = vec![Vec::new(); BOARD_SIZE];
        let mut cell_constraints = vec![Vec::new(); BOARD_SIZE];
        for (index, unit) in topology.units.iter().enumerate() {
            for &cell in unit {
                cell_units[cell].push(index);
            }
        }
        for (index, constraint) in topology.constraints.iter().enumerate() {
            for &cell in &constraint.cells {
                cell_constraints[cell].push(index);
            }
        }

        // Preserve the production 512-per-cage / 8192-per-layout retention policy.
        let mut retained = 0;
        let catalogues = topology
            .constraints
            .iter()
            .map(|constraint| {
                let catalogue = if matches!(constraint.kind, ConstraintKind::Cage)
                    && constraint.cells.len() <= MAX_CATALOGUE_CELLS
                {
                    support::compile_catalogue(
                        constraint,
                        MAX_TUPLES_PER_CAGE.min(MAX_TUPLES_PER_LAYOUT - retained),
                    )
                } else {
                    None
                };
                if let Some(tuples) = &catalogue {
                    retained += tuples.len();
                }
                catalogue
            })
            .collect();

        Ok(Self {
            topology,
            cell_units,
            cell_constraints,
            catalogues,
        })
    }

    /// Counts up to two completions. Exhaustion proves neither uniqueness nor contradiction.
    pub fn count(
        &self,
        board: &[u8],
        nodes: u64,
        work: u64,
        initial: u64,
    ) -> Result<SearchResult, String> {
        let board = validate_board(board)?;
        if initial > work {
            return Err("Initial work exceeds limit".into());
        }
        let contradictory =
            self.topology
                .duplicate_peers
                .iter()
                .enumerate()
                .any(|(cell, peers)| {
                    board[cell] != 0 && peers.iter().any(|&peer| board[peer] == board[cell])
                })
                || (board.iter().all(|&digit| digit != 0) && !self.is_complete(board));
        if contradictory {
            return Ok(SearchResult::Complete {
                count: 0,
                solution: None,
                nodes_visited: 0,
                work_used: 0,
            });
        }

        Ok(search::count(
            board,
            self,
            nodes,
            Budget {
                used: initial,
                limit: work,
            },
        ))
    }

    fn is_complete(&self, board: &Board) -> bool {
        board.iter().all(|&digit| (1..=MAX_DIGIT).contains(&digit))
            && self.topology.units.iter().all(|unit| {
                unit.iter()
                    .fold(0, |mask, &cell| mask | mask_of(board[cell]))
                    == ALL_DIGITS_MASK
            })
            && self.topology.constraints.iter().all(|constraint| {
                let cells = &constraint.cells;
                match constraint.kind {
                    ConstraintKind::Thermo => {
                        cells.windows(2).all(|pair| board[pair[0]] < board[pair[1]])
                    }
                    ConstraintKind::Arrow => {
                        cells[1..]
                            .iter()
                            .map(|&cell| u16::from(board[cell]))
                            .sum::<u16>()
                            == u16::from(board[cells[0]])
                    }
                    ConstraintKind::Cage => {
                        let mut seen = 0;
                        cells.iter().all(|&cell| {
                            let bit = mask_of(board[cell]);
                            let unique = seen & bit == 0;
                            seen |= bit;
                            unique
                        }) && cells
                            .iter()
                            .map(|&cell| u16::from(board[cell]))
                            .sum::<u16>()
                            == constraint.sum
                    }
                }
            })
    }
}

fn validate_board(board: &[u8]) -> Result<&Board, String> {
    if board.iter().any(|&digit| digit > MAX_DIGIT) {
        return Err("Board digits must be 0 through 9".into());
    }
    board
        .try_into()
        .map_err(|_| "Board must contain 81 cells".into())
}

fn mask_of(digit: u8) -> u16 {
    1 << (digit - 1)
}

/// Filled cells have zero presentation candidates, matching calculateBaseCandidates.
pub fn calculate_candidates(board: &Board, context: &PreparedContext) -> [u16; BOARD_SIZE] {
    let mut candidates = [0; BOARD_SIZE];
    for cell in 0..BOARD_SIZE {
        if board[cell] != 0 {
            continue;
        }

        let mut mask = ALL_DIGITS_MASK;
        for &peer in &context.topology.duplicate_peers[cell] {
            if board[peer] != 0 {
                mask &= !mask_of(board[peer]);
            }
        }
        candidates[cell] = mask;
    }
    candidates
}

struct Budget {
    limit: u64,
    used: u64,
}

impl Budget {
    fn charge(&mut self) -> bool {
        if self.used >= self.limit {
            return false;
        }
        self.used += 1;
        true
    }
}
