# Constraints and exact search

## Board and candidate model

The board has 81 cells, indexed as `row * 9 + column`. A board value is zero for an empty cell or a digit from 1 through 9. A `CandidateMask` uses bit `digit - 1`; for example, `{1, 3, 9}` is `0b100000101`. Intersecting masks removes unsupported values without allocating collections.

A candidate is a value still permitted by the deductions made so far. Its presence does not guarantee a global solution. Exact-search domains represent assigned cells as singleton masks; the public logical workspace represents filled cells with empty candidate masks. These representations serve different operations and must not be interchanged.

Prepared rules separate four relationships:

- **Full units:** nine cells that must contain every digit exactly once. Only these support the rule that a missing digit must have a position.
- **Duplicate-exclusion peers:** pairs that cannot contain the same digit. A smaller cage is not a full nine-digit unit.
- **Related cells:** presentation/highlight relationships, which do not independently imply duplicate exclusion.
- **Arithmetic and path constraints:** cage sums, increasing thermometers and arrow equations.

| Variant  | Compiled mathematical rules                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Classic  | Rows, columns and nine 3×3 boxes are full units                                                                                               |
| Diagonal | Classic units plus both main diagonals                                                                                                        |
| Jigsaw   | Rows, columns and nine validated regions; regions replace boxes                                                                               |
| Killer   | Classic units plus distinct digits and a target sum within each cage                                                                          |
| Thermo   | Classic units plus strictly increasing digits along each ordered path                                                                         |
| Arrow    | Classic units plus circle digit equal to the shaft sum; repeated shaft digits remain legal when their cells are not duplicate-exclusion peers |

Sources: [`rules/types.rs`](../../sudoku/core/src/rules/types.rs), [`rules/context.rs`](../../sudoku/core/src/rules/context.rs), [variant definitions](../../sudoku/core/src/rules/definitions).

## Exact local support

For one constraint, enumerate assignments compatible with the current cell domains, the clue equation/order and duplicate-peer relationships within that clue. For each cell, collect the digits occurring in at least one valid local assignment. Intersecting its domain with that support removes impossible values.

For example, a two-cell distinct cage totaling 10 with domains `A={1,4,6}` and `B={4,6}` permits only `(4,6)` and `(6,4)`. Remove 1 from A. This proves a local exclusion; other parts of the board may still make both assignments globally impossible.

The enumerator prunes repeated peer digits and impossible sum ranges using suffix minimum/maximum bounds. Thermometers enforce increasing order and leave enough larger digits for the remaining path. Arrows enumerate the circle first and accumulate the shaft separately.

Small Killer cages can reuse a complete catalogue of ordered distinct-digit tuples. Current bounds are four cells per catalogue, 512 tuples per clue and 8,192 per layout. Overflow discards partial catalogues and falls back to exact bounded enumeration; previously completed exploration is not replayed. A nearly fixed cage uses enumeration when its domain-product estimate is no larger than the catalogue. Larger cages, thermometers and arrows use enumeration directly.

Only complete support can eliminate candidates. An interrupted enumeration may simply not have reached an assignment containing a particular digit. Treating its partial union as complete would produce false deductions. Logical cage memoization therefore stores only complete support keyed by all effective local domains, within one workspace.

Sources: [`support.rs`](../../sudoku/core/src/constraints/support.rs), [`cage_catalogue.rs`](../../sudoku/core/src/constraints/cage_catalogue.rs), [`variant_techniques.rs`](../../sudoku/core/src/logic/variant_techniques.rs).

## Propagation and branching

Exact counting combines propagation with minimum remaining values (MRV) depth-first search. The propagation-plus-search approach is also explained in [Norvig's Sudoku essay](https://www.norvig.com/sudoku.html); this implementation adds variant support, cooperative cancellation and reversible state.

At each search node:

1. Propagate singleton cells to duplicate-exclusion peers.
2. For every affected full unit and digit, reject zero possible positions or force the only position.
3. Intersect affected arithmetic/path domains with complete local support.
4. Repeat until no domains change. Reject an empty domain immediately.
5. If every cell is assigned, validate the complete board against all rules and record a solution.
6. Otherwise choose a non-singleton domain with the fewest values, try its digits and recurse.

Cell work uses a stack; affected units and constraints use deduplicated FIFO queues. Cells and units take priority over arithmetic support. MRV ties retain the first cell in board order, and exact-search digits are tried in ascending order. Terminal generation has a different, randomized branching policy described in [generation](generation.md).

Each domain reduction appends the old mask to a trail. A branch remembers its starting trail length and restores all later changes on exit, including exhaustion. Queue membership is reset before the next branch. This avoids copying the complete workspace at every choice while ensuring one failed branch cannot constrain its sibling.

Conceptual control flow, omitting queue and cancellation details:

```text
count(state):
    propagate to a fixed point
    if contradictory: return
    if complete: record the solution; return

    choose an MRV cell
    for each candidate digit:
        remember trail position
        assign and recurse
        restore to remembered position
        stop after two solutions or an incomplete search
```

Sources: [`exact.rs`](../../sudoku/core/src/search/exact.rs), [`propagation.rs`](../../sudoku/core/src/search/propagation.rs).

## Interpreting a count

| Outcome           | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| Complete, count 0 | No solution satisfies the supplied givens and rules        |
| Complete, count 1 | Exactly one solution; the returned board is that solution  |
| Complete, count 2 | At least two solutions; counting deliberately stops at two |
| Budget exhausted  | The operation did not establish a complete capped count    |

A known terminal proves that generated givens have at least one solution, but another solution may exist. Generation therefore still performs exact counting.

The portable core checks caller-owned cancellation at bounded cooperative checkpoints. Work-unit accounting has been removed. Host adapters enforce the 3,000 ms request deadline; local exact-search node limits remain explicit and an incomplete count cannot establish uniqueness. Fixed board size does not make exhaustive search cheap: difficult domains can still create a large search tree. See [engine contracts](../engine.md) for cancellation, ownership and platform execution requirements.
