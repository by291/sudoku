//! Board predicates over validated rules; topology construction and caching stay in context.

use super::context::{classic_prepared_rules, validate_rules};
use super::definitions;
use super::types::{PuzzleRules, RuleConstraint};
use crate::types::{Board, CoreResult};

/// Scan validated rule groups without constructing memberships or pairwise topology.
/// Invalid geometry is rejected before givens, and only a completed board checks arithmetic totals.
pub(crate) fn directly_contradictory_rules(board: &Board, rules: &PuzzleRules) -> CoreResult<bool> {
    validate_rules(rules)?;

    if matches!(rules, PuzzleRules::Classic) {
        let prepared = classic_prepared_rules()?;
        return Ok(prepared
            .context()
            .units
            .iter()
            .any(|unit| has_duplicate(board, &unit.cells)));
    }

    let compiled = definitions::compile(rules);
    if compiled
        .duplicate_groups
        .iter()
        .any(|cells| has_duplicate(board, cells))
    {
        return Ok(true);
    }

    Ok(!board.values().contains(&0)
        && compiled
            .constraints
            .iter()
            .any(|constraint| !satisfies_constraint(board, constraint)))
}

fn has_duplicate(board: &Board, cells: &[usize]) -> bool {
    let mut seen = 0_u16;

    for &cell in cells {
        let digit = board.values()[cell];
        if digit == 0 {
            continue;
        }

        let bit = 1 << (digit - 1);
        if seen & bit != 0 {
            return true;
        }

        seen |= bit;
    }

    false
}

/// Called only with a validated constraint from an immutable prepared layout.
/// An unfilled clue is not satisfied; partial feasibility belongs to constraint support.
pub(crate) fn satisfies_constraint(board: &Board, constraint: &RuleConstraint) -> bool {
    let values = board.values();
    if constraint.cells().iter().any(|&cell| values[cell] == 0) {
        return false;
    }

    match constraint {
        RuleConstraint::Thermo { cells, .. } => {
            if !cells
                .windows(2)
                .all(|pair| values[pair[0]] < values[pair[1]])
            {
                return false;
            }
        }
        RuleConstraint::Arrow { cells, .. } => {
            let total: u16 = cells[1..].iter().map(|&cell| u16::from(values[cell])).sum();
            if total != u16::from(values[cells[0]]) {
                return false;
            }
        }
        RuleConstraint::Cage { cells, sum, .. } => {
            let mut seen = 0_u16;
            let mut total = 0_u16;

            for &cell in cells {
                let bit = 1 << (values[cell] - 1);
                if seen & bit != 0 {
                    return false;
                }

                seen |= bit;
                total += u16::from(values[cell]);
            }

            if total != *sum {
                return false;
            }
        }
    }

    true
}
