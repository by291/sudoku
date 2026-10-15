# Feedback Guided Sudoku Generation

Date: 2026-10-15

Status: The user approved the four-part architectural direction and the written specification, then requested continuation on 2026-10-15. The user approved the implementation plan and native execution on 2026-10-15. Implementation is in progress.

## Purpose and baseline

Improve target-difficulty success and useful exploration per unit of computation across all six variants and 19 supported type/difficulty combinations. Replace separate greedy generation workflows and the Expert-only repair path with a shared, feedback-guided candidate search. Retain the existing exact acceptance requirements and resource limits.

The baseline is the verified local v9 engine described in the [targeted generation report](../verification/2026-10-15-targeted-generation-v9.md). Its source hashes identify the current uncommitted implementation on top of `b73cc61`; that implementation must be preserved as the comparison baseline before product edits begin. This specification does not commit those existing changes.

The remaining Classic Hard request, `local-product-corpus-v1:seed:058` under its v9 identity, demonstrates the search problem. All 40 terminals were valid. The request performed 3,240 exact counts and 2,283 trial assessments: 2,241 Easy, 20 Medium, six Expert, 16 ungraded and no Hard. It stopped at the layout limit after 900,009 work units. Observation reproduced the stored result exactly and accounted for all work. Approximately 78.9% of charged work was exact counting; this percentage is not a CPU-time percentage.

## Scope and invariants

Implement all four approved areas together:

1. A common candidate explorer driven by difficulty feedback.
2. Target-aware logical screening with complete final assessment.
3. Prepared exact-search topology and bounded compiled arithmetic support.
4. Shared scheduling, honest accounting and explicit exhaustion causes.

Preserve these contracts:

- At most 40 constructed layouts, 4,000,000 aggregate work units, 500 logical steps per policy and the 3,000 ms generation transport deadline. Keep the existing lower limits accepted by the decoder. Assessment and hint transport remain 15,000 ms.
- Each delivered puzzle has exactly one solution, a complete assessment matching the requested tier, a valid terminal, valid rules and meaningful variant constraints.
- Classic retains the existing maximum clue targets: Easy 36, Medium 32, Hard 30 and Expert 28. A matching grade above that clue target remains a construction checkpoint, not a delivery. Variants retain their current acceptance policy without adding a clue-count target.
- Expert remains exclusive to Classic. Technique order, candidate initialization, deductions, evidence and workload definitions retain `sudoku-rating-v2` semantics.
- Stored puzzles, assessments, results, formal daily IDs and eligibility remain authoritative. Database, backup, puzzle and assessment record formats do not change.
- New requests advance to `sudoku-v10` and `sudoku-variants-v10` after verification. There is one current production dispatcher and no historical generator dispatch.
- No authored fallback, grade substitution, puzzle pool, background puzzle computation, new native dependency or cross-request search cache. The idle Worker still only prepares the runtime.

The release seeks better measured success within finite limits. It does not promise that every seed must succeed within three seconds.

For v10, this specification supersedes the earlier design's exact-count-before-every-retained-removal requirement, Expert-only two-refinement path and single-path layout scheduling. The replacement affects intermediate construction states; final independent uniqueness, exact grade and delivery requirements remain mandatory. Earlier version descriptions and verification reports remain historical evidence.

## Alternatives and selected approach

| Approach                                                | Assessment                                                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add more difficulty-specific repair loops               | Retains duplicated scheduling and does not address unnecessary classification or repeated solver preparation.                                                                  |
| Shared feedback-guided search with prepared computation | Selected. Improves how the existing budget is used while preserving the independent logical and exact-validation responsibilities.                                             |
| Replace the engine or pre-generate a puzzle pool        | Deferred. A faster Classic-only solver does not cover every variant, and pre-generation changes computation timing and identity policy. Neither is required for this refactor. |

The existing v9 cage memo remains useful. It becomes an optimization within the prepared support owner rather than the main architectural mechanism.

## Ownership and dependencies

Keep the implementation in the pure engine and the existing explicit variant registrations. Do not introduce a general plugin framework, a generic infrastructure layer or a callback-heavy service container.

