# Generation Without Fallback

Date: 2026-10-14. The user requested explicit generation failure instead of authored fallback puzzles. Current identities are `sudoku-v7` and `sudoku-variants-v7`; assessment remains `sudoku-rating-v2`. The [three-second generation report](2026-10-14-three-second-generation.md) describes the preceding v6 implementation and retains its historical measurements.

## Behavior and contract

Every delivered puzzle must be freshly constructed, independently unique, graded at the requested tier and meaningful under its variant rules. Both generators return construction exhaustion when their work, layout or logical-step allowance cannot produce such a candidate. They return no puzzle or assessment in that case. The sole ready source is `generated`; authored substitution and its transformation/validation path are removed.

Generation limits have exactly `{ maxLayouts: 40, maxWork: 4000000, maxSteps: 500 }`. Diagnostics report only `constructionWork` and `layouts`; removed fallback fields are rejected by the runtime limit decoder. All abandoned work remains in the same request budget.

The Worker reports a validated `budget-exhausted` outcome. The player sees a Chinese error, keeps the existing paused game and saved puzzle, and can make a new selection. Deterministic exhaustion does not offer identical-input retry. Timeout and transport failures continue to support identical retry; the generation request deadline remains three seconds. Idle Worker preparation, cancellation and disposal are unchanged.

Classic authored grading boards now live in `tests/fixtures/classicPuzzles.ts`, outside production source. Variant examples still support teaching, independent grading and regional layout presets; their authored givens and solutions cannot replace a failed generation request. Old saved boards, assessment snapshots, result facts and formal daily identities remain authoritative.

## Complete fixed-seed corpus

The v7 corpus contains 64 fixed seeds for each of 19 type/tier combinations: 1,216 requests. It delivered 1,214 fresh puzzles and returned 2 explicit construction errors; there were no unexpected failures or authored substitutions. Every delivered puzzle passed independent uniqueness, geometry/necessity checks and complete logical trace replay. Each type/tier still has fresh successful examples. The [machine-readable report](2026-10-14-generation-without-fallback-corpus.json) retains identities, budgets, host details, all group summaries and the exhausted cases.

| Type / tier       | Fresh / 64 | Explicit error / 64 | Maximum generator ms |
| ----------------- | ---------- | ------------------- | -------------------- |
| classic / easy    | 64         | 0                   | 25.7                 |
| classic / medium  | 64         | 0                   | 281.8                |
| classic / hard    | 64         | 0                   | 837.8                |
| classic / expert  | 63         | 1                   | 869.8                |
| diagonal / easy   | 64         | 0                   | 26.5                 |
| diagonal / medium | 64         | 0                   | 264.9                |
| diagonal / hard   | 64         | 0                   | 463.1                |
| jigsaw / easy     | 64         | 0                   | 144.6                |
| jigsaw / medium   | 64         | 0                   | 271.4                |
| jigsaw / hard     | 64         | 0                   | 565.1                |
| killer / easy     | 64         | 0                   | 31.7                 |
| killer / medium   | 64         | 0                   | 58.9                 |
| killer / hard     | 63         | 1                   | 468.8                |
| thermo / easy     | 64         | 0                   | 42.9                 |
| thermo / medium   | 64         | 0                   | 409.3                |
| thermo / hard     | 64         | 0                   | 576.1                |
| arrow / easy      | 64         | 0                   | 138.0                |
| arrow / medium    | 64         | 0                   | 30.5                 |
| arrow / hard      | 64         | 0                   | 672.3                |

The exhausted requests were Classic Expert seed 010, which used all 40 layouts and 852,527 work units, and Killer Hard seed 059, which used all 4,000,000 work units after 3 layouts. Neither result contains a puzzle or assessment. These same requests exercise real Worker errors at both deployment roots; the Expert case also exercises the visible game error and preservation of an existing save.

The host was Windows `10.0.26300`, `Intel(R) Core(TM) Ultra 9 285K` and Node.js `v26.10.0`. The full corpus test took 213.69 seconds, including independent verification. Generator-only maximum was 869.8 ms, median 37.3 ms and p95 290.4 ms. These are local measurements, not universal device or arbitrary-seed guarantees. V7 changes the seed identity; these results are not a paired regression comparison with v6.

## Production Worker timing

The slowest observed request from each of the 19 groups was measured at both deployment roots in every browser project: 152 requests, including explicit exhaustion for the Expert group. Every request completed or reported its construction error in under 3,000 ms. Another 16 real Worker requests independently checked both natural exhausted seeds at both roots without any puzzle or assessment payload.

| Project | Browser version | Measured requests | Maximum ms |
| ------- | --------------- | ----------------- | ---------- |
| desktop | 156.0.8078.4    | 38                | 630.6      |
| mobile  | 156.0.8078.4    | 38                | 616.5      |
| firefox | 157.0           | 38                | 1063.2     |
| webkit  | 27.2            | 38                | 1070.7     |

These timings include Worker initialization and transport, use one Playwright worker and mobile emulation, and do not claim physical-device or arbitrary-seed guarantees. Runtime termination continues to cap generation requests and preserve the existing save.

## Verification

New regressions failed under the previous implementation: 59 failures covered all 19 type/tier combinations at layout/work/logical-step limits, construction diagnostics and the player's save-preserving failure. The construction-only implementation passes those regressions, and the complete unit suite passes 765 tests in 62 files. All four TypeScript projects, ESLint, Prettier, root/subpath production builds and diff checks pass. Local document links were checked.

The full fixed-seed corpus passed 19 groups. All 124 targeted browser checks passed across Chromium desktop/mobile, Firefox and WebKit, including production Worker delivery and errors at both roots, actual Chinese exhaustion feedback, paused-save preservation, normal starts, daily and Expert play, cancellation, timeout and transient retry. Successful opening smoke tests now use a known seed instead of assuming arbitrary requests always succeed. Every ready corpus result is checked with independent uniqueness, structural and necessity oracles plus complete logical trace replay. Explicit exhaustion is validated separately and cannot be counted as generated success.

The independent read-only review found no substantive issues. Its 61 additional boundary checks covered zero-work/layout outcomes across every supported type/tier, Worker error decoding and exact limit-field validation, without performing construction work.
