# Generation Efficiency Verification

Date: 2026-10-15. Production selection: prepared rule-context reuse only. Experimental implementations remain outside production dispatch; no commit or push was made.

This is the historical v7 experiment snapshot. The user subsequently selected lightweight grading for production; see the [current v8 release](2026-10-15-lightweight-rating-v8.md). The original measurements below remain unchanged.

## Method and identities

All five modes use `local-product-corpus-v1`, 64 seeds for each of 19 supported type/tier combinations (1,216 requests per mode), Classic `sudoku-v7`, variants `sudoku-variants-v7`, and `sudoku-rating-v2`. Limits remain 40 layouts, 4,000,000 shared work units, and 500 logical steps. There is no authored fallback.

Host: Apple M4 Pro, macOS 27.0.1 (darwin 27.0.0), v26.11.1, pnpm 12.11.2, TypeScript 6.0.3, Vite 8.3.4, Vitest 5.0.3, Playwright 1.64.0. Original and prepared measurements were rerun on this host; Windows timing in the handoff is not used as the performance denominator.

The final Node results were refreshed after the ownership correction below. Each mode warms all combinations, then runs one complete corpus sequentially. Generator timers exclude independent validation. Every delivered puzzle is checked by the independent reference solver, structural rules, rule necessity, full fresh assessment, known-solution trace conclusions, and diversity checks. A separate post-audit regrades every accepted puzzle with production assessment and no overlay. These are local single-pass diagnostics; small differences and isolated tails need repeated measurements before selecting an algorithm.

## Full-corpus outcomes

Times are generator milliseconds across successes and normal exhaustions. Construction work includes all layouts, geometry, searches, and assessment.

| Mode        | Generated / 1,216 | Exhausted | Validation failures | Total ms | Median ms | p95 ms | Max ms | Work        | Time vs prepared | Work vs prepared |
| ----------- | ----------------- | --------- | ------------------- | -------- | --------- | ------ | ------ | ----------- | ---------------- | ---------------- |
| baseline    | 1214              | 2         | 0                   | 75,965.2 | 27.7      | 224.3  | 707.2  | 139,351,534 | +86.7%           | 0.0%             |
| prepared    | 1214              | 2         | 0                   | 40,689.6 | 13.1      | 126    | 358    | 139,351,534 | 0.0%             | 0.0%             |
| grading     | 1214              | 2         | 0                   | 36,806.2 | 11.4      | 113.2  | 290.6  | 140,250,437 | -9.5%            | +0.6%            |
| decisions   | 1212              | 4         | 0                   | 35,769.9 | 10.6      | 115.9  | 352.8  | 148,037,749 | -12.1%           | +6.2%            |
| alternative | 1214              | 2         | 0                   | 38,889.6 | 12.3      | 121.9  | 280.5  | 137,987,988 | -4.4%            | -1.0%            |

Prepared reduces measured total Node generator time by 46.4% relative to original. All 1,216 complete result fingerprints match the original, including the two exhaustion outcomes and all 139,351,534 charged work units. The original macOS fingerprints also match the preserved Windows baseline.

## Source snapshots

The machine-readable results include effective engine source SHA-256 fingerprints and per-file hashes for each mode. Original sources include the pre-change clue-evidence implementation; prepared and experimental sources include the reviewed ownership correction. The pre-review results remain local under `results/pre-review/` and are not the denominator of the final table.

## Per-combination diagnostics

Each cell is **generated count / total generator ms / charged work** for 64 requests.