| Owner                                             | Responsibility after the change                                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generation.ts`                                   | Decode requests/limits, select the current identity, invoke generation and expose results/metrics.                                                                                 |
| `generationSearch.ts`                             | Own the request budget, active layouts, candidate frontiers, deterministic scheduling and final acceptance.                                                                        |
| `generationCandidates.ts`                         | Own clue-mask snapshots, novelty keys, candidate edit cursors and deterministic remove/restore/exchange operations.                                                                |
| `generationStrategies.ts` and `variants/`         | Statically register permitted terminal/geometry construction and transformations for all variants.                                                                                 |
| `classicGeneration.ts` and `variantGeneration.ts` | Retain focused terminal/geometry construction responsibilities where needed; remove their duplicate deletion/acceptance loops. Move or remove obsolete exports and update callers. |
| `rating.ts`                                       | Share one policy runner between full assessment and target-aware generation screening.                                                                                             |
| `rules.ts` and `ruleTypes.ts`                     | Own compiled immutable topology, unit/clue memberships and explicit constraint definitions.                                                                                        |
| `constraintSupport.ts`                            | Prepare bounded support catalogues, evaluate exact local support and own workspace memo contracts.                                                                                 |
| `search.ts` and `propagationSearch.ts`            | Prepare exact validation once per layout and run isolated probes with reversible branch state.                                                                                     |
| `worker/`                                         | Keep request validation, computation lifetime, cancellation, timeout and response adaptation.                                                                                      |

Names describe responsibilities, not a requirement to split trivial forwarding functions into separate files. Update [Web Architecture](../../architecture.md) and the [variant extension checklist](../../variant-extension.md) with the final implemented boundaries.

The dependency direction is generation orchestration to candidate operations, rating and exact search; rating to logic and prepared rule support; exact search to prepared rule support. Logic and search must not import generation orchestration. No engine module imports Vue, workers, storage or browser APIs.

## Layout and candidate ownership

A layout is a known complete terminal paired with one validated rule geometry. Creating another terminal or changing its geometry creates another layout and consumes the same 40-layout allowance. Clue edits under unchanged geometry do not create another layout. This definition prevents geometry retries from becoming uncounted attempts.

Charge the layout-attempt counter before starting terminal/geometry work. Failed, partial and locally exhausted attempts still consume that count even though they cannot become active prepared layouts. Reusing an existing terminal with newly constructed geometry also consumes a new layout attempt.

A prepared layout owns its rules snapshot, known terminal, compiled topology, support preparation, target assessor and exact validator. It has a stable request-local layout ID. Rules and terminals are immutable after preparation. Candidate boards own their clue masks and edit cursors; their nonzero digits always come from that layout's terminal.

Candidate identity is `(layout ID, given-cell mask)`. Different layouts never share candidate results. Within one layout, a canonical 81-cell presence mask is sufficient because clue values are fixed by the terminal. A known terminal proves existence, not uniqueness.

Never retain a logical workspace, reduced candidates or earlier deductions across clue masks. Removing a clue widens domains. Each screen initializes its own workspace; prepared topology/catalogues may be shared because they do not depend on that board's domains.

## Target-aware assessment

Add a typed target-screening operation to the prepared assessment owner. It validates/copies the board, uses the existing policy order and charges the supplied request budget. It runs only the supported policies up to the requested difficulty.

Its outcomes distinguish:

- `below-target`: an earlier policy solved the board, with the actual lower tier and an owned successful-trace completion operation.
- `matching-target`: the requested policy is the first to solve it, with the owned completion operation.
- `target-stalled`: no permitted policy through the target solved it, with bounded feedback such as remaining cells and performed deductions.
- `budget-exhausted`: an inconclusive result with work-limit or logical-step-limit detail.
- `invalid`: an explicit input or rule failure.

`target-stalled` must never claim that the board is Expert, impossible or nonunique. A Hard request does not need an Expert assessment just to reject a trial; its explorer can use the stalled state as a repair checkpoint. Internal ranking is search guidance, not a new player-facing difficulty score.

Full standalone assessment continues through all supported tiers. Both operations share the same runner, including safe policy-prefix continuation, reset when priorities change, total per-policy step accounting and trace completion. Do not duplicate the policy engine or change its order to improve hit rate.

A matching trial completes the full accepted summary before delivery. This must equal a fresh full assessment of the same board when both complete within their limits. Trace ownership and evidence isolation remain required.

## Candidate exploration

Every variant uses the same explorer with its explicit static construction capabilities. Remove the separate Expert repair orchestration once the common workflow covers its contracts.

Start with the known terminal and a seeded ordinary removal sweep. The sweep remains a cheap construction policy, rather than the only route through the clue space. Each candidate evaluation can preserve an owned checkpoint and schedule another permitted operation:

- Remove a currently present clue.
- Restore a missing clue from the known terminal.
- Exchange clues: restore one or two terminal-consistent clues, then attempt other removals.
- Continue another checkpoint's removal order.

All edits use the same exact rule geometry and known terminal. Operations copy the board or restore their own mutations before another candidate observes it. Multiple-cell exchanges are one proposal containing explicit intermediate boards; every intermediate screen/search performed is charged. No temporary board is published.

Keep separate frontier slots for lower-tier solved checkpoints and target-stalled checkpoints. Prefer lower-tier checkpoints closer to the requested tier, then greater progress under the target policy. Prefer stalled checkpoints with fewer remaining cells, then more completed logical progress. Use clue count only as a deterministic search tie-breaker, never as a substitute for the grade. Preserve diversity by mask identity and use stable seeded tie-breaking.

A target-stalled checkpoint can be unverified for uniqueness. Record that state explicitly. It is useful for adding/restoring clues, but it cannot authorize a uniqueness claim or delivery. A complete logical derivation containing no guessing may guide construction; every delivered result still passes the independent exact counter.

The initial bounded configuration is:

- At most two prepared layouts active at once.
- At most eight retained candidate checkpoints per active layout, split between lower-tier and stalled states when both exist.
- At most 4,096 visited masks per layout; retire a layout when its novelty bound is reached rather than repeatedly visiting evicted masks.
- At most 32 seeded neighbouring proposals from one checkpoint before it is exhausted.
- After eight evaluated proposals without an improved checkpoint, make another layout eligible when creation allowance remains.

These are version-owned exploration bounds, not extra work allowances. Paired measurements may select different fixed bounds within this design before release; record and freeze the selected values. Do not tune values by seed, user, wall-clock timing or a historical failure list.

Geometry changes remain explicit new-layout operations. Use existing valid geometry construction initially; this refactor does not assume that cage merging or larger cages improve difficulty. Preserve connectivity, distinct cage digits, nontrivial Jigsaw regions and legal transforms.

## Exact validation and acceptance

Provide a prepared exact validator for a layout. Generation reuses its immutable topology and arithmetic support preparation. Existing standalone counting remains available and prepares a validator for its own call; the two entry points use the same search implementation.

Choose the inexpensive rejection stage by an explicit type/tier policy and verify that choice with paired experiments. In particular, target screening can reject or retain logically solved lower-tier construction states without performing a redundant exact count first. Known-terminal consistency is mandatory for this optimization. Target-stalled states retain an explicit unknown uniqueness status unless counted. Preserve the current uniqueness-first path where experiments show it is cheaper.

The common final acceptance operation always performs these gates under the original request budget:

1. Validate rules, board/terminal consistency and the requested generation identity.
2. Require the exact requested logical tier and existing clue policy; complete the accepted assessment.
3. Count solutions independently up to two and require a completed count of exactly one, with the known terminal as its solution.
4. For variants, require meaningful variant rules using the existing necessity test and Jigsaw exception.
5. Return owned puzzle and assessment data only after every gate completes.

A rejected uniqueness or necessity check feeds the explorer. A lost known solution is an internal failure. An incomplete check is never zero solutions, uniqueness or success. Do not omit a gate because another operation appears to imply its conclusion.

## Prepared computation

### Topology

Compile cell-to-unit and cell-to-constraint memberships with the rule context, alongside existing full units, duplicate peers and related-cell geometry. Exact probes must not rebuild these memberships for every clue mask. Keep full units distinct from arithmetic constraints and duplicate-exclusion groups.

Prepared owners take validated snapshots. A caller's later edits to input rules, returned evidence or a completed result cannot alter future probes. Static Classic topology may remain an immutable module constant. Puzzle-specific preparation belongs to the charged request and is not performed by idle-worker warmup.

### Arithmetic support

For Killer cages of size at most four, prepare complete ordered assignment catalogues from distinct-digit combinations matching the cage total, then filter against effective local domains. Preserve original cell order, fixed digits and exact support masks. The same support owner serves conflict checks, candidate support, logical combination deductions and exact propagation.

Bound catalogues to 512 tuples per constraint and 8,192 tuples per layout. Charge every tuple-construction extension and compatibility test. If a complete catalogue would exceed the memory bound, discard the partial catalogue and select the existing bounded enumerator for that constraint; the work already spent remains charged. Larger cages, Arrow and Thermo retain their current exact support enumeration in this release through the same typed prepared support interface.

No partial catalogue can establish support or contradiction. If compilation exhausts work, return an inconclusive work-limit outcome; do not reset the budget or silently treat an incomplete catalogue as complete.

Retain one complete local-domain memo entry per cage in each logical workspace where useful. Its key includes the prepared context/constraint identity, geometry, total and effective domains. Prepared static catalogues may cross candidate boards within one layout; domain-dependent support snapshots may not.

### Reversible exact probes

Replace repeated recursive branch-array copies with a reversible domain trail. Each branch records a trail mark, applies reductions, explores and restores all modified masks to that mark on every exit, including exhaustion. Propagation queues and branch-local flags are restored or rebuilt consistently.

Every new candidate probe starts from its own givens and fresh domains, even when it uses reusable allocated buffers. Cross-board reuse of a previous narrowed state is forbidden. Returned solutions are copies; neither another probe nor a later undo can mutate them. Keep deterministic unit, constraint and branching order.

The trail is exact-search state only. It cannot supply human hint evidence or carry search guesses into logical grading.

## Scheduling and accounting

Use one mutable work budget for terminal construction, geometry, preparation, proposals, exact validation, logical screening, final completion work and variant necessity wherever the current operation is charged. Nothing receives a fresh allowance when it is retried or resumed within the request.

Schedule bounded candidate operations across the active layouts with deterministic ordering. Stagnation can open another layout or replace the least promising active layout, subject to the live-layout bound. Preserve the best useful checkpoints when selecting replacements.

Retiring a layout discards its prepared resources and frontier together. Preserve promising active layouts when choosing a replacement; never transplant clue masks, feedback or deductions into a different terminal/geometry.

Reaching 40 created layouts prevents further creation; it does not immediately discard the frontiers already owned by the active layouts. Continue those frontiers while they have permitted novel operations and shared work remains. This is how the scheduler can use remaining work without increasing the layout cap.

Retain existing charges for recursive visits, propagation sweeps, arithmetic assignments, detector work and geometry inspection. Charge new preparation, catalogue filtering and proposal work before performing it. Skipped computation has no synthetic charge, and repeated computation is never refunded. Counters must reflect actual operations rather than make the new algorithm look cheaper.

Record separate diagnostic work for terminal/geometry preparation, arithmetic support, exact search, logical screening and candidate proposals. Their total must equal `constructionWork`; diagnostics include abandoned and inconclusive operations. Comparisons report wall-clock time as well as work because existing work units have different costs.

Generation exhaustion gains an engine-level cause distinguishing work limit, logical-step limit, layout limit and exhausted search frontiers. A single step-limited candidate does not exhaust the request if other permitted candidates remain. Work limit takes precedence when no more work can be charged. Report layout limit only after creation is blocked and retained frontiers cannot proceed. Keep the existing Worker outcome/status/message mapping and player recovery behavior; technical counters do not enter the player interface.

The engine remains deterministic and synchronous. It makes no wall-clock-dependent candidate choices. The Worker client owns the existing three-second interruption, which can publish only timeout and never an alternative puzzle. This release does not resume an exhausted request by starting a new hidden allowance.

## Identity and integration

Use explicit seeded substreams derived from the v10 identity for terminal construction, geometry and candidate exploration, with stable layout/proposal indices. A failed neighbourhood proposal must not accidentally replace later terminals by consuming their stream. Catalogue preparation and diagnostics consume no random values.

Advance current generation identities only after the complete implementation is validated. Preserve rating v2 by proving identical complete supports, deterministic logical steps, traces and summaries on fixed boards. If implementation would require changing those semantics, it is outside this approved direction and must be separated rather than silently relabelled as an optimization.

The public puzzle, assessment and Worker envelope formats stay intact. Engine metrics/exhaustion types may be extended for the specified diagnostics and causes; update their callers and runtime boundaries deliberately. Input limits remain exactly the existing three validated fields. Stored daily attempts and restored sessions never invoke the new generator or reassess their facts.

## Verification and release gates

Use fixed seeds and independent expected facts. Observe failing regressions before implementing each changed behavior. Do not test a new solver by using its own output as the uniqueness oracle.

Required contract coverage includes target-screen/full-grade equivalence; stopping at the requested policy; correct stalled/invalid/inconclusive distinctions; frontier ownership and novelty; every edit retaining the known solution; exact acceptance and variant necessity; shared work across retries/preparation; distinct exhaustion causes; trail restoration after success/failure/exhaustion; catalogue/enumerator support equivalence; fixed-digit and Arrow-repeat cases; large-cage fallback; and evidence/solution ownership.

Preserve an immutable local v9 baseline before edits and record source hashes. Compare old and new algorithms under identical construction identities, seed text and unchanged limits; a version-induced random-stream change is not algorithm evidence.

The paired release suite covers:

- The existing 1,216-request corpus: all 19 combinations and 64 fixed seeds.
- The existing additional 128 Expert and 128 Killer Hard requests used in v9 verification.
- A predeclared `feedback-generation-v1:seed:000..255` sample for Classic Hard, Classic Expert and Killer Hard, evaluated without tuning to individual failures.
- The current remaining v9 Hard seed 058 under its exact diagnostic identity. It must produce a fully valid Hard result within the unchanged limits before claiming this failure resolved. Historical identity overrides stay in local test harnesses, never production dispatch.

Release requires no loss of any previously ready paired request, no independent correctness/diversity failure and an improvement in measured target search effectiveness. Report hit rates, completed-within-layout counts, work by stage, candidate visits, median/p95/worst time and every remaining exhaustion. Investigate repeatable non-target latency regressions rather than trading them away silently. Finite samples do not establish universal success.

Run all TypeScript projects, lint, formatting, unit tests and both root/subpath production builds. Verify actual emitted Workers against independently checked payloads at both deployment roots, including recovered failure inputs and explicit exhaustion. Exercise available Chromium desktop/mobile emulation, WebKit and Firefox runtimes; record unavailable runtimes and distinguish emulation from physical devices.

Run the player flows affected by generation, grading and hint support: free/daily play, cancellation, timeout, deterministic exhaustion, saved-session preservation, hints/evidence, lessons, persistence and backups. Preserve initial failed runs separately from corrected reruns. Complete an independent code review before reporting implementation complete.

## Upstream comparison

The [KSudoku generator](https://github.com/KDE/ksudoku/blob/f73263416601eb9383b8d317b3e515e3c9fafa1d/src/generator/sudokuboard.cpp) uses a 20-cycle ordinary-puzzle limit and accepts difficulty at least as high as requested. Its [Killer construction](https://github.com/KDE/ksudoku/blob/f73263416601eb9383b8d317b3e515e3c9fafa1d/src/generator/mathdokugenerator.cpp) tries cage layouts under size/combination parameters. These differ from exact human-technique matching; they inform construction and preparation, not the acceptance policy.

[HoDoKu](https://github.com/PseudoFish/Hodoku/blob/master/src/generator/BackgroundGenerator.java) separates generated candidates from logical tier filtering and uses much larger background retry limits. [Tdoku](https://github.com/t-dillon/tdoku#generating-puzzles) retains a scored candidate pool and explores clue perturbations; its guess-based objective is not this product's grade. [Solo](https://github.com/chrisboyle/sgtpuzzles/blob/main/app/src/main/jni/solo.c) demonstrates bounded local construction with outer exact-difficulty retries. None establishes that their success rates transfer to this browser runtime and its limits.

The selected design transfers feedback, ownership and prepared computation while retaining this product's strict delivery contract.
