# Internal Assessment Verification

> Historical milestone: the user removed the Node CLI on 2026-10-13. CLI tasks, commands, and parity results below describe the earlier implementation and are no longer current requirements. The retained boundary suite now lives in `tests/module-boundaries.test.ts`. See the current README and the CLI-removal plan for active checks.

This is historical Phase A evidence. The user's subsequent continuation removed historical-generation compatibility and approved Phase B; the [current generation report](2026-10-13-sudoku-classic-terminal-diversity.md) records the replacement contracts and results. References below to retained V1 output or an unapproved Phase B draft describe the earlier milestone.

Phase A implements the [approved design](../specs/2026-10-13-sudoku-generation-and-rating-design.md) and [implementation plan](../plans/2026-10-13-sudoku-internal-assessment.md). The rating version is `sudoku-rating-v1`; generation retains `sudoku-v1` and `sudoku-variants-v1`.

## Fixed corpus

The actual built Node CLI assessed all 18 authored fixtures from `tests/fixtures/rating.ts`, then generated each of six types at each of three difficulties with seeds `rating-corpus-01` and `rating-corpus-02`. Each request used default limits: 500 steps per assessment policy, one million shared assessment work units; generation retained 20 layouts, one million search/fallback units, and 500 logical steps. Reports retained normalized requests and raw generation results. Every rated summary agreed with its fixture or generated puzzle type and tier.

| Corpus                               | Requests | Rated | Ungraded | Exhausted | Invalid | Generated | Fallback |
| ------------------------------------ | -------: | ----: | -------: | --------: | ------: | --------: | -------: |
| Authored assessments                 |       18 |    18 |        0 |         0 |       0 |         — |        — |
| Fixed-seed generation and assessment |       36 |    36 |        0 |         0 |       0 |        27 |        9 |

| Workload field              | Authored min–max | Authored mean | Generated min–max | Generated mean |
| --------------------------- | ---------------: | ------------: | ----------------: | -------------: |
| Steps                       |           28–112 |         55.33 |            28–112 |          56.11 |
| Placements                  |            28–67 |         51.00 |             28–67 |          51.22 |
| Eliminations                |             0–45 |          4.33 |              0–45 |           4.89 |
| Explicit candidate removals |            0–148 |         12.72 |             0–148 |          13.67 |
| Variant-evidence steps      |             0–57 |         15.06 |              0–66 |          15.78 |

Diagnostic elapsed times included starting a fresh Node process, reading the file, assessment/generation, and JSON output. On this Windows host, authored requests took 65.24–84.33 ms (mean 74.01 ms); generation requests took 69.84–528.29 ms (mean 159.32 ms). Browser tests were running concurrently. These are adapter observations for this small fixed corpus, not solver-only timings or general difficulty calibration. No timing affects grade, identity, or work limits.

Raw local reports and logs are retained under the ignored `.superpowers/sdd/2026-10-13-sudoku-internal-assessment/` directory because implementation is not yet committed. These reports record the earlier adapter-based validation; current verification exercises the engine and actual production Workers directly.

## Verification scope

The core suite checks independently solved fixtures, successful trace actions, exact count semantics, fresh policy attempts, explicit invalid/ungraded/exhausted outcomes, and summary corruption. All 36 frozen legacy generation outputs remain unchanged. Worker and storage tests check timeout/cancellation, stale replies and dataset reset, independent optional-metadata decoding, stored snapshots, and unchanged daily eligibility.

The browser conformance suite compares actual Node CLI reports with real emitted worker assets for all 18 fixtures plus complete, ungraded, exhausted, and conflicting-givens cases. It repeats all six types with explicit limits at `/sudoku/`, checks generation sidecars at both roots, and exercises generated/legacy/unsupported stored metadata. The existing player suites cover hints, lessons, game controls, daily play, and persistence.

Phase B terminal diversity and `sudoku-v2`, weighted numeric scores, advanced techniques, and player calibration remain follow-up work. A separate [Phase B draft plan](../plans/2026-10-13-sudoku-classic-terminal-diversity.md) defines the next construction, budget, diversity, and daily-release milestone; its implementation and release date are not approved by this delivery.

## Review and final checks

One fresh read-only review found two Important issues and no Critical or Minor issues. The decoder accepted impossible action/evidence totals, and eleven higher-tier fixtures lacked fixed independent deduction witnesses. Both were resolved in one regression-driven fix pass:

- Fifteen corruption cases failed against the original decoder, then passed after validating technique/action relationships, mandatory direct variant evidence, Classic's zero variant evidence, and finite board/assessment bounds. Corrupt metadata becomes unavailable through the shared summary/outcome/sidecar decoders.
- All twelve Medium/Hard fixtures now pin cells, digits, candidate domains, deductions, and their unit or arrow premises. A separate unit/digit-list replay checks those facts without production candidate, detector, or replay helpers. Locked positions, naked/hidden pairs, and the Arrow sum implication are justified independently.

After the fixes, type checking, ESLint, Prettier, and all 529 unit tests across 47 files passed. Production root, `/sudoku/`, and CLI builds passed. The fixed corpus was repeated against the rebuilt CLI: all 54 reports matched the earlier normalized requests, raw generation results, and compact assessments exactly, excluding diagnostic timings.

The initial combined `pnpm check` did not pass: its browser stage recorded 363 passes, two expected skips, and seven failures. A closing-menu viewport sample was made retrying after the unchanged isolated test passed three times; application layout was unchanged. WebKit timeout/conformance paths passed in a seven-test serial probe. A complete subsequent run passed 370 tests with two expected desktop-only skips: 278 passes across desktop/mobile/Firefox, then 92 WebKit passes with one Worker.

Final post-review browser verification also passed all 370 tests, with two expected desktop-only skips. Desktop/mobile/Firefox used the configured two Workers and passed 278 tests in 3.8 minutes; WebKit used one Worker and passed 92 tests in 9.1 minutes. The commands were `pnpm test:e2e --project desktop --project mobile --project firefox` and `pnpm test:e2e --project webkit --workers 1`, using the project-local browser cache. These reruns cover every configured project and test after the boundary-validation fixes.

Production timeout remains 15,000 ms, engine limits remain unchanged, and the configured default Playwright concurrency remains two. Serial WebKit evidence does not establish the cause of the earlier parallel failures or prove robustness under parallel host load. Existing jsdom `scrollTo` notices and Vite chunk-size warnings did not fail the checks.

Local Markdown links and `git diff --check` passed. Implementation is complete on `feat/internal-assessment`, based on `4419e71`, and remains uncommitted as requested by the approved implementation plan. The Phase B plan is a draft; no V2 construction or daily-cutover code is included.