| Combination     | Original                  | Prepared                  | Lighter grading           | Decision clues            | Alternative search        |
| --------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| classic/easy    | 64 / 746.2 / 477,160      | 64 / 215 / 477,160        | 64 / 200.5 / 477,160      | 64 / 104.3 / 235,058      | 64 / 201.4 / 478,838      |
| classic/medium  | 64 / 3,475.6 / 3,812,533  | 64 / 1,354.3 / 3,812,533  | 64 / 1,270.1 / 3,812,533  | 64 / 1,310.4 / 4,402,372  | 64 / 1,283.6 / 3,740,530  |
| classic/hard    | 64 / 9,721.2 / 11,564,324 | 64 / 3,925.3 / 11,564,324 | 64 / 3,704.8 / 11,564,324 | 61 / 2,983.4 / 10,406,988 | 64 / 3,671.5 / 11,323,282 |
| classic/expert  | 63 / 6,355 / 7,774,819    | 63 / 3,416.7 / 7,774,819  | 63 / 2,593.7 / 7,774,819  | 64 / 2,923.4 / 9,816,276  | 63 / 2,562 / 7,625,202    |
| diagonal/easy   | 64 / 857.1 / 699,657      | 64 / 389.3 / 699,657      | 64 / 349 / 699,657        | 64 / 65.5 / 62,537        | 64 / 345.1 / 702,122      |
| diagonal/medium | 64 / 2,703.9 / 2,187,127  | 64 / 1,478.1 / 2,187,127  | 64 / 1,175.8 / 2,187,127  | 64 / 995.3 / 1,858,885    | 64 / 1,338 / 2,131,254    |
| diagonal/hard   | 64 / 6,653.6 / 6,463,832  | 64 / 3,679.4 / 6,463,832  | 64 / 3,183.5 / 6,463,832  | 64 / 2,186.4 / 4,431,787  | 64 / 3,485.1 / 6,192,377  |
| jigsaw/easy     | 64 / 1,810 / 1,659,276    | 64 / 998.5 / 1,659,276    | 64 / 986.9 / 1,659,276    | 64 / 557.3 / 727,749      | 64 / 954.4 / 1,646,060    |
| jigsaw/medium   | 64 / 3,693 / 3,050,942    | 64 / 1,935.6 / 3,050,942  | 64 / 1,737.8 / 3,050,942  | 64 / 1,369.8 / 2,308,405  | 64 / 1,848.1 / 2,983,335  |
| jigsaw/hard     | 64 / 9,512.3 / 8,309,861  | 64 / 5,028.1 / 8,309,861  | 64 / 4,409.9 / 8,309,861  | 64 / 5,862.8 / 10,131,583 | 64 / 4,886.6 / 8,104,620  |
| killer/easy     | 64 / 1,034.9 / 1,427,555  | 64 / 405.5 / 1,427,555    | 64 / 404.7 / 1,427,555    | 64 / 187.6 / 1,192,066    | 64 / 394.6 / 1,430,062    |
| killer/medium   | 64 / 1,870.1 / 3,103,529  | 64 / 855.4 / 3,103,529    | 64 / 741.6 / 3,103,529    | 64 / 569.3 / 2,978,218    | 64 / 814.3 / 3,107,151    |
| killer/hard     | 63 / 6,229.4 / 63,291,189 | 63 / 5,786 / 63,291,189   | 63 / 5,819.4 / 64,190,092 | 63 / 6,412.6 / 74,395,542 | 63 / 5,927.1 / 63,291,513 |
| thermo/easy     | 64 / 968.8 / 997,897      | 64 / 416.6 / 997,897      | 64 / 438.3 / 997,897      | 64 / 139.3 / 311,608      | 64 / 402.9 / 999,121      |
| thermo/medium   | 64 / 4,947.5 / 6,143,986  | 64 / 2,518 / 6,143,986    | 64 / 2,315 / 6,143,986    | 64 / 2,078.9 / 5,572,489  | 64 / 2,569.9 / 6,059,613  |
| thermo/hard     | 64 / 6,612.9 / 8,454,632  | 64 / 3,434.7 / 8,454,632  | 64 / 3,077.9 / 8,454,632  | 64 / 3,044.4 / 8,419,272  | 64 / 3,420.5 / 8,352,295  |
| arrow/easy      | 64 / 1,278.2 / 1,431,969  | 64 / 616.9 / 1,431,969    | 64 / 594.3 / 1,431,969    | 64 / 806.1 / 1,972,795    | 64 / 595.9 / 1,428,356    |
| arrow/medium    | 64 / 1,054.6 / 733,624    | 64 / 442.2 / 733,624      | 64 / 347.5 / 733,624      | 64 / 174.1 / 306,002      | 64 / 416.2 / 736,203      |
| arrow/hard      | 64 / 6,440.7 / 7,767,622  | 64 / 3,794.1 / 7,767,622  | 64 / 3,455.4 / 7,767,622  | 64 / 3,999.1 / 8,508,117  | 64 / 3,772.5 / 7,656,054  |

## What the experiments actually change

**Lighter grading:** `screen` classifies with the same validated board and logical policy workflow, and owns a deferred completion closure. Matching candidates still replay the successful trace to produce the full summary. Killer Hard runs its Easy prefix once rather than through a separate precheck and later assessment. Validation before that workflow charges arithmetic conflict work on states that the old cheap Easy precheck would have rejected; saved work and total work therefore need not move in the same direction. The screening result never fabricates workload statistics.

**Terminal decision clues:** retain genuine choices from the successful terminal path, undo failed decisions, and keep the Jigsaw prefilled unit as assumptions. Verify the initial skeleton under final geometry and skip already-empty cells after the unchanged seeded shuffle. An initial complete corpus revealed Jigsaw Hard seed 009: post-terminal region exchanges invalidated the original skeleton uniqueness proof. That attempt safely returned failure without a puzzle. The regression was observed RED, fixed to retry nonunique final geometry, then observed GREEN; the original rejected corpus is retained locally. The table uses the corrected complete rerun.

