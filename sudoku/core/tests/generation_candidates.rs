use sudoku_core::budget::WorkBudget;
use sudoku_core::generation::candidates::{
    CandidateCheckpoint, CandidateFrontier, CheckpointStatus, GivenMask, SolvedExact, StalledExact,
};
use sudoku_core::random::{Seed, SeededRandom};
use sudoku_core::rating::types::TargetFeedback;
use sudoku_core::types::{Board, Difficulty};

fn terminal() -> Board {
    let values = std::array::from_fn::<_, 81, _>(|cell| {
        ((cell / 9 * 3 + cell / 27 + cell % 9) % 9 + 1) as u8
    });
    Board::try_from(values.as_slice()).unwrap()
}

fn checkpoint(bits: u128, solved: bool) -> CandidateCheckpoint {
    CandidateCheckpoint {
        layout_id: 0,
        mask: GivenMask::try_from(bits).unwrap(),
        feedback: TargetFeedback {
            remaining_cells: if solved { 0 } else { 10 },
            deductions: 81 - bits.count_ones() as usize,
        },
        status: if solved {
            CheckpointStatus::Solved {
                difficulty: Difficulty::Medium,
                exact: SolvedExact::Unchecked,
            }
        } else {
            CheckpointStatus::Stalled {
                exact: StalledExact::Unknown,
            }
        },
    }
}

#[test]
fn checkpoint_capacity_is_shared_without_forgetting_seen_masks() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    for bits in 1..=7 {
        owner.retain(checkpoint(bits, true)).unwrap();
    }
    owner.retain(checkpoint(8, false)).unwrap();
    assert_eq!(owner.checkpoint_count(), 8);
    owner.retain(checkpoint(9, false)).unwrap();

    assert!(!owner.retain(checkpoint(1, true)).unwrap());
    assert_eq!(owner.seen_count(), 9);
    assert_eq!(owner.checkpoint_count(), 8);
    for bits in 10..=4096 {
        owner.retain(checkpoint(bits, false)).unwrap();
    }
    assert_eq!(owner.seen_count(), 4096);
    assert!(owner.exhausted());
    assert!(
        owner
            .next(
                &mut SeededRandom::new(&Seed::from_bytes([0; 32])),
                &mut WorkBudget::new(1000)
            )
            .is_none()
    );
}

#[test]
fn owns_all_81_bits_and_never_publishes_uncharged_proposals() {
    let mask = GivenMask::try_from(1_u128 | (1_u128 << 80)).unwrap();
    let board = mask.materialize(&terminal()).unwrap();
    assert_eq!(GivenMask::from_board(&board), mask);
    assert_eq!(
        board.values().iter().filter(|&&digit| digit != 0).count(),
        2
    );
    assert!(GivenMask::try_from(1_u128 << 81).is_err());
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    owner
        .retain(checkpoint(GivenMask::FULL.bits(), true))
        .unwrap();
    let mut other = checkpoint(GivenMask::FULL.bits(), true);
    other.layout_id = 1;
    assert!(owner.retain(other).is_err());

    assert!(
        owner
            .next(
                &mut SeededRandom::new(&Seed::from_bytes([0; 32])),
                &mut WorkBudget::new(0)
            )
            .is_none()
    );
    assert_eq!(owner.seen_count(), 1);
    for _ in 0..8 {
        owner.record_evaluation(false);
    }
    assert!(owner.stagnant());
    owner.record_evaluation(true);
    assert!(!owner.stagnant());
}

#[test]
fn never_revisits_proposals_after_closing_the_edit_allowance() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    owner
        .retain(checkpoint(GivenMask::FULL.bits(), true))
        .unwrap();
    let mut random = SeededRandom::new(&Seed::from_bytes([0; 32]));
    let mut seen = std::collections::BTreeSet::from([GivenMask::FULL]);
    for _ in 0..32 {
        let proposal = owner.next(&mut random, &mut WorkBudget::new(1000)).unwrap();

        assert!(seen.insert(proposal.mask));
        assert_eq!(proposal.mask.clue_count(), 80);
        for mask in proposal
            .intermediates
            .iter()
            .chain(std::iter::once(&proposal.mask))
        {
            let board = mask.materialize(&terminal()).unwrap();
            assert!(
                board
                    .values()
                    .iter()
                    .zip(terminal().values())
                    .all(|(&digit, &known)| digit == 0 || digit == known)
            );
        }
    }
    assert!(
        owner
            .next(&mut random, &mut WorkBudget::new(1000))
            .is_none()
    );
    assert!(owner.exhausted());
}

