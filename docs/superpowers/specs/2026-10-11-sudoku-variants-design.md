# Sudoku Variants Design

Date: 2026-10-11

Status: Approved by the user on 2026-10-11; implemented and verified on 2026-10-12. See the [implementation plan](../plans/2026-10-11-sudoku-variants.md) for completion evidence.

## 1. Intent and scope

Extend the existing Chinese-language, browser-local Sudoku game with Killer, Jigsaw, Diagonal, Thermo, and Arrow Sudoku. Retain Classic Sudoku. Every type must be playable with the existing keyboard/touch controls, meaningful candidates and hints, undo/redo, pauses, resumable saves, and completion records.

The user explicitly requested all five types and selected a separate daily puzzle for each type. The approved design includes three logically rated difficulties for free play, one Medium daily puzzle for each of the six types, and short introductory learning material for each new rule. Existing Classic lessons and practice remain available.

Use the existing Vue 3.5.43, TypeScript 6.0.3, Vite 8.3.4, Pinia 4.0.3, Vue Router 5.4.0, Naive UI 2.45.3, idb 8.0.4, Web Worker, native CSS, Vitest, and Playwright stack. No backend or additional dependency is needed. Follow [AGENTS.md](../../../AGENTS.md), [Web Architecture](../../architecture.md), and the [existing product design](2026-10-11-sudoku-design.md).

All types use 81 cells and digits 1–9. This release implements individual variants, not combinations of multiple variant rules, other board sizes, a puzzle editor, or imports from external puzzle services. Preserve the current visual palette and complete game workflow.

Success means each type has genuine rule-driven puzzles and deductions, rather than a decorated Classic puzzle. Players can distinguish the rules, resume different types independently, and trust completion checks and hints.

## 2. Approaches considered

1. **Shared rule-aware engine and game workflow — recommended.** Pass a typed rule description through board analysis, search, generation, hints, worker messages, and stored puzzles. Add focused rule implementations within the existing engine. This requires a coordinated contract change but gives every input method and game mode the same behavior.
2. **Separate engine and page for every variant.** Easier to prototype one type independently, but duplicates session actions, storage, keyboard behavior, and fixes across six applications. It conflicts with the repository's cohesive workflow organization.
3. **Fixed puzzle packs on the current engine.** Quick to expose new board drawings, but the current candidates, search, hints, and completion checks would still apply only Classic rules. A proper fixed-pack approach would also need the shared rule-aware engine and would offer less puzzle variety than seeded generation.

Use the first approach, with independently validated fallback puzzles for reliable bounded generation. Keep this as one cohesive extension because the five types depend on the same rule, session, rendering, and persistence contracts.

## 3. Rules and puzzle data

Use stable identifiers `classic`, `diagonal`, `jigsaw`, `killer`, `thermo`, and `arrow`. Chinese labels are 标准数独、对角数独、不规则数独、杀手数独、温度计数独、箭头数独.

Extend `Puzzle` with a required `rules` discriminated union. Its discriminator identifies the type and its remaining fields contain the complete clue geometry. The stored puzzle, not current UI choices, determines the rules for a running session.

| Type     | Rules and geometry                                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classic  | Existing row, column, and nine 3×3 box constraints.                                                                                                                                                                                                                                                                                             |
| Diagonal | Classic constraints plus both full main diagonals, each containing 1–9 exactly once.                                                                                                                                                                                                                                                            |
| Jigsaw   | Rows and columns remain unchanged. Nine orthogonally connected regions of nine cells replace the 3×3 boxes. The regions partition all 81 cells without overlap.                                                                                                                                                                                 |
| Killer   | Classic constraints plus a partition into orthogonally connected cages. Each cage has a target sum and contains no repeated digit. A cage contains at most nine cells.                                                                                                                                                                          |
| Thermo   | Classic constraints plus ordered paths of 2–9 distinct cells. Values increase strictly from the bulb to the end. Consecutive path cells touch orthogonally or diagonally; paths may share cells.                                                                                                                                                |
| Arrow    | Classic constraints plus a one-cell circle and an ordered shaft of 1–9 distinct cells. Shaft values sum to the circle value. Repeated shaft values are allowed when the row, column, and box constraints permit them. The circle is not part of its shaft; successive cells touch orthogonally or diagonally. Different arrows may share cells. |

