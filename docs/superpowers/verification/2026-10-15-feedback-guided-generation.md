# Feedback Guided Generation Verification

Date: 2026-10-15

This local release keeps 40 layouts, 4,000,000 shared work units, 500 logical steps and the 3,000 ms generation deadline. Rating remains `sudoku-rating-v2`; puzzle, assessment, Worker, daily, database and backup formats remain unchanged.

## Algorithm comparison under identical v9 identities

Both arms use identical variant/tier/seed/version tuples and limits. Control loads the immutable 32-file v9 snapshot from local baseline commit `69f7aee`. Current-version measurements below are separate and are not evidence from a version-induced seed change.

| Corpus   | Requests | v9 ready | New ready | Previous successes lost |
| -------- | -------: | -------: | --------: | ----------------------: |
| full     |     1216 |     1215 |      1216 |                       0 |
| targeted |      256 |      256 |       256 |                       0 |
| hard058  |        1 |        0 |         1 |                       0 |
| feedback |      768 |      765 |       768 |                       0 |

The fixed feedback sample uses `feedback-generation-v1:seed:000..255` for Classic Hard/Expert and Killer Hard. Its individual failures were not used for parameter selection.

## Per-combination native measurements

Times measure generator calls after warmup, excluding independent validation. Baseline stage accounting comes from a separate observed pass whose complete result fingerprints match the native pass; observed-pass timings are not used as performance evidence. Work units have unequal CPU costs and are not time percentages.

| Type/tier       | v9 median / p95 ms | New median / p95 ms |    v9 work |   New work |
| --------------- | -----------------: | ------------------: | ---------: | ---------: |
| classic/easy    |        2.80 / 3.08 |         5.37 / 5.66 |    474,887 |    482,127 |
| classic/medium  |      13.88 / 76.35 |      27.25 / 112.21 |  4,694,487 |  5,306,057 |
| classic/hard    |     42.67 / 196.82 |      50.32 / 185.72 | 12,054,662 | 10,956,340 |
| classic/expert  |      30.11 / 75.45 |      38.50 / 146.96 |  7,358,014 |  7,622,793 |
| diagonal/easy   |        5.12 / 6.91 |        9.41 / 12.33 |    656,800 |  1,627,546 |
| diagonal/medium |       8.58 / 35.43 |       12.59 / 34.30 |  1,779,089 |  2,570,690 |
| diagonal/hard   |     30.79 / 125.55 |      36.96 / 197.18 |  6,132,102 |  8,076,479 |
| jigsaw/easy     |       9.45 / 40.29 |       15.69 / 34.53 |  1,796,979 |  2,658,593 |
| jigsaw/medium   |      16.66 / 87.21 |       21.60 / 69.00 |  2,807,331 |  3,357,849 |
| jigsaw/hard     |     79.89 / 211.66 |      74.03 / 320.50 | 11,131,792 | 14,183,765 |
| killer/easy     |        6.09 / 8.38 |       11.79 / 14.93 |  2,662,016 |  2,863,842 |
| killer/medium   |      10.82 / 13.98 |       16.62 / 20.73 |  3,077,063 |  4,213,648 |
| killer/hard     |     62.48 / 150.71 |      69.40 / 239.10 | 28,585,282 | 23,857,862 |
| thermo/easy     |        6.64 / 8.90 |       10.61 / 14.69 |  1,007,025 |  1,678,343 |
| thermo/medium   |     30.73 / 106.00 |       32.98 / 82.24 |  7,721,932 |  5,952,616 |
| thermo/hard     |     46.36 / 134.79 |      51.74 / 241.55 | 10,748,019 | 11,824,483 |
| arrow/easy      |       5.74 / 36.01 |       10.93 / 13.82 |  1,702,855 |  1,629,966 |
| arrow/medium    |        5.10 / 6.42 |        8.51 / 11.26 |    704,899 |  1,084,046 |
| arrow/hard      |     51.58 / 143.47 |      55.22 / 214.95 |  9,526,244 | 10,699,417 |

