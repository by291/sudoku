# Portable Sudoku Core

A synchronous Rust library for Classic, Diagonal, Jigsaw, Killer, Thermo and Arrow Sudoku. Production dependencies are portable BLAKE3 and ChaCha8 implementations. The crate has no JavaScript, browser, database, clock, entropy provider or async runtime dependency. `sudoku-wasm` is a separate adapter; a future native Node/NAPI adapter can depend on this same crate without changing its computation.

```rust
use sudoku_core::generation::generate::generate_puzzle;
use sudoku_core::generation::types::{GenerationInput, GenerationLimits, GenerationOutcome};
use sudoku_core::random::Seed;
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::Difficulty;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Callers choose entropy or stable material. The library never reads a clock or OS RNG.
    let seed = Seed::derive(b"my application puzzle 1");
    let input = GenerationInput::new(SudokuVariant::Classic, Difficulty::Easy, seed)?;
    let result = generate_puzzle(&input, &GenerationLimits::default())?;
    match result.outcome {
        GenerationOutcome::Ready { puzzle, assessment } => {
            println!("{:?}: {:?}", assessment.difficulty, puzzle.content.givens);
        }
        GenerationOutcome::BudgetExhausted { cause } => {
            eprintln!("No qualifying puzzle within the allowance: {cause:?}");
        }
        GenerationOutcome::Failed { reason } => eprintln!("Generation failed: {reason}"),
    }
    Ok(())
}
```

`Seed::try_from(&bytes[..])` accepts exactly 32 arbitrary bytes. `Seed::derive(material)` uses the versioned BLAKE3 root context. Generation uses explicit version-owned binary framing and ChaCha8; current versions are `sudoku-v11` and `sudoku-variants-v11`. There is no old string-seeded generator. Hex encoding and historical text preservation belong to an adapter/application boundary.

Use checked `Board`, `Digit`, `CellIndex` and `CandidateMask` values. `Puzzle` contains mathematical content only; generated identity is separate. Rules/topology and prepared support are immutable owned layout data. A caller may reuse that preparation across boards, but every search/logical workspace owns fresh domains, queues, trails, premises and domain-dependent caches. Returned boards/evidence are owned snapshots.

`CandidateMask` supports checked digit membership, counting, single-digit lookup and ascending iteration without allocating a digit vector. `PreparedRules::metadata_ref()` borrows immutable layout data; `metadata()` still returns an independent owned snapshot. Exact propagation reuses queue capacity within one probe and clears pending entries and membership before exploring another branch.

Logical workspaces expose read-only board/candidate borrows through `board()` and `candidates()`. Use `LogicalWorkspace::from_authored_candidates` for teaching fixtures or externally established candidate eliminations; it checks the state representation, while the caller establishes the soundness of prior eliminations. Public `apply_step` validates the complete action before mutation and returns an error for malformed or inapplicable actions. This is not a proof checker: use a detector result or independently validate the evidence against the same state before applying it.

`hint` owns hint result contracts and complete chain replay. `logic` owns individual step shape, clue binding, evidence proofs and teaching validation. Independent proof checks must not call a detector and treat its answer as the proof. Prepared-layout identity checks compare the shared immutable instance, not structural equality between independently compiled rules.

`WorkBudget` charges before work, retains abandoned work and reports stage consumption. Expected incompleteness uses explicit bounded outcomes; exhaustion never means zero solutions, contradiction, uniqueness or success. Default generation limits are 40 layouts, 4,000,000 shared work units and 500 logical steps. Live arithmetic can consume its full allowance even on an 81-cell board: a UI must honor its measured execution policy rather than assuming every synchronous operation fits one frame.

The public owners are `rules/`, `constraints/`, `search/`, `editing`, `logic/`, `rating/`, `generation/`, `hint` and `puzzle`. See the workspace [architecture](../../docs/architecture.md), [extension checklist](../../docs/variant-extension.md) and [migration contracts](../../tests/migration/README.md).

From the workspace root:

```sh
cargo test --workspace --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo clippy -p sudoku-core -p sudoku-wasm --target wasm32-unknown-unknown --all-targets --locked -- -D warnings
cargo tree -p sudoku-core -e normal
```
