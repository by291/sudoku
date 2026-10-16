use super::classic::construct_classic_terminal;
use super::terminal_construction::{TerminalConstructionResult, construct_unit_terminal};
use super::types::{GenerationInput, LayoutConstructionResult};
use super::variant::{SpatialSymmetry, transform_rules};
use super::variant_strategies::capabilities;
use super::variants::{arrow, diagonal, jigsaw, killer, thermo};
use crate::budget::WorkBudget;
use crate::random::SeededRandom;
use crate::rules::context::{prepare_rules, validate_rules};
use crate::rules::types::{PuzzleRules, SudokuVariant};
use crate::types::{Bounded, CoreResult};

pub fn construct_generation_layout(
    input: &GenerationInput,
    terminal_random: &mut SeededRandom,
    geometry_random: &mut SeededRandom,
    budget: &mut WorkBudget,
) -> CoreResult<LayoutConstructionResult> {
    if input.variant == SudokuVariant::Classic {
        return Ok(match construct_classic_terminal(terminal_random, budget)? {
            TerminalConstructionResult::Ready { solution } => LayoutConstructionResult::Ready {
                terminal: solution,
                rules: PuzzleRules::Classic,
            },
            TerminalConstructionResult::BudgetExhausted => {
                LayoutConstructionResult::BudgetExhausted
            }
            TerminalConstructionResult::AttemptExhausted => {
                LayoutConstructionResult::AttemptExhausted
            }
            TerminalConstructionResult::Failed { reason } => {
                LayoutConstructionResult::Failed { reason }
            }
        });
    }

    // Each v11 variant/tier has one geometry example. Its selection draw remains part of seed identity.
    geometry_random.next_f64();
    let symmetry = SpatialSymmetry::from_draw((geometry_random.next_f64() * 8.0) as usize);
    let permissions = capabilities(input.variant);
    if permissions.allows_digit_map {
        // Teaching-board digit relabeling does not affect these unit geometries, but consumes eight draws.
        let mut digit_order = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        geometry_random.shuffle(&mut digit_order);
    } else if permissions.allows_complement {
        // Arithmetic teaching clues are rebuilt for the new terminal; preserve their complement draw.
        geometry_random.next_f64();
    }

    let terminal_rules = match input.variant {
        SudokuVariant::Diagonal => PuzzleRules::Diagonal,
        SudokuVariant::Jigsaw => transform_rules(
            &PuzzleRules::Jigsaw {
                regions: jigsaw::REGION_PRESET
                    .iter()
                    .map(|region| region.to_vec())
                    .collect(),
            },
            symmetry,
            false,
        )?,
        SudokuVariant::Classic
        | SudokuVariant::Killer
        | SudokuVariant::Thermo
        | SudokuVariant::Arrow => PuzzleRules::Classic,
    };
    let Bounded::Complete(context) = prepare_rules(&terminal_rules, budget)? else {
        return Ok(LayoutConstructionResult::BudgetExhausted);
    };
    let terminal = match construct_unit_terminal(&context, terminal_random, budget, None) {
        TerminalConstructionResult::Ready { solution } => solution,
        TerminalConstructionResult::BudgetExhausted => {
            return Ok(LayoutConstructionResult::BudgetExhausted);
        }
        TerminalConstructionResult::AttemptExhausted => {
            return Ok(LayoutConstructionResult::AttemptExhausted);
        }
        TerminalConstructionResult::Failed { reason } => {
            return Ok(LayoutConstructionResult::Failed { reason });
        }
    };
    // Only region geometry is reused. Arithmetic and path clues must describe this fresh terminal.
    let rules = match &terminal_rules {
        PuzzleRules::Diagonal => Some(diagonal::create_geometry()),
        PuzzleRules::Jigsaw { regions } => {
            jigsaw::create_geometry(regions, &terminal, geometry_random, budget)
        }
        PuzzleRules::Classic => match input.variant {
            SudokuVariant::Killer => killer::create_geometry(&terminal, geometry_random, budget),
            SudokuVariant::Thermo => {
                thermo::create_geometry(&[], &terminal, geometry_random, budget)
            }
            SudokuVariant::Arrow => arrow::create_geometry(&[], &terminal, geometry_random, budget),
            SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw => None,
        },
        PuzzleRules::Killer { .. } | PuzzleRules::Thermo { .. } | PuzzleRules::Arrow { .. } => None,
    };
    let Some(rules) = rules else {
        return Ok(if budget.remaining() == 0 {
            LayoutConstructionResult::BudgetExhausted
        } else {
            LayoutConstructionResult::AttemptExhausted
        });
    };
    if rules.variant() != input.variant || validate_rules(&rules).is_err() {
        return Ok(LayoutConstructionResult::AttemptExhausted);
    }
    if let PuzzleRules::Jigsaw { regions } = &rules
        && !jigsaw::irregular_regions(regions)
    {
        return Ok(LayoutConstructionResult::AttemptExhausted);
    }
    Ok(LayoutConstructionResult::Ready { terminal, rules })
}