## Search and preparation decisions

The frozen configuration retains the original 2 live layouts, 8 checkpoints, 4,096 seen masks, 32 proposals and 8 non-improvements; it uses uniqueness first except Killer Hard. Prepared small-cage support enumerates actual domains when their Cartesian count is no larger than the catalogue. Ordinary solved sweeps continue through temporary tier decreases within one existing checkpoint slot, and closed checkpoint slots are freed without forgetting seen masks. Eligible owners are scheduled by actual charged work. A 125,000-work expansion quantum was rejected because it prematurely retired useful geometry; no quantum or additional allowance ships. Configuration froze before the reserved sample; no post-holdout algorithm tuning occurred. Numeric topology arrays are owned and readonly while rule geometry, records and owners stay frozen. CPU profiling found frozen-array queries expensive, motivating ordered indexed scans and typed owned numeric arrays. The aggregate paired work totals decrease on the targeted and reserved cohorts, but full-corpus median/p95/worst time increase and Expert hit rates are saturated in both arms. This is a success/maintainability improvement with mixed latency, not a general speedup. Full Classic Expert p95 is 75.5 to 147.0 ms; Killer Hard p95 is 150.7 to 239.1 ms. All 19 timing comparisons remain visible above; no budget or transport deadline was raised.

The initial shared-search implementation reached 1,216/1,216 on the full corpus but lost one previously ready targeted Killer Hard request and increased latency. It was rejected. Preserved raw initial runs and CPU profiles document that result. Fixed-domain arithmetic selection, typed owned topology, ordered candidate scans and the selected rejection policy were validated again before release. No failed run was relabeled as a pass.

## Current production identities

| Corpus   | Requests | Ready | Exhausted | Worst Node ms |
| -------- | -------: | ----: | --------: | ------------: |
| full     |     1216 |  1216 |         0 |        579.93 |
| targeted |      256 |   256 |         0 |        650.31 |
| feedback |      768 |   768 |         0 |        661.74 |
| hard058  |        1 |     1 |         0 |        151.25 |

Every ready row passed independent solution counting, known-terminal consistency, terminal/geometry structure and variant necessity checks. Complete new assessments and traces match the frozen v9 rater when it completes; fixed authored fixtures match exactly. Source/configuration hashes and every remaining exhaustion are recorded in the companion JSON. Finite samples do not prove every seed succeeds.

## Emitted Workers and player flows

- `control-v9`: 240 checks at root and `/sudoku/`, worst 455.00 ms; unavailable runtimes: firefox.
- `candidate-v9`: 240 checks at root and `/sudoku/`, worst 1190.00 ms; unavailable runtimes: firefox.
- `candidate-v10`: 240 checks at root and `/sudoku/`, worst 877.00 ms; unavailable runtimes: firefox.

Worker payloads equal independently checked Node payloads. Selection includes the union of slowest requests by combination, recovered Hard 058/Killer Hard 005 and explicit one-unit private Worker builds. No test limit or historical identity override is shipped. Mobile/WebKit device presets are desktop emulation, not physical-device validation.

All four TypeScript projects, ESLint, repository formatting, 892 unit tests and both root/subpath production builds passed. The full available-browser player suite passed 337 tests with 2 intentional physical-keyboard skips on touch device projects, across Chromium desktop/mobile emulation and WebKit. It covers free/daily construction, cancellation, timeout and explicit exhaustion, hints/evidence, all 32 lessons, session restoration, ownership/persistence and backups. Firefox was freshly attempted in all private matrices and a bounded player run, but fails before application assertions with Could not find profile folder; it is unavailable, not passed. Initial Firefox traces and the harness-build/typecheck failures are preserved separately from corrected runs. One fresh independent whole-change code review found 0 Critical, 0 Important and 0 Minor findings. No physical-device validation, push or merge was performed. Raw evidence, the final review and execution ledger remain under .superpowers/feedback-guided-generation/release-evidence/.

