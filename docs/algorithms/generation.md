# Puzzle generation

Generation searches for a puzzle with the requested variant and exact difficulty under a finite allowance. The current identities are `sudoku-v11` and `sudoku-variants-v11`. A request supplies a 32-byte seed; the portable core never reads a clock or OS randomness.

## Construct a complete terminal

A terminal is a full board satisfying the layout's unit rules. Classic uses randomized MRV construction. Diagonal adds its diagonal units. Jigsaw starts from a transformed canonical region geometry and constructs against those regions. Killer, Thermo and Arrow first construct a Classic terminal, then derive compatible clues from it.

The constructor maintains a used-digit mask per full unit, chooses the cell with the fewest available digits and shuffles its candidate order before recursive assignment. Assignments update the unit masks and are undone on backtracking. This is separate from the deterministic exact counter.

Jigsaw additionally considers the dual choice: a missing digit's possible positions in a unit. If that offers fewer branches than the current cell choice, it branches on positions instead. It prefills one full unit with shuffled digits, exploiting digit-label symmetry, and caps each regional construction attempt at 6,561 node visits. Prefill is sound for these unit-only rules; arbitrary relabeling would not preserve an arithmetic clue's numerical meaning.

This creates fresh terminals, but does not sample all completed grids uniformly. MRV traversal and geometry restrictions influence the distribution. The generator does not claim a minimum-clue puzzle or global minimality.

Sources: [`terminal_construction.rs`](../../sudoku/core/src/generation/terminal_construction.rs), [`classic.rs`](../../sudoku/core/src/generation/classic.rs), [`layouts.rs`](../../sudoku/core/src/generation/layouts.rs).

## Derive variant geometry

| Variant  | Current geometry construction                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Classic  | Fixed row, column and box topology                                                                                                                     |
| Diagonal | Both main diagonals                                                                                                                                    |
| Jigsaw   | Transform the canonical region preset, then attempt 20 swaps of equal-valued terminal cells between regions; retain only validated, irregular geometry |
| Killer   | Partition cells by orthogonal growth, without repeated terminal digits in a cage; derive each sum from the terminal                                    |
| Thermo   | Make eight growth attempts, following adjacent increasing terminal digits; retain distinct paths of length 2–5                                         |
| Arrow    | Make up to 12 attempts and retain at most four arrows; search adjacent shafts of length 2–5 whose sum equals a circle digit of at least 3              |

Thermo and Arrow adjacency permits diagonal steps. Their clues are rebuilt from each new terminal. Jigsaw reuses a region preset, not an authored solved board.

Killer growth chooses a random target size from 2–4, starts in a cell with few unused neighbors and prioritizes neighbors about to become isolated. Growth can stop early, so a singleton cage remains possible. This anti-isolation approach is related to [KDE's cage generator](https://raw.githubusercontent.com/KDE/ksudoku/master/src/generator/cagegenerator.cpp); this repository does not use KDE's DLX runtime or its full generation policy. Cage size alone does not determine the delivered difficulty.

Rule-preserving transformations are explicit. Spatial symmetries transform cell geometry. A digit complement maps a Killer sum to `10 * cage_size - sum` and reverses a Thermo path. It does not generally preserve Arrow sums. Generation retains version-owned random draws even when a historical teaching-board transformation no longer affects the fresh terminal.

Sources: [variant geometry modules](../../sudoku/core/src/generation/variants), [`variant.rs`](../../sudoku/core/src/generation/variant.rs), [`variant_strategies.rs`](../../sudoku/core/src/generation/variant_strategies.rs).

## Explore clue masks with feedback

A layout owns its terminal, rules, immutable prepared computation and a bounded frontier of candidate clue masks. A mask selects which terminal digits remain as givens. Every candidate therefore preserves the known terminal, while exact counting determines whether other solutions also remain.

The explorer starts with all givens and searches nearby masks through three edits:

- **Remove:** remove a clue, continuing an inherited sweep when appropriate.
- **Restore:** restore a terminal digit, often to help a logically stalled candidate.
- **Exchange:** restore some clues and remove others to leave a local dead end.

Each evaluated mask has fresh logical state. The frontier retains solved and stalled checkpoints separately so that one class does not immediately crowd out the other. Solved checkpoints are ranked by distance from the requested tier, remaining cells, fewer givens and more deductions. Stalled checkpoints prioritize fewer remaining cells, then deductions and clue count. These are exploration heuristics, not delivery criteria.

Current bounds are two active layouts, eight retained checkpoints per frontier, 4,096 seen masks per frontier and 32 proposal selections per checkpoint. Eight non-improving evaluations mark stagnation. The scheduler favors the layout with less accumulated work, and can create another layout after stagnation. Reaching the layout-attempt cap prevents new layouts while allowing existing frontiers to continue.

Removal descendants can inherit the parent's remaining sweep without consuming a new shuffle. Seen masks remain seen after checkpoint eviction, and a pending proposal retains its parent while evaluation is in progress. These details affect deterministic exploration and are part of the version contract.

Most requests check exact uniqueness before logical screening. Killer Hard screens logic first; a retained checkpoint can consequently have unknown uniqueness. Every accepted candidate still undergoes the exact delivery check. A stalled checkpoint is useful search feedback, not evidence of a higher grade or uniqueness.

Sources: [`candidates.rs`](../../sudoku/core/src/generation/candidates.rs), [`search.rs`](../../sudoku/core/src/generation/search.rs). [Tdoku's generator](https://github.com/t-dillon/tdoku#generating-puzzles) is useful background for scored candidate pools and local clue edits; this implementation uses its own bounded frontier and logical-policy feedback, not Tdoku's loss function or solver.

## Accept only a complete match

Delivery requires all of the following:

1. The rules and identity match the request; all givens agree with the valid known terminal.
2. A completed assessment has exactly the requested variant and difficulty.
3. Classic givens satisfy the tier cap: at most 36/32/30/28 for Easy/Medium/Hard/Expert. These are acceptance caps, not the grading formula.
4. Exact counting completes with one solution equal to the terminal.
5. Variant rules pass the necessity check described below.

For non-Classic variants, the engine compares against Classic rules. For Diagonal, Killer, Thermo and Arrow, removing the extra rules must leave more than one solution. Jigsaw replaces boxes rather than merely adding constraints: a terminal invalid under Classic already establishes that the regional rules matter. Otherwise the Jigsaw check also counts under Classic and requires the result to differ from one. An incomplete comparison establishes nothing.

Successful generation returns both the puzzle and its accepted assessment. The default allowance is 40 layout attempts, 4,000,000 shared work units and 500 logical steps. Terminal construction, geometry, preparation, candidate edits, uniqueness, rating and necessity checks all retain their work charges, including unsuccessful attempts.

An exhausted request reports the applicable bounded outcome; it does not imply no suitable puzzle exists. There is no authored-board fallback, lower-tier substitution or hidden retry allowance. See [engine contracts](../engine.md) for the exact seed frame, BLAKE3/ChaCha8 recipe and compatibility rules. A change to random-call order, branching, accounting or acceptance can change seeded output and requires deliberate version handling.