#[test]
fn continues_removal_sweeps_through_a_temporary_tier_decrease() {
    let parent = (1_u128 << 30) - 1;
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    owner.retain(checkpoint(parent, true)).unwrap();
    let mut random = SeededRandom::new(&Seed::from_bytes([0; 32]));
    let rejected = owner.next(&mut random, &mut WorkBudget::new(1000)).unwrap();
    let accepted = owner.next(&mut random, &mut WorkBudget::new(1000)).unwrap();
    let rejected_cell = parent ^ rejected.mask.bits();
    let mut child = checkpoint(accepted.mask.bits(), true);
    child.status = CheckpointStatus::Solved {
        difficulty: Difficulty::Easy,
        exact: SolvedExact::Unchecked,
    };

    assert!(owner.retain(child).unwrap());
    let continued = owner.next(&mut random, &mut WorkBudget::new(1000)).unwrap();

    assert_eq!(
        continued.kind,
        sudoku_core::generation::candidates::ProposalKind::Remove
    );
    assert_eq!(continued.mask.clue_count(), 28);
    assert_eq!(
        continued.mask.bits() & accepted.mask.bits(),
        continued.mask.bits()
    );
    assert_eq!(continued.mask.bits() & rejected_cell, rejected_cell);
    assert!(owner.checkpoint_count() <= 8);
    // Two tie selections plus an 81-cell shuffle consume 82 words; continuation draws none.
    // Independently captured from Noble ChaCha8 with a zero key at word position 82.
    const ZERO_KEY_WORD_82: u32 = 0x9f151bc3;
    assert_eq!(random.next_u32(), ZERO_KEY_WORD_82);
}

#[test]
fn closes_old_checkpoint_slots_before_retaining_lower_tier_neighbours() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    for cell in 0..8 {
        owner
            .retain(checkpoint(GivenMask::FULL.bits() & !(1_u128 << cell), true))
            .unwrap();
    }
    let mut random = SeededRandom::new(&Seed::from_bytes([0; 32]));
    while owner
        .next(&mut random, &mut WorkBudget::new(10000))
        .is_some()
    {}
    let mut lower = checkpoint((1_u128 << 30) - 1, true);
    lower.status = CheckpointStatus::Solved {
        difficulty: Difficulty::Easy,
        exact: SolvedExact::Unchecked,
    };

    owner.retain(lower).unwrap();
    let proposal = owner.next(&mut random, &mut WorkBudget::new(10000));

    assert!(proposal.is_some());
    assert_eq!(owner.checkpoint_count(), 1);
}

#[test]
fn ranks_stalled_progress_before_total_deductions() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    let mut closer = checkpoint(GivenMask::FULL.bits() & !31, false);
    closer.feedback = TargetFeedback {
        remaining_cells: 3,
        deductions: 1,
    };
    let mut farther = checkpoint(GivenMask::FULL.bits() & !((1_u128 << 30) - 1), false);
    farther.feedback = TargetFeedback {
        remaining_cells: 10,
        deductions: 50,
    };
    owner.retain(closer).unwrap();
    owner.retain(farther).unwrap();

    let proposal = owner
        .next(
            &mut SeededRandom::new(&Seed::from_bytes([0; 32])),
            &mut WorkBudget::new(1000),
        )
        .unwrap();

    assert_eq!(
        proposal.kind,
        sudoku_core::generation::candidates::ProposalKind::Restore
    );
    assert_eq!(proposal.mask.clue_count(), 77);
}

#[test]
fn completed_lower_tier_progress_prefers_fewer_clues_before_longer_traces() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    let parent = (1_u128 << 30) - 1;
    let mut first = checkpoint(parent, true);
    first.feedback.deductions = 100;
    let mut child = checkpoint(parent & !1, true);
    child.feedback.deductions = 80;
    owner.retain(first).unwrap();

    assert!(owner.retain(child).unwrap());
    let proposal = owner
        .next(
            &mut SeededRandom::new(&Seed::from_bytes([0; 32])),
            &mut WorkBudget::new(1000),
        )
        .unwrap();

    assert_eq!(proposal.mask.clue_count(), 28);
}

