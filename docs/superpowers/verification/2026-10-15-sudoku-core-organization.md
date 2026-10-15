# Sudoku Core Organization Verification

Date: 2026-10-15

Status: Verified local refactor; one nonblocking documentation minor is deferred.

## Scope and identity

The behavior-preserving refactor starts at `dbcb83e746df397c93a2b807cd34a316de7713f6` and the implementation is committed through `998478d`. Rule definitions, arithmetic support, exact search, human deductions, assessment and generation now have explicit owners. Stored-puzzle validation belongs to `puzzle.ts`; Chinese technique explanations belong to the game presentation model. No old-path forwarding modules remain.

Versions remain `sudoku-v10`, `sudoku-variants-v10` and `sudoku-rating-v2`. Generation limits remain 40 layouts, 4,000,000 work units and 500 logical steps, with the existing three-second transport deadline. The refactor changes no stored/Worker shape or player-facing copy.

See the [design](../specs/2026-10-15-sudoku-core-organization-design.md), [implementation plan](../plans/2026-10-15-sudoku-core-organization.md) and [original v10 correctness evidence](2026-10-15-feedback-guided-generation.md).

## Completed checks

- Baseline: 892 unit tests across 71 files, all passing.
- Refactored source: 1,006 unit tests across 78 files, all passing. The 114 added cases cover shared guards and dependency enforcement; existing behavior assertions remain.
- All four TypeScript projects, whole-repository ESLint and Prettier checks pass.
- Static and literal dynamic imports reject forbidden upward dependencies; the actual production engine runtime import graph is acyclic. Framework/browser restrictions and legitimate test fixtures remain covered.
- Root and `/sudoku/` builds pass and emit the same Worker asset for both roots (`sudoku.worker-CwMyxI4w.js`, 58.27 kB). Existing main-chunk size warnings remain.
- The frozen baseline matches all 2,241 historical generation-result fingerprints. The comparison harness rejects a deliberately corrupted expected fingerprint.
- All 39 fixed old/new contracts match, covering authored full rating traces and caller work, hints, zero/interrupted/exact outcomes and saved-summary absence/error distinctions.

All 2,241 current generation results and all 2,241 generated-board full rating results/traces/work match frozen v10. The production source fingerprint is `874a462db763ef6a3d0019badf35106b253d6e0c7f60614d259a03828a35df80` across 58 files. The [machine-readable manifest](2026-10-15-sudoku-core-organization.json) retains per-case identities and fingerprints, source manifests and oracle hashes.

## Comparison method

The private harness freezes committed production sources and authored fixture sources with per-file SHA-256 hashes. Frozen aliases resolve only to frozen source; current entry points resolve to their new owners. No generation-version overlay or algorithm modification is applied.

For each request, compare input identity, the complete generation result, its SHA-256 fingerprint and the puzzle/assessment payload hash against the immutable v10 corpus. Complete equality includes work by stage, construction work, layout/candidate counts and exhaustion causes. For every ready board, compare full standalone and caller-budget rating results/traces against frozen v10 and compare consumed caller work. Elapsed time is not a deterministic equality field.

| Suite                                 | Requests | Baseline reproduction | Final current comparison |
| ------------------------------------- | -------: | --------------------- | ------------------------ |
| Full, 19 supported combinations       |    1,216 | Passed                | Passed                   |
| Targeted Classic Expert / Killer Hard |      256 | Passed                | Passed                   |
| Predeclared feedback seeds            |      768 | Passed                | Passed                   |
| Classic Hard recovery seed 058        |        1 | Passed                | Passed                   |

Independent uniqueness, structure, rule necessity and diversity evidence from the v10 report is reused only for payloads proven identical. These checks are not claimed as independently rerun for all 2,241 rows. Existing unit and emitted-Worker tests continue their independent puzzle/proof checks.

## Browser verification

The full suite passed 337 player tests across Chromium desktop (113), Chromium mobile emulation (112) and WebKit touch emulation (112). Two physical-keyboard-only layout cases are intentionally skipped on the two touch projects. All 33 Worker-suite cases pass across these runtimes, exercising actual emitted assets at `/` and `/sudoku/`, current identities and evidence, regional recovery, the slowest observed requests and the unchanged three-second generation deadline. Game, hints, lessons, persistence, daily history and backup flows pass.

Playwright is 1.64.0; Chromium is 156.0.8078.4 / revision 1248 and WebKit is 27.2 / revision 2370. The missing pinned WebKit/Firefox runtimes were installed for verification. A fresh Firefox 157.0 / revision 1555 Worker-suite launch fails before application execution with `Could not find profile folder`; Firefox is unavailable on this host, with no passed application cases. Mobile/touch projects are emulation, not physical-device validation.

## Execution decisions

- The native worktree was created but filesystem writes were sandbox-blocked. Work continued in the original checkout on `refactor/sudoku-core-organization`; main remains at the baseline. This provides branch isolation with weaker filesystem isolation.
- Existing contract tests govern behavior-preserving moves; RED/GREEN applies to the new guards and enforced boundaries, following repository guidance. Uncovered behavior additionally relies on frozen whole-result comparisons.
- Two existing candidate-position/peer-collision predicates moved to `logic/patternFacts.ts` because both discovery and independent proof validation use them. This adds one small internal module without changing the proof algorithm.

## Independent review

One fresh read-only reviewer compared 315 baseline declarations with their new owners and independently checked all 58 current sources, 42 committed baseline sources and 2,241 generation/full-assessment pairs. No algorithm, seeded ordering, work pricing, serialized shape or Chinese-copy changes were found. No behavior was declined as outside scope.

The review found one development-check defect: the rule-definition policy omitted the test exemption used by other production policies. Commit `c53868a` adds it. Six static/dynamic context, registry and external-fixture cases failed before the fix while 152 existing cases passed; afterward all 158 boundary cases and the whole 1,006-test suite pass. Four type projects, lint and format also pass after the fix. Production sources/bundles are unchanged by this lint-only correction; the complete source/evidence audit still passes, so corpus and browser runs remain applicable.

Deferred minor: `src/core/sudoku/logic/evidence.ts:3–4` has two adjacent equivalent ownership JSDoc comments. This has no runtime impact and remains recorded under the Native workflow. There are no remaining Critical or Important findings.
