use super::support::raw_for_constraint;
use super::types::{
    ConflictResult, ConflictStatus, PreparedComputation, PreparedConstraintSupport, RuleViolation,
    ViolationCode,
};
use crate::board::base_candidates;
use crate::budget::WorkBudget;
use crate::rules::context::satisfies_constraint;
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{Board, Bounded};

fn add_duplicates(board: &Board, id: String, cells: &[usize], violations: &mut Vec<RuleViolation>) {
    let duplicates: Vec<usize> = cells
        .iter()
        .copied()
        .filter(|&cell| {
            board.values()[cell] != 0
                && cells
                    .iter()
                    .any(|&other| other != cell && board.values()[other] == board.values()[cell])
        })
        .collect();
    if !duplicates.is_empty() {
        violations.push(RuleViolation {
            constraint_id: id,
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

fn evaluate(
    board: &Board,
    rules: &PreparedRules,
    support: Option<&PreparedConstraintSupport>,
    budget: &mut WorkBudget,
) -> ConflictResult {
    let context = rules.context();
    let mut violations = vec![];
    for unit in &context.units {
        add_duplicates(
            board,
            format!("{}:{}", unit.kind.as_str(), unit.index),
            &unit.cells,
            &mut violations,
        );
    }
    for constraint in &context.constraints {
        if let RuleConstraint::Cage { id, cells, .. } = constraint {
            add_duplicates(board, id.clone(), cells, &mut violations);
        }
    }
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
        if !budget.consume(1) {
            return ConflictResult {
                status: ConflictStatus::BudgetExhausted,
                violations,
            };
        }
        let result = match support {
            Some(prepared) => prepared.query_at(board, &candidates, index, budget),
            None => raw_for_constraint(board, &candidates, rules, constraint, budget),
        };
        let Bounded::Complete(local) = result else {
            return ConflictResult {
                status: ConflictStatus::BudgetExhausted,
                violations,
            };
        };
        if local.supports.iter().any(|mask| mask.bits() == 0) {
            violations.push(constraint_violation(constraint));
        }
    }

    ConflictResult {
        status: ConflictStatus::Complete,
        violations,
    }
}

pub fn evaluate_conflicts(
    board: &Board,
    rules: &PreparedRules,
    budget: &mut WorkBudget,
) -> ConflictResult {
    evaluate(board, rules, None, budget)
}

pub fn evaluate_prepared_conflicts(
    board: &Board,
    computation: &PreparedComputation,
    budget: &mut WorkBudget,
) -> ConflictResult {
    evaluate(
        board,
        &computation.rules,
        Some(&computation.support),
        budget,
    )
}
