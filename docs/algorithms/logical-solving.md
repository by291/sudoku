# Logical solving and hints

Logical solving produces named, explainable deductions from the current board and candidate state. It does not turn an exact-search guess or a stored solution digit into a mathematical explanation. Its supported repertoire is finite: failure to find another step means the selected techniques stalled.

## Technique catalogue

The following descriptions summarize the current detectors. Stable IDs come from [`techniques.rs`](../../sudoku/core/src/logic/techniques.rs); availability and priority are defined separately by [difficulty policies](difficulty-rating.md). “Sees” means the cells are duplicate-exclusion peers.

| Technique ID        | Required pattern and conclusion                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `naked-single`      | An empty cell has one candidate; place it                                                                                                                                         |
| `hidden-single`     | A digit has one possible position in a full unit; place it                                                                                                                        |
| `locked-candidate`  | All positions for a digit in one full unit lie in its intersection with another; remove that digit from the rest of the second unit                                               |
| `naked-pair`        | Two cells in a unit both have the same two candidates; remove those digits from the other cells                                                                                   |
| `hidden-pair`       | Two digits are confined to the same two cells in a unit; remove other candidates from those cells                                                                                 |
| `naked-triple`      | Three cells in a unit each have two or three candidates, with a union of exactly three digits; remove those digits elsewhere in the unit                                          |
| `hidden-triple`     | Three digits each have at least two positions and are collectively confined to three cells in a unit; remove other candidates from those cells                                    |
| `x-wing`            | For one digit, two rows have their candidate positions in the same two columns, or the transpose; eliminate outside the selected rows/columns in the covering units               |
| `swordfish`         | The analogous three-row/three-column fish; each selected base unit has two or three positions and their union occupies three covering units                                       |
| `xy-wing`           | A `{x,y}` pivot sees `{x,z}` and `{y,z}` wings; a different cell seeing both wings cannot contain z                                                                               |
| `simple-coloring`   | Link the only two positions for a digit in a unit, then two-color the connected component; eliminate an impossible color (wrap) or an outside candidate seeing both colors (trap) |
| `cage-distinct`     | Exclude digits already placed elsewhere in the cage; this can remove candidates or force a placement                                                                              |
| `cage-remainder`    | One cage cell is empty; subtract the filled digits from the target sum                                                                                                            |
| `cage-combination`  | Keep only digits supported by complete compatible cage assignments; eliminate candidates or place a forced digit                                                                  |
| `thermo-bound`      | Path position and already placed path digits bound each value; eliminate out-of-range candidates or place a forced digit                                                          |
| `arrow-equation`    | Exactly one arrow cell is empty; solve the circle/shaft sum equation                                                                                                              |
| `arrow-combination` | Keep only digits supported by complete compatible arrow assignments; eliminate candidates or place a forced digit                                                                 |

Classic locked candidates use box/row or box/column intersections. Variant full units can participate through their prepared topology. The advanced catalogue currently serves Classic Expert: fish are ordinary row/column patterns, and coloring uses Classic strong links. This is not a claim to implement every fish, chain or coloring variation described in external technique catalogues.

For a concrete naked-pair example, if two cells in a row have `{2,7}` and another has `{2,5,7}`, eliminate 2 and 7 from the third cell. The elimination is one deduction; a later single can place 5.

For a thermometer of length four, positional bounds start as `[1,6]`, `[2,7]`, `[3,8]`, `[4,9]`. A placed 5 in the second cell tightens the third cell's lower bound to 6 and the fourth's to 7. The named `thermo-bound` detector uses these bounds and placed values; the exact-search engine's full local enumeration can propagate more than this named technique.

Sources: [`basic_techniques.rs`](../../sudoku/core/src/logic/basic_techniques.rs), [`advanced_techniques.rs`](../../sudoku/core/src/logic/advanced_techniques.rs), [`variant_techniques.rs`](../../sudoku/core/src/logic/variant_techniques.rs). [HoDoKu's technique guide](https://hodoku.sourceforge.net/en/techniques.php) provides broader illustrated reading; repository code defines the implemented subset and ordering.

## Candidate state and step selection

Each logical workspace owns its board, candidates, prior rule premises and local memo entries. It starts from the board's initial logical candidates, tries permitted techniques in policy order, applies the first effective deduction, and restarts selection. Eliminations remain in the workspace for subsequent steps.

Killer initialization deliberately excludes candidates using full units only. Cage distinctness is introduced as an explained `cage-distinct` step instead of silently applying it during initialization. This preserves the reason behind later placements and the workload trace.

Classic always follows its canonical catalogue order filtered by the allowed set. Other variants preserve the supplied policy order. Changing traversal or priorities can change the chosen trace and rating, even when all possible deductions remain mathematically sound.

Sources: [`workspace.rs`](../../sudoku/core/src/logic/workspace.rs), [`solver.rs`](../../sudoku/core/src/logic/solver.rs).

## Evidence and validation

A `LogicalStep` contains a technique, an action and owned evidence. An action is either a placement or explicit `(cell, digit)` removals. Evidence identifies the relevant unit, clue, candidate domains, subsets, fish covers, wing cells or coloring links, plus applicable premises.

There are distinct validation responsibilities:

- Shape/application checks reject malformed actions, absent candidates and invalid cells before mutation. Public `apply_step` is atomic on such errors, but does not prove the deduction.
- Independent evidence validators check the supplied mathematical witness against the current state. Rerunning a detector and comparing its answer is not an independent proof.
- Hint-chain validation replays the complete chain from its starting board. Authored teaching validation checks explicit candidate-relative exercises; the caller must establish that earlier candidate eliminations were sound.

Returned evidence owns its snapshots, so later workspace changes cannot rewrite an explanation. Sources: [`types.rs`](../../sudoku/core/src/logic/types.rs), [`step_validation.rs`](../../sudoku/core/src/logic/step_validation.rs), [`unit_evidence.rs`](../../sudoku/core/src/logic/unit_evidence.rs), [`advanced_evidence.rs`](../../sudoku/core/src/logic/advanced_evidence.rs), [`teaching.rs`](../../sudoku/core/src/logic/teaching.rs).

## From deductions to a player hint

[`analyze_hint`](../../sudoku/core/src/hint.rs) first compares existing entries with the supplied solution. If an entry is wrong, it returns `ReviewEntry` for the first such cell. That review operation uses the solution; the deduction detectors do not use it as proof.

For a correct incomplete board, the engine starts a fresh logical workspace and accumulates eliminations until the first placement. The result contains the complete elimination-to-placement chain. Classic permits all 11 Classic techniques; variants use their Hard policy. A completed board, unsupported deduction or exhausted work/step allowance has an explicit unavailable result. The hint API does not substitute an unexplained solution digit when deduction stalls.

Full-board analysis distinguishes `Solved`, `Stalled`, `StepLimit` and `WorkLimit`. Only `Solved` can support a completed difficulty assessment. Chinese technique names, explanation text and highlights belong to client presentation, while lesson authoring is documented under [learning content](../learning.md).
