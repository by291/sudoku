use super::support::{RawSupportQuery, SupportBoard, raw_for_constraint};
use super::types::{
    ConflictResult, ConflictStatus, PreparedComputation, PreparedConstraintSupport, RuleViolation,
    ViolationCode,
};
use crate::board::base_candidates;
use crate::control::ExecutionControl;
use crate::rules::evaluation::satisfies_constraint;
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{Board, Bounded};

fn add_duplicates(
    board: &Board,
    group: (&[usize], impl FnOnce() -> String),
    violations: &mut Vec<RuleViolation>,
) {
    let (cells, id) = group;

    let mut seen = 0_u16;
    let mut repeated = 0_u16;
    for &cell in cells {
        let bit = (1_u16 << board.values()[cell]) >> 1;
        repeated |= seen & bit;
        seen |= bit;
    }
    if repeated != 0 {
        let cells = cells.iter().copied();
        let duplicates = cells
            .filter(|&cell| repeated & ((1_u16 << board.values()[cell]) >> 1) != 0)
            .collect();
        violations.push(RuleViolation {
            constraint_id: id(),
            cells: duplicates,
            code: ViolationCode::Duplicate,
        });
    }
}

fn constraint_violation(constraint: &RuleConstraint) -> RuleViolation {
    let code = match constraint {
        RuleConstraint::Cage { index, sum, .. } => ViolationCode::CageTotal {
            index: *index,
            sum: *sum,
        },
        RuleConstraint::Thermo { index, .. } => ViolationCode::ThermoOrder { index: *index },
        RuleConstraint::Arrow { index, .. } => ViolationCode::ArrowTotal { index: *index },
    };

    RuleViolation {
        constraint_id: constraint.id().to_owned(),
        cells: constraint.cells().to_vec(),
        code,
    }
}

fn duplicate_violations(board: &Board, rules: &PreparedRules) -> Vec<RuleViolation> {
    let context = rules.context();
    let mut violations = vec![];

    for unit in &context.units {
        add_duplicates(
            board,
            (&unit.cells, || {
                format!("{}:{}", unit.kind.as_str(), unit.index)
            }),
            &mut violations,
        );
    }

    for constraint in &context.constraints {
        if let RuleConstraint::Cage { id, cells, .. } = constraint {
            add_duplicates(board, (cells, || id.clone()), &mut violations);
        }
    }

    violations
}

struct ConflictEvaluation<'layout> {
    board: &'layout Board,
    rules: &'layout PreparedRules,
    support: Option<&'layout PreparedConstraintSupport>,
}

fn evaluate(input: ConflictEvaluation<'_>, control: &mut ExecutionControl) -> ConflictResult {
    let ConflictEvaluation {
        board,
        rules,
        support,
    } = input;
    let context = rules.context();
    let mut violations = duplicate_violations(board, rules);

    // Complete clues can be checked directly. Partial clues need local feasibility.
    let candidates = base_candidates(board, rules);

    for (index, constraint) in context.constraints.iter().enumerate() {
        if constraint
            .cells()
            .iter()
            .all(|&cell| board.values()[cell] != 0)
        {
            if !satisfies_constraint(board, constraint) {
                violations.push(constraint_violation(constraint));
            }
            continue;
        }

        if !control.check() {
            return ConflictResult {
                status: ConflictStatus::Incomplete,
                violations,
            };
        }

        let support_board = SupportBoard {
            board,
            candidates: &candidates,
        };
        let result = match support {
            Some(prepared) => prepared.query_at(support_board, index, control),
            None => raw_for_constraint(
                RawSupportQuery {
                    board: support_board,
                    rules,
                    constraint,
                },
                control,
            ),
        };
        let Bounded::Complete(local) = result else {
            return ConflictResult {
                status: ConflictStatus::Incomplete,
                violations,
            };
        };

        if local.as_slice().contains(&0) {
            violations.push(constraint_violation(constraint));
        }
    }

    ConflictResult {
        status: ConflictStatus::Complete,
        violations,
    }
}

/// Reports direct violations without enumerating partial arithmetic support.
/// An incomplete result is a sound preview, not a claim that all constraints were checked.
pub fn preview_conflicts(board: &Board, rules: &PreparedRules) -> ConflictResult {
    let context = rules.context();
    let mut violations = duplicate_violations(board, rules);
    let mut status = ConflictStatus::Complete;

    for constraint in &context.constraints {
        if constraint
            .cells()
            .iter()
            .all(|&cell| board.values()[cell] != 0)
        {
            if !satisfies_constraint(board, constraint) {
                violations.push(constraint_violation(constraint));
            }
        } else {
            status = ConflictStatus::Incomplete;
        }
    }

    ConflictResult { status, violations }
}

/// Check direct violations and enumerate local arithmetic feasibility.
pub fn evaluate_conflicts(
    board: &Board,
    rules: &PreparedRules,
    control: &mut ExecutionControl,
) -> ConflictResult {
    evaluate(
        ConflictEvaluation {
            board,
            rules,
            support: None,
        },
        control,
    )
}

/// Check conflicts using support prepared for the same immutable rule layout.
pub fn evaluate_prepared_conflicts(
    board: &Board,
    computation: &PreparedComputation,
    control: &mut ExecutionControl,
) -> ConflictResult {
    evaluate(
        ConflictEvaluation {
            board,
            rules: &computation.rules,
            support: Some(&computation.support),
        },
        control,
    )
}