## Rulings made during execution

- Work in the existing checkout on feature/feedback-guided-generation — the approved native plan preserves dirty v9 and local evidence in this directory, and no new worktree was requested; this avoids copying uncommitted state. Cost if wrong: the user must switch the local branch to return to another task. Main is untouched.
- Static Classic topology reuse performs no compilation, so remove the synthetic one-unit kind-dispatch charge introduced in Task 1 — the spec permits static topology reuse and forbids charging skipped work; this also preserves completed-board zero-budget rating. Cost if wrong: constant-time dispatch is uncounted, as it is elsewhere. Puzzle-specific preparation remains fully charged and has its own exact-search regression. The 15k Killer policy-prefix test explicitly uses prepared computation; aggregate limits stay unchanged.
- Keep the pure geometry strategy registry in generationStrategies.ts and put the complete six-variant constructor registry in generationLayouts.ts — importing layout constructors into the existing geometry registry would create a runtime dependency cycle through variantGeneration.ts. Shared construction contract types stay in generationStrategies.ts. Cost if wrong: one additional focused engine module; all variants still have statically checked registration and one common search.
- Prepared small-cage support chooses bounded raw enumeration when the actual Cartesian domain count is no larger than its catalogue — phase metrics showed repeated incompatible-table scanning dominated Killer work, and a fixed four-cell singleton-domain test failed with 5 units before the change. Charge one selection visit and every executed extension/filter; keep all catalogue preparation charges. Cost if wrong: the deterministic heuristic may misestimate CPU cost; independent support tests and paired native gates decide release.
- Keep numeric unit-cell and peer lists as owned readonly arrays rather than deeply freezing these hot arrays — CPU samples and a 1M-query reproduction show frozen filter 227 ms vs ordinary 30 ms, and indexed frozen 61 ms. Parsed rule geometry, topology records and owner objects remain frozen; numeric lists are copied from inputs and must never escape through mutable evidence/results. Cost if wrong: a caller deliberately violating the readonly prepared-context API could mutate internal topology; input/result/evidence mutations remain fenced and are regression-tested.
- Make another layout eligible after 125,000 actual work units on an owner since its last expansion, even when small local improvements reset stagnation — targeted exhaustion consumed 4M after only 2-3 geometries. This is deterministic scheduling within the same single 4M budget, not a new allowance; two active owners and promising-owner preservation remain. Cost if wrong: a useful geometry may lose its second slot earlier; the paired no-loss gate and held-out sample decide release. A costly-improvement fixture reproduced starvation before the change.
- Reject the 125k expansion quantum after paired experiments; retain stagnation-triggered expansion and actual-work fairness only across already eligible owners — the same fixed candidate reached targeted 256/256 without the quantum versus 237/256 with it. A costly but continuously progressing real-sweep fixture observed RED (exhaustion) before removing the quantum and GREEN (one-layout completion) afterward. The experimental synthetic-starvation test was replaced because forcing interruption of continuous progress encoded the rejected strategy rather than a product contract. Cost if wrong: a continuously improving costly frontier may consume the aggregate work before another geometry is tried; the finite shared budget remains honest and no-loss gates still decide release.
- Reviewer excluded pending v10/browser/report completion from its source verdict — coordinator retains and completes all those release gates before final completion, rather than treating the clean source review as runtime certification. Cost if wrong: an omitted runtime check could still hide a deployment-specific failure; final evidence enumerates actual checks.
- Reviewer excluded physical-device performance — preserve the approved desktop/browser-emulation scope and explicitly report that physical devices were not tested. Cost if wrong: mobile hardware may have different latency or interaction behavior.

## Evidence and limits

The companion JSON records explicit raw evidence paths, source hashes, native timing distributions, exclusive stage work, layout/candidate counts and all incomplete outcomes. Existing historical reports remain intact. The old `HANDOFF.md` is absent. No push or merge was performed.