Validate indices, integer sums, bounds, uniqueness of cell references, connectivity, and the complete stored solution. Reject contradictory or malformed clues explicitly. Generated Jigsaw regions must include a genuinely nonrectangular region, and new types must contain their defining clues.

Reference rules: [Cracking the Cryptic's variant rule book](https://crackingthecryptic.com/ctcBooks/variantsudoku.pdf) and [Grandmaster Puzzles' Arrow/Killer/Thermo example](https://www.gmpuzzles.com/blog/2021/08/arrow-killer-kropki-thermo-sudoku-by-michael-rios/). These references inform rules; puzzle content must be authored for this project rather than copied from those publications.

## 4. Shared engine and dependencies

Keep the engine in `src/core/sudoku/`. Add cohesive rule data/validation and constraint evaluation modules there. Preserve the existing feature, storage, worker, and shared presentation boundaries; avoid a feature tree for each type or a general-purpose plugin framework.

Compile a puzzle's rules into all-different units, duplicate-exclusion peers, and arithmetic/ordered-path constraints. A unit is a full set containing every digit once, such as a row, column, region, or diagonal. A Killer cage or Arrow shaft must not be treated as a nine-digit unit.

All rule-sensitive operations consume the puzzle's rules: candidate calculation, conflict reporting, solution counting, completion, logical analysis, and note cleanup. Shared presentation receives explicit rules and derives cell boundaries and clue drawings from them. It does not import a store or implement solving rules.

Keep related-cell highlights separate from duplicate-exclusion peers. Arrow-related cells are useful to highlight together, but the same digit may occur on an arrow shaft. Never remove a manual note solely because another cell belongs to that arrow. Existing manual-note behavior stays explicit: entering a value removes duplicate notes only where the rules prove repetition impossible; the candidate helper recalculates all candidates.

Candidate reductions must be sound under the current filled values. Arithmetic support checks may prune candidates only when no locally valid assignment supports them. Bound recursive assignment enumeration and repeated propagation as well as search-node counts. Exhaustion is an explicit outcome; it must not be interpreted as an empty domain, no solution, or a proof of uniqueness.

Conflict reporting identifies direct rule violations or locally impossible constraints without comparing against the stored solution. Examples include duplicates, an impossible cage total, reversed Thermo values, and an Arrow whose sum can no longer match its circle. Associate each violation with cells, a constraint identifier, and a Chinese explanation. A full board completes only when every active rule holds. The separate Check action retains its solution comparison and assistance classification.

## 5. Logical hints and difficulty

Retain the existing five Classic techniques and deterministic ordering. Generalize unit evidence to describe Jigsaw regions and diagonals. Add typed evidence for cage sums, Thermo bounds/order, and Arrow sums/combinations so the board can highlight the specific constraint used.

Hints must explain the rule-dependent eliminations leading to the next placement. Do not silently apply strong arithmetic pruning and then describe a resulting single as though its only premise were a row or box. Recalculate from current entries; manual notes are not authoritative. Incorrect entries still produce a review hint, and applying a placement remains an undoable session action.

Use difficulty policies scoped to each type:

- **Easy:** Singles and straightforward rule deductions, including cage remainder arithmetic, positional Thermo bounds, and one-unknown Arrow equations.
- **Medium:** Easy techniques plus unit intersections/locked candidates and supported cage/Arrow combination eliminations.
- **Hard:** Medium techniques plus naked and hidden pairs, with variant constraints participating in the evidence.

Classic retains its current exact difficulty policy and generation behavior. Variant labels compare difficulty within that type; a Hard Killer time is not compared with a Hard Classic time. Rate through the actual explainable deduction sequence, not clue count or the search solver. Reject generated puzzles that cannot be finished with the supported logical policy. Search is used for validation and uniqueness, not as a source of claimed logical hints.

The short rule lessons use fixed, validated examples and one exercise per new type. Keep the existing six Classic lessons, their progress identifiers, and full-board practice. Each new rule lesson links to an Easy practice game of its type; an advanced variant-strategy curriculum is outside this extension.

## 6. Seeded generation and worker contracts

Preserve `sudoku-v1` and the existing Classic seed outcomes. Use a separate `sudoku-variants-v1` generation version for the new types. Include type, requested difficulty, and seed in variant generation identity. Preserve original puzzle data when restoring any saved session.

For each type, construct a valid complete grid and rule geometry, then remove or choose givens while checking rule-aware uniqueness and logical rating. Jigsaw generation must preserve connected, valid regions; Killer cages must derive their totals from the complete grid; Thermo and Arrow paths must satisfy their full constraints before clue removal.

Every delivered variant puzzle, including a fallback, must have clues that matter. Validate that removing the additional constraint does not leave the same uniquely solvable Classic puzzle. For Jigsaw, validate the actual region map and demonstrate that treating it as a Classic board changes validity or removes uniqueness. Do not ship standard-only solvable puzzles with optional decorative clues as the variant catalogue.

Keep generation deterministic and bounded. Retain Classic budgets unchanged. New generation permits at most 20 layout attempts and 500 logical steps per analysis. Use one million work units across generation search and logical validation, plus a separate one-million-unit budget for fallback uniqueness and rating validation. Count each visited search node or partial arithmetic assignment as one work unit; repeated arithmetic propagation also consumes this budget. Neither budget depends on elapsed time. Preserve the 15-second main-thread timeout and retry/cancel behavior.

Provide an authored, independently verified fallback for every new type/difficulty pair. A fallback is returned only after rule-aware uniqueness and rating validation. If that verification exhausts its budget, return the explicit budget-exhausted outcome rather than changing difficulty or returning an unverified puzzle.

Use only transformations that preserve the active rules:

- Spatial rotations/reflections remap cells, regions, cages, and every ordered path together.
- Classic keeps its existing transforms. Diagonal and Jigsaw may rename digits using a bijection.
- Killer digit complementation may be used only with the corresponding cage total transformation `newSum = 10 * cageSize - oldSum`.
- Thermo complementation requires reversing each ordered path.
- Arrow must not use arbitrary digit renaming or complementation; sums would change. Spatial transformations preserve its arithmetic.

Do not reuse Classic row/band/column shuffles for geometry-dependent variants without proving that all constraints and connectivity remain valid.

Generation requests specify the type; hint requests carry the complete puzzle rules along with the current board and solution. Validate every new field and evidence shape at worker boundaries. Preserve request IDs, cancellation, stale-response rejection, and literal relative worker asset loading.

## 7. Game screens, board rendering, and accessibility

Keep `/play/free`, `/play/daily`, the learning routes, and `/records`. Add a validated `variant` query for type selection. A link without that query defaults to Classic; explicit saved-session links restore the type encoded in that session. Unknown type queries show actionable feedback and do not silently start a different puzzle.

Free play exposes one Naive UI type selector and the existing three difficulty choices. These configure the next game. Changing them does not mutate a running puzzle. The board heading always shows the actual active type. Starting a different type preserves the paused save of the old type; if the target type has an unfinished save, offer resume or confirmed replacement.

Daily play exposes the same six types and their individual completion status. Changing the daily type settles and saves the current session before loading the selected type. On a failed save, retain the unsaved current session and offer retry; switching must not discard its in-memory state.

The shared board retains CSS Grid and existing cell buttons. Draw clue geometry with a responsive SVG layer aligned to the 9×9 grid; decorative SVG has `pointer-events: none` and is hidden from accessibility APIs. Digits, notes, focus rings, and conflict/hint markers remain readable above the drawings.

- Diagonal: show both marked diagonals with clear rule text.
- Jigsaw: draw the actual region boundaries and remove misleading 3×3 box borders.
- Killer: draw inset dashed cage boundaries and a small target sum at a stable anchor cell.
- Thermo: draw the bulb and ordered tube beneath digits.
- Arrow: draw the circle, shaft, and visible arrowhead beneath digits.

Provide concise Chinese rule summaries and cell labels that identify relevant regions/cages/paths. A selected constraint's rule and clue values must also be available as text, so players do not need color or SVG alone to understand it. Reserve label space to prevent cage sums from covering notes. Pausing obscures values, notes, and clue overlays and removes clue details from accessible cell labels.

Use the existing light/dark/system theme palette, modal focus behavior, keyboard ownership, and on-screen digit controls. Verify that overlays never capture touch input or obscure keyboard focus and that the board fits at 360px width.

## 8. Saves, daily identity, and records

Keep one active free-play save **per type**, including Classic. Replacing a free-play puzzle removes only the previous active save for that type. Shared ownership leases and serialized writes continue to operate by session ID. Learning retains its existing single active practice-session policy, with the puzzle type stored in that session.

Use record `formatVersion: 2` for new writes to sessions and results. Accept and validate old version-1 records, normalize them to Classic rules in memory, and upgrade them on subsequent writes. Missing rules are accepted only through the validated legacy-record path. Unknown versions/types and malformed new rules are isolated through the existing quarantine flow. Retain the database name and existing object stores; a database schema upgrade is unnecessary for these record-shape changes.

Legacy identity, revisions, history, assistance counters, completion records, lesson progress, and defaults must survive normalization. Do not rewrite old seeds or session IDs or grant a second formal attempt during migration.

Each of the six types has a Medium daily puzzle that changes at midnight in `Asia/Shanghai`. For the new types:

- Seed: `daily:sudoku-variants-v1:<variant>:<YYYY-MM-DD>`.
- Formal session ID: `daily:<variant>:<YYYY-MM-DD>:formal`.
- Practice replays receive ordinary unique session IDs and cannot replace a formal result.

Classic keeps `daily:sudoku-v1:<YYYY-MM-DD>` and `daily:<YYYY-MM-DD>:formal`, preserving existing challenges and results. Formal eligibility is scoped by date and type. Restarting before completion retains time and irreversible assistance; completing an old challenge does not count toward today's streak.

Home resume cards identify type, mode, and difficulty. The daily entry shows progress out of six types and links to the selected type. Records expose a type filter; best times, daily completion totals, current streaks, and longest streaks are computed independently for each type. Retain assisted/unassisted separation. Completing two different types on one date must not increment either type's streak twice.

## 9. Implementation ownership and sequence

1. **Rule foundation:** Types, validation, compiled units/constraints, candidates, conflicts, and completion under `core/sudoku/`.
2. **Search and deductions:** Rule-aware uniqueness, explainable deductions, difficulty policies, and generation/fallback fixtures. Preserve Classic fixtures and deterministic results.
3. **Boundary integration:** Worker messages/client, session actions, stored-record normalization, and scoped replacement/daily identity.
4. **Player workflow:** Shared clue rendering, free/daily selectors, rules/learning introductions, home resume cards, and type-filtered records.
5. **Verification:** Independent algorithm fixtures, complete session/persistence tests, browser flows, build, and documentation.

Keep work on the user's already-authorized current branch and in the current conversation. Do not create a new worktree or commit changes without a new explicit request. Detailed file contracts and executable task steps belong in the implementation plan after this design is approved.

## 10. Acceptance and verification

- All five new types can start at Easy, Medium, and Hard. Each generated puzzle satisfies its complete rules, has exactly one independently confirmed solution, and matches its supported logical tier.
- Candidate fixtures prove expected inclusions/exclusions; invalid partial sums and ordered paths produce rule-specific conflicts. Use independently known facts, not the implementation under test, as expected results.
- Variant hint fixtures prove their eliminations and placements and show the correct Chinese explanation/evidence. Arrow tests explicitly cover permitted repeated shaft digits and reject mistaken all-different assumptions.
- Malformed regions/cages/paths and unknown record/protocol versions or types are rejected. Budget exhaustion is inconclusive. Test deterministic outcomes with fixed seeds, fallback validation, cancellation, and stale responses.
- Classic generation fixtures, old saves/results, lessons, routes, keyboard/touch actions, timing, ownership, and assistance remain compatible.
- Store/persistence tests cover one free save per type, independent formal daily attempts, resume after switching, failed-save retention, legacy normalization, and scoped record aggregation.
- Playwright covers each type's visible clues, rule text, candidate helper, logical hint application, pauses, refresh/resume, completion, and independent daily status. Exercise dark mode and 360px touch layouts, including overlay alignment and focus.
- Run type checking, ESLint, Prettier, the full unit suite, production/root-subpath builds, and available desktop/mobile Chromium and WebKit browser suites. Report the already-known Firefox host launch limitation separately unless it has been resolved; do not present emulation as physical-device verification.

No product code is changed by this design document. Implementation begins after review of its subsequent implementation plan.