#[test]
fn tier_distance_precedes_clue_count_and_both_checkpoint_kinds_get_capacity() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Expert).unwrap();
    owner.retain(checkpoint(1, true)).unwrap();
    let mut higher = checkpoint(GivenMask::FULL.bits(), true);
    higher.status = CheckpointStatus::Solved {
        difficulty: Difficulty::Hard,
        exact: SolvedExact::Unchecked,
    };

    assert!(owner.retain(higher).unwrap());
    let proposal = owner
        .next(
            &mut SeededRandom::new(&Seed::from_bytes([0; 32])),
            &mut WorkBudget::new(1000),
        )
        .unwrap();

    assert_eq!(
        proposal.kind,
        sudoku_core::generation::candidates::ProposalKind::Remove
    );
    assert_eq!(proposal.mask.clue_count(), 80);
    let mut mixed = CandidateFrontier::new(0, &terminal(), Difficulty::Expert).unwrap();
    for mask in 1..=16 {
        mixed.retain(checkpoint(mask, mask <= 8)).unwrap();
    }
    assert_eq!(mixed.checkpoint_count(), 8);
    assert_eq!(mixed.seen_count(), 16);
    let mut random = SeededRandom::new(&Seed::from_bytes([0; 32]));
    let mut removal = false;
    let mut restore = false;
    for _ in 0..256 {
        let Some(proposal) = mixed.next(&mut random, &mut WorkBudget::new(1000)) else {
            break;
        };
        removal |= proposal.kind == sudoku_core::generation::candidates::ProposalKind::Remove;
        restore |= proposal.kind == sudoku_core::generation::candidates::ProposalKind::Restore;
    }
    assert!(removal && restore);
}

#[test]
fn failed_edit_charges_do_not_publish_partial_proposals() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    owner
        .retain(checkpoint(GivenMask::FULL.bits(), true))
        .unwrap();
    let mut random = SeededRandom::new(&Seed::from_bytes([0; 32]));
    for _ in 0..2 {
        let mut budget = WorkBudget::new(1);

        assert!(owner.next(&mut random, &mut budget).is_none());

        assert_eq!(budget.used(), 1);
        assert_eq!(owner.seen_count(), 1);
    }
    let proposal = owner.next(&mut random, &mut WorkBudget::new(2)).unwrap();
    assert_eq!(proposal.mask.clue_count(), 80);
    assert_eq!(owner.seen_count(), 2);
}

#[test]
fn removal_child_inherits_the_sweep_when_its_parent_closes() {
    let mut owner = CandidateFrontier::new(0, &terminal(), Difficulty::Hard).unwrap();
    owner
        .retain(checkpoint(GivenMask::FULL.bits(), true))
        .unwrap();
    let mut random = SeededRandom::new(&Seed::from_bytes([0; 32]));
    let mut removed_cells = 0_u128;
    let mut last_proposal = None;
    for _ in 0..32 {
        let proposal = owner.next(&mut random, &mut WorkBudget::new(1000)).unwrap();
        removed_cells |= GivenMask::FULL.bits() ^ proposal.mask.bits();
        last_proposal = Some(proposal);
    }
    let child_mask = last_proposal.unwrap().mask;
    let mut unchanged_random = random.clone();

    // Retaining this child evicts its parent at the 32-proposal cap. The pending owner must survive.
    owner.retain(checkpoint(child_mask.bits(), true)).unwrap();
    let mut budget = WorkBudget::new(2);
    let continued = owner.next(&mut random, &mut budget).unwrap();

    assert_eq!(owner.checkpoint_count(), 1);
    assert_eq!(continued.mask.clue_count(), 79);
    assert_eq!(
        continued.mask.bits() & child_mask.bits(),
        continued.mask.bits()
    );
    let removed_from_child = child_mask.bits() ^ continued.mask.bits();
    assert_eq!(removed_from_child & removed_cells, 0);
    assert_eq!(budget.used(), 2);
    assert_eq!(random.next_u32(), unchanged_random.next_u32());
}
