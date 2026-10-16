use sudoku_core::budget::{WorkBudget, WorkStage};

#[test]
fn rejected_charges_do_not_change_used_or_stage_totals() {
    let mut budget = WorkBudget::new(2);

    assert!(!budget.consume(3));
    assert_eq!(budget.used(), 0);
    assert_eq!(budget.remaining(), 2);
    assert_eq!(budget.accounting().total(), 0);
    assert!(budget.consume(2));
    assert!(!budget.consume(1));
    assert_eq!(budget.used(), 2);
}

#[test]
fn nested_stage_attribution_is_exclusive() {
    let mut budget = WorkBudget::new(10);

    budget.with_stage(WorkStage::Exact, |budget| {
        assert!(budget.consume(2));
        budget.with_stage(WorkStage::Arithmetic, |budget| {
            assert!(budget.consume(3));
        });
        assert!(budget.consume(1));
    });
    assert!(budget.consume(1));

    assert_eq!(budget.used(), 7);
    assert_eq!(budget.accounting().used(WorkStage::Exact), 3);
    assert_eq!(budget.accounting().used(WorkStage::Arithmetic), 3);
    assert_eq!(budget.accounting().used(WorkStage::Preparation), 1);
    assert_eq!(budget.accounting().total(), budget.used());
}