**Known-solution uniqueness:** validate the known completion and require a globally different completion, with bounded blocking-clause propagation and explicit invalid/exhausted outcomes. This uses the general exclusion for every removal, including Killer Hard tentative states. It does not use a removed-cell-only restriction or assume that the previous board was unique. Ordinary counting remains available for variant necessity.

| Experiment  | Puzzle/assessment payload changes vs prepared | Work-count changes | Faster input timings | Slower input timings |
| ----------- | --------------------------------------------- | ------------------ | -------------------- | -------------------- |
| grading     | 0                                             | 63                 | 1058                 | 158                  |
| decisions   | 1211                                          | 1216               | 868                  | 348                  |
| alternative | 0                                             | 1215               | 1003                 | 213                  |

Faster/slower counts are individual single-pass observations, including outcomes that changed, not evidence of paired quality equivalence. Experimental seed outputs stay labelled v7 solely to keep streams identical for comparison; selecting a behavior-changing experiment for production requires a separate generation-version decision and release validation.

## Actual browser Workers

Each mode builds its own real Worker assets for `/` and `/sudoku/`. Inputs include the mode-specific slowest request in every combination, the corresponding prepared slow representative for paired comparison, and a mode exhaustion representative when present. Every response is checked against its independently validated Node puzzle and complete assessment. Timers include fresh Worker startup; the page counts animation frames during computation. Chromium mobile and WebKit mobile are emulation on this host, not physical-device measurements.

| Mode        | Project | Browser version | Checks across both roots | Median ms | p95 ms | Max ms | At least 3,000 ms | Payload failures |
| ----------- | ------- | --------------- | ------------------------ | --------- | ------ | ------ | ----------------- | ---------------- |
| baseline    | desktop | 156.0.8078.4    | 54                       | 220.9     | 586.4  | 674.5  | 0                 | 0                |
| baseline    | mobile  | 156.0.8078.4    | 54                       | 211.6     | 579.4  | 692.6  | 0                 | 0                |
| baseline    | firefox | Unavailable     | 0                        | -         | -      | -      | 0                 | 0                |
| baseline    | webkit  | 27.2            | 54                       | 257       | 824    | 956    | 0                 | 0                |
| prepared    | desktop | 156.0.8078.4    | 40                       | 153.1     | 300    | 307.4  | 0                 | 0                |
| prepared    | mobile  | 156.0.8078.4    | 40                       | 154       | 302.9  | 325.5  | 0                 | 0                |
| prepared    | firefox | Unavailable     | 0                        | -         | -      | -      | 0                 | 0                |
| prepared    | webkit  | 27.2            | 40                       | 206       | 437    | 442    | 0                 | 0                |
| grading     | desktop | 156.0.8078.4    | 48                       | 116.8     | 287.9  | 312.5  | 0                 | 0                |
| grading     | mobile  | 156.0.8078.4    | 48                       | 124.7     | 293    | 297    | 0                 | 0                |
| grading     | firefox | Unavailable     | 0                        | -         | -      | -      | 0                 | 0                |
| grading     | webkit  | 27.2            | 48                       | 122       | 408    | 433    | 0                 | 0                |
| decisions   | desktop | 156.0.8078.4    | 78                       | 80.1      | 302.9  | 387.6  | 0                 | 0                |
| decisions   | mobile  | 156.0.8078.4    | 78                       | 84.7      | 303.5  | 379.1  | 0                 | 0                |
| decisions   | firefox | Unavailable     | 0                        | -         | -      | -      | 0                 | 0                |
| decisions   | webkit  | 27.2            | 78                       | 106       | 456    | 523    | 0                 | 0                |
| alternative | desktop | 156.0.8078.4    | 46                       | 151.3     | 295.4  | 299.7  | 0                 | 0                |
| alternative | mobile  | 156.0.8078.4    | 46                       | 152.4     | 289.4  | 296.8  | 0                 | 0                |
| alternative | firefox | Unavailable     | 0                        | -         | -      | -      | 0                 | 0                |
| alternative | webkit  | 27.2            | 46                       | 185       | 423    | 433    | 0                 | 0                |

The table above summarizes each mode selection, which can contain different additional slow inputs. The following totals compare only exactly shared browser inputs (same project, root, type/tier, and seed). Decision-clue outcomes can change even for a shared input, so those timings do not imply equivalent acceptance quality.

