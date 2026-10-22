# Difficulty rating

The current rating identity is `sudoku-rating-v2`. A puzzle's difficulty is the **first supported policy that completes it**, evaluated from Easy upward. A policy is an ordered list of permitted logical techniques. Clue count, exact-search node count and elapsed time do not assign the grade.

## Policies and priority

Each column adds techniques after the preceding column's list, in the order shown. Thus the cumulative list is also the execution priority. Names correspond to the [technique catalogue](logical-solving.md).

| Variant  | Easy                                                       | Medium adds                         | Hard adds               | Expert adds                                                              |
| -------- | ---------------------------------------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| Classic  | Naked single, hidden single                                | Locked candidate                    | Naked pair, hidden pair | Naked triple, hidden triple, X-Wing, Swordfish, XY-Wing, simple coloring |
| Diagonal | Naked single, hidden single                                | Locked candidate                    | Naked pair, hidden pair | Unsupported                                                              |
| Jigsaw   | Naked single, hidden single                                | Locked candidate                    | Naked pair, hidden pair | Unsupported                                                              |
| Killer   | Naked single, hidden single, cage distinct, cage remainder | Locked candidate, cage combination  | Naked pair, hidden pair | Unsupported                                                              |
| Thermo   | Naked single, hidden single, thermo bound                  | Locked candidate                    | Naked pair, hidden pair | Unsupported                                                              |
| Arrow    | Naked single, hidden single, arrow equation                | Locked candidate, arrow combination | Naked pair, hidden pair | Unsupported                                                              |

These are project policies, not universal Sudoku grades. “Hard” is compared within a variant. There are 19 supported variant/difficulty combinations. A unique puzzle can remain ungraded when the supported repertoire cannot complete it.

Source: [`policies.rs`](../../sudoku/core/src/rating/policies.rs).

## Assessment flow

1. Validate the input and check conflicts using prepared rules/support.
2. Run the lowest policy, keeping its effective deductions and final candidate state.
3. If solved, return that difficulty and the complete successful trace.
4. If stalled, continue with the next policy only when its actual priority order extends the previous order as an unchanged prefix. Otherwise restart from the original board and clear the trace.
5. Stop explicitly on invalid input, cancellation or a step limit, or failure of all supported policies to finish.

The prefix condition is stronger than set inclusion. If a newly permitted technique moves ahead of an old one, it can change the earlier path. Reusing the old workspace would then describe a different policy execution. Current policy lists are nested prefixes, but the implementation checks the actual execution order rather than assuming this will always remain true.

The local limit is 500 logical steps per policy. Reused steps count toward that limit. The application request has a single 3,000 ms deadline; policy transitions share cancellation and never renew it. Each new clue mask gets a fresh workspace even if it shares immutable layout preparation.

Target screening for generation evaluates only up to the requested policy. It returns a matching grade, a lower grade, a target stall, invalid input or exhaustion. A target stall is not proof of a higher grade. Completing a successful trial summarizes its owned trace without another solve or another search.

Source: [`assessment.rs`](../../sudoku/core/src/rating/assessment.rs), [`input.rs`](../../sudoku/core/src/rating/input.rs).

## Workload summary

The successful trace produces descriptive statistics:

| Field                  | Meaning                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Steps                  | Total effective logical actions                                                           |
| Placements             | Actions filling one cell                                                                  |
| Eliminations           | Actions explicitly removing candidates                                                    |
| Candidate removals     | Distinct `(cell, digit)` removals within those elimination actions                        |
| Technique counts       | Number of actions for each of the 17 stable technique IDs                                 |
| Highest technique/tier | Highest policy-ordered technique used, and its assigned tier                              |
| Variant steps          | Actions with rule evidence, regional/diagonal unit evidence, or recorded variant premises |

Automatic peer propagation following a placement does not inflate candidate-removal counts. A complete valid board has zero actions and no highest technique/tier. No weighted score is calculated. Compact saved assessments retain these results; restoration does not rerun the rater.

Source: [`workload.rs`](../../sudoku/core/src/rating/workload.rs), [`types.rs`](../../sudoku/core/src/rating/types.rs).

## Interpretation and limits

Uniqueness and rating are separate engine checks. The rater reports what its ordered logical policies can do; generation independently confirms uniqueness before delivery. Invalid, ungraded and exhausted assessments must not be presented as a successful grade.

Difficulty labels do not predict a particular player's solving time. The engine does not model visual search effort, familiarity with variants or the dependency structure between available deductions. Pelánek's [difficulty-rating study](https://www.fi.muni.cz/~xpelanek/publications/sudoku-arxiv.pdf) examines both step complexity and dependencies against human solving data. It motivates this limitation; its empirical results do not validate this project's policies.

[HoDoKu's rating documentation](https://hodoku.sourceforge.net/en/docs_cre.php) is a useful comparison: it combines configurable technique levels and accumulated scores. This project uses the ordered-policy rule above and does not reproduce HoDoKu's scores or labels.
