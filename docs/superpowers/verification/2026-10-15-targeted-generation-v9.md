# Targeted Generation v9 Verification

Date: 2026-10-15. Baseline: `b73cc61` (lightweight trial grading v8). User approved the [research-backed design](2026-10-15-targeted-generation-research.md) and requested better Classic Expert and Killer Hard success without increasing budgets. Implementation is verified and left uncommitted.

## Implemented behavior

Classic Expert first runs the existing greedy deletion path. On a miss, it retains an owned unique Hard checkpoint and explores at most two nearby clue masks per terminal: add two solution-consistent givens, then remove other givens in seeded order. Exact uniqueness and the unchanged logical oracle gate every retained removal. Delivery requires the complete matching Expert assessment and the existing 28-clue target. A separate per-layout refinement stream preserves later ordinary terminal/removal ordering on a miss; all proposal, search and grading work stays in the original request allowance.

Killer logical workspaces keep one owned complete exact support snapshot per cage. Reuse requires the same compiled context, cells, sum and effective local domains, including fixed digits. Each constraint visit remains charged; only repeated enumeration is avoided. Incomplete support is never cached. Snapshots do not cross trial boards, changed domains trigger enumeration, and raw constraint support/exact search retain their existing behavior. Returned evidence cannot mutate the memo.

Current generation identities are `sudoku-v9` and `sudoku-variants-v9`. Rating stays `sudoku-rating-v2`, with unchanged technique order, trace, workload definitions, exact uniqueness and variant-necessity gates. Limits stay **40 layouts, 4,000,000 shared work units, 500 steps and 3,000 ms generation transport**. There is no authored fallback, downgrade or historical production dispatcher. Saved boards/assessments, formal daily IDs and eligibility retain precedence.

## Same-version paired results

Control uses frozen baseline algorithms with the same v9 identities and seed strings as production. This isolates the algorithm from a version-induced random-stream change. The full fixed corpus covers all 19 combinations × 64 seeds (1,216 requests); an additional `targeted-release-v1` sample adds 128 Expert and 128 Killer Hard requests. Every delivery passed independent structure, exact uniqueness, meaningful variant-rule and known-solution trace checks, plus fresh complete reassessment. Timers exclude validation. These are fixed development samples and single-pass host timings, not statistical or universal success claims.

| Sample     | Type           | Control ready | Production ready | Control work | Production work | Control terminals | Production terminals |
| ---------- | -------------- | ------------- | ---------------- | ------------ | --------------- | ----------------- | -------------------- |
| corpus     | classic/expert | 64/64         | 64/64            | 7,171,320    | 7,358,014       | 314               | 298                  |
| corpus     | killer/hard    | 64/64         | 64/64            | 67,520,859   | 28,585,282      | 85                | 85                   |
| additional | classic/expert | 128/128       | 128/128          | 14,811,780   | 14,897,628      | 659               | 614                  |
| additional | killer/hard    | 127/128       | 128/128          | 126,495,291  | 57,194,565      | 169               | 169                  |

Across the 192 inputs for each target, Expert preserves **192/192** successes and reduces terminal attempts **973 → 912 (6.3%)**, with no per-input terminal regression. Charged work increases **1.24%**; this is an earlier-hit improvement, not a general cost reduction. The regression seed `local-product-corpus-v1:seed:005` needs eight ordinary terminals in control and three with refinement; a three-layout control run was observed failing before the production regression passed.

Killer Hard improves **191/192 → 192/192**, with aggregate work **194,016,150 → 85,779,847 (55.8% less)**. Every previously ready Killer puzzle and complete assessment remains identical, with no work increase (319 ready Easy/Medium/Hard pairs across the two samples). All 1088 non-target payload pairs remain identical. No previously successful request becomes exhausted.

The full corpus remains **1215/1,216 ready**, with no independent-validation or diversity failure. The sole remaining exhaustion is unchanged in same-v9 control: Classic Hard `local-product-corpus-v1:seed:058`, 40 layouts / 900,009 work. The targeted algorithms do not change that tier. Finite generation still reports exhaustion without a replacement puzzle. The repository static slow/exhaustion fixtures were refreshed from these current measurements.

## Original two failures

A diagnostic-only v7 identity override reproduces the exact original serialized failures, then exercises the final algorithms under those same historical random identities. This is absent from production dispatch. Expert seed 010 changes from 40 layouts / 852,527 work exhausted to **27 layouts / 716,461 work ready**. Killer Hard seed 059 changes from 3 layouts / 4,000,000 work exhausted to **3 layouts / 1,552,516 work ready**. Both delivered boards pass independent uniqueness and complete matching reassessment. Their success therefore does not rely on increasing limits or merely changing to v9 seed identities.

## Verification and limits

- **824 unit tests / 65 files passed**, all four TypeScript projects, lint, formatting, root build and `/sudoku/` build passed.
- **258 paired real Worker checks passed** across Chromium desktop, Chromium mobile emulation and WebKit at both deployment roots. Responses match independently checked Node puzzle/assessment payloads, exhausted responses expose no puzzle, and every observed Worker duration is below three seconds; maximum **453.0 ms**. Control and production have separate builds and reports.
- **All 337 distinct available player E2E cases are verified**, with 2 intentional platform skips. The initial full run had 334 passes and 3 test-locator failures: the updated Classic choice used `经典数独` instead of the actual `标准数独`, so it stalled before generation. Corrected the test label and reran the complete generation-loading and Worker files: **45/45 passed** (12 loading and 33 Worker cases) across the three available projects. The Worker regression now directly exercises the recovered Killer Hard `targeted-release-v1:seed:005` at both roots, with exact independently verified payloads and a three-second assertion. The initial full run is retained as a failed run; no clean full-run claim is made. Coverage includes generation loading/cancellation, timeout/retry, deterministic exhaustion preserving the old paused save, daily and free play, hints, lessons, storage/backup, keyboard/touch and root/subpath Workers.
- One independent read-only review found no actionable issue. Regressions cover unchanged support reuse, domain/fixed-digit/context/geometry/sum invalidation, incomplete enumeration, workspace and returned-evidence ownership, exact Expert delivery and refinement work/step exhaustion.

Firefox remains unavailable at browser startup on this macOS host (`Could not find profile folder`), so it is explicitly unverified. Mobile browser configurations are emulation, not physical-device tests. The observed times are local measurements, not a promise for every browser/device or seed. Existing Vite chunk-size advisories remain unrelated to this engine change.

The first same-v9 shared-stream Expert prototype increased total terminal attempts in the initial 64-seed sample (314 → 346), because local swaps changed subsequent terminal randomness. It was replaced by the separate per-layout stream before final verification. Raw abandoned-probe results are retained under `.superpowers/targeted-generation-release/results/shared-stream-v9*.json`; they are not mixed into the selected results.

Machine-readable paired outcomes, source hashes, aggregate measurements and browser records are in [the verification JSON](2026-10-15-targeted-generation-v9.json). Raw results/logs and the read-only review remain under `.superpowers/targeted-generation-release/`. The completed `HANDOFF.md` stays deleted. No commit or push was requested for this change.