| Mode        | Matched browser requests | Prepared total ms | Mode total ms | Time vs prepared | Outcome changes |
| ----------- | ------------------------ | ----------------- | ------------- | ---------------- | --------------- |
| baseline    | 120                      | 20,920.3          | 33,865.8      | +61.9%           | 0               |
| prepared    | 120                      | 20,920.3          | 20,920.3      | 0.0%             | 0               |
| grading     | 120                      | 20,920.3          | 19,926.3      | -4.8%            | 0               |
| decisions   | 114                      | 18,984.5          | 7,763.1       | -59.1%           | 6               |
| alternative | 120                      | 20,920.3          | 20,472.3      | -2.1%            | 0               |

All 798 final Worker comparisons had matching payloads and finished below three seconds. Every request lasting more than 100 ms recorded page animation frames during Worker computation.

Firefox 157.0 was downloaded, but every launch failed before any test with `Could not find profile folder`, under both ordinary and repository-local profiles. Chromium 156.0.8078.4 and WebKit 27.2 ran successfully. The failure matches the reported macOS 27 app-data protection issue; that is an inference from matching symptoms and host version, not an independently confirmed TCC diagnosis. See [Playwright issue 42768](https://github.com/microsoft/playwright/issues/42768) and [Mozilla bug 2062988](https://bugzilla.mozilla.org/show_bug.cgi?id=2062988). No privacy grants, user browser data, or browser branding were changed. Firefox is unavailable and unverified, not a passed project.

## Release evidence

All checks below ran on the corrected production source.

- All four TypeScript projects passed: app `vue-tsc`, Node, Worker, and E2E `tsc`.
- ESLint and the complete Prettier check passed.
- Unit suite: 63 files, 792 tests passed. The focused ownership/rating/variant runs passed 155 tests; the four new ownership cases were observed RED first.
- All three experimental focused suites and strict engine typechecks passed: grading 20 tests, decisions two tests (including 24 independent terminal fixtures), alternative 20 tests.
- Production root and `/sudoku/` builds passed. The existing application chunk-size advisory remains.
- Available player projects: Chromium desktop/mobile and WebKit mobile, 337 passed, two intentional project skips, zero failures in 4.9 minutes. These cover actual Workers at both roots, keyboard/touch/hints, all 32 lessons, daily play, persistence/restoration, cancellation, three-second transport timeout, save-preserving exhaustion, backup and completion. Firefox player flows could not run because its runtime cannot launch.
- All five complete corrected corpora passed independent validation and diversity checks. The additional no-overlay production assessment audit matched all 6,068 accepted puzzles.
- One independent read-only review found the evidence-ownership P2 fixed below and no other actionable findings. The review artifact remains the pre-fix report; subsequent validation is stated separately.

## Independent review and ownership correction

One independent read-only final review found a P2 alias: returned Thermo paths, Arrow shafts and cage cells could reference the cached prepared geometry. Mutating that evidence could corrupt later assessments. Four regressions were observed RED, then GREEN after `variantTechniques.clueEvidence` copied geometry and digit arrays at creation; nested unit premises are included in the mutation traversal. The focused 155-test run and complete 792-test suite passed. All corpus and browser figures in this report were refreshed after the correction. The reviewer found no other actionable issues; its preserved report covers the pre-fix snapshot and is not a claimed post-fix review approval.

## Decision and limits

Keep prepared context reuse in production. It preserves all measured outputs and work while removing repeated geometry compilation. The three experiments remain independent evaluation artifacts; time improvements alone do not justify a success-rate regression or a generation-identity change. No browser ceiling measurement establishes performance on every device.

## Reproduction and artifacts

[Machine-readable comparison](2026-10-15-generation-efficiency.json) contains all combinations, every measured input/status/fingerprint/work count, paired changes, and browser records. The preserved baseline, independent overlay sources, RED/GREEN logs, full puzzle payloads, build outputs, corpus runner, browser runner, and ledger remain under `.superpowers/generation-efficiency-implementation/`. This is ignored scratch carried by the handoff, not a new production CLI.

```sh
node .superpowers/generation-efficiency-implementation/corpus-runner.mjs baseline
node .superpowers/generation-efficiency-implementation/corpus-runner.mjs prepared
node .superpowers/generation-efficiency-implementation/corpus-runner.mjs grading
node .superpowers/generation-efficiency-implementation/corpus-runner.mjs decisions
node .superpowers/generation-efficiency-implementation/corpus-runner.mjs alternative
node .superpowers/generation-efficiency-implementation/reassessment-audit.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/.superpowers/playwright-browsers" pnpm exec playwright install --no-remove chromium firefox webkit
sh .superpowers/generation-efficiency-implementation/browser-matrix.sh
```
