# Lightweight Trial Grading Production Release

Date: 2026-10-15. The user selected lightweight grading for production after the [independent v7 experiment comparison](2026-10-15-generation-efficiency.md). The user authorized a local integration commit after release verification. The completed `HANDOFF.md` has been deleted at the user's request; benchmark and review evidence remains available.

## Production behavior

Generation now uses the prepared `screen` operation to classify a trial without summarizing rejected candidates. A matching trial completes its owned successful trace into the full assessment before delivery. Standalone `assess` retains its full validated outcome. Killer Hard runs its actual Easy-to-Hard policy workflow without a separate Easy precheck. Board/workspace state never crosses clue masks; returned clue evidence remains isolated from prepared geometry.

Current generation identities are `sudoku-v8` and `sudoku-variants-v8`; `sudoku-rating-v2`, technique order, workload definitions, 40 layouts, 4,000,000 aggregate work units, 500 logical steps, three-second generation transport and fifteen-second hint/assessment transport remain unchanged. Every delivery retains exact uniqueness, a complete matching assessment and meaningful variant rules. There is no authored fallback, difficulty downgrade or changed acceptance rule. Saved boards, grades and formal daily identities remain authoritative. The decision-skeleton and alternative-search experiments remain outside production.

## Full v8 corpus

Both modes use all 64 `local-product-corpus-v1` seeds across 19 combinations. The control uses the prior prepared-only grading workflow with the same v8 identities and random streams, so timing and budget differences isolate the selected optimization. Measurements are single warmed sequential passes on Apple M4 Pro, macOS 27.0.1, Node 26.11.1 and pnpm 12.11.2; independent validation is excluded from generator timers.

| Mode                      | Ready | Exhausted | Validation failures | Total ms | Median ms | p95 ms | Max ms | Charged work |
| ------------------------- | ----- | --------- | ------------------- | -------- | --------- | ------ | ------ | ------------ |
| Prepared-only v8 control  | 1215  | 1         | 0                   | 40,149.1 | 13.2      | 125.7  | 467.4  | 140,372,415  |
| Production lightweight v8 | 1215  | 1         | 0                   | 36,904.8 | 11.9      | 112.6  | 412.1  | 141,348,519  |

Production generator time changes by -8.1% and charged work by 0.7%. All 1,216 puzzle/assessment/outcome payloads match the same-version control; 63 work counts change. Both have 1,215 successes and one normal exhaustion, with zero independent validation or diversity failures.

The earlier v7 corpus had two exhaustions; the new v8 control also has one. The lower count therefore comes from the new version's seeded inputs, not an improvement proved for lightweight grading. Seed text 010 and 059 now succeed under v8, but those are different construction identities and different puzzles. Existing v7 saved puzzles are not regenerated.

## Why the two earlier v7 requests exhausted

Stage instrumentation reproduces the exact stored serialized result fingerprints. Summed stage charges equal the recorded aggregate work; the probe changes neither seeded calls nor acceptance. These are generation-limit outcomes, not wall-clock timeout or invalid-puzzle delivery.

| v7 request              | Terminal/layout result                                   | Trial classifications                                                     | Work      | Limiting condition                 |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- | --------- | ---------------------------------- |
| Classic Expert seed 010 | 40 valid terminals; 2,291 uniquely solvable trial boards | 2,214 Easy, 41 Medium, 26 Hard, 10 ungraded; zero Expert                  | 852,527   | All 40 layouts tried               |
| Killer Hard seed 059    | Three valid terminals and cage layouts                   | 178 Easy proofs; 52 Medium, 11 ungraded; one incomplete rating; zero Hard | 4,000,000 | Shared work exhausted during logic |

Classic spent 737,663 work on uniqueness, 111,511 on grading and 3,353 on terminal construction. Its remaining work allowance was substantial, but the 40-layout cap had been reached without an Expert-rated board. Increasing only the work allowance would not create more layout attempts. Hard and ungraded boards cannot be delivered as Expert.

Killer spent 3,966,283 work (99.16%) in full assessment, 23,417 in the old Easy precheck, 10,043 constructing cages, and 257 constructing terminals. No candidate reached Hard, so neither exact uniqueness nor variant necessity was reached. Its bottleneck was repeated supported arithmetic/logical rating of candidate masks. Lightweight grading reproduces this old request's exhaustion as well; final-summary savings do not make a Medium or ungraded board meet Hard.

## Current v8 residual exhaustion

Killer Hard seed 048 exhausts four million work units after six valid terminal/cage layouts. It records 366 Easy trials, 92 Medium, 21 ungraded and one incomplete logical rating, with zero Hard candidates. Assessment consumes 3,979,163 work (99.48%), geometry 20,336 and terminals 501; no exact-count delivery candidate is reached. This case remains explicit and publishes no puzzle or assessment. Its fixed facts now cover real Worker exhaustion at both roots and the save-preserving player error flow.

## Real browser Workers

Each mode builds its own emitted Worker at `/` and `/sudoku/`, selecting the slowest measured request from every current combination plus natural exhaustion. Both modes also retain the same production slow inputs for paired timing. Every response is checked against its independently validated Node puzzle/complete summary. Times include fresh Worker startup. Mobile is desktop-host emulation.

| Mode       | Project | Version      | Checks | Median ms | p95 ms | Max ms | At least 3,000 ms | Payload failures |
| ---------- | ------- | ------------ | ------ | --------- | ------ | ------ | ----------------- | ---------------- |
| control-v8 | desktop | 156.0.8078.4 | 44     | 116.3     | 371.6  | 477    | 0                 | 0                |
| control-v8 | mobile  | 156.0.8078.4 | 44     | 118       | 387    | 493.6  | 0                 | 0                |
| control-v8 | firefox | Unavailable  | 0      | -         | -      | -      | 0                 | 0                |
| control-v8 | webkit  | 27.2         | 44     | 129       | 603    | 659    | 0                 | 0                |
| production | desktop | 156.0.8078.4 | 38     | 118.3     | 402.7  | 409    | 0                 | 0                |
| production | mobile  | 156.0.8078.4 | 38     | 125.5     | 406.2  | 409.8  | 0                 | 0                |
| production | firefox | Unavailable  | 0      | -         | -      | -      | 0                 | 0                |
| production | webkit  | 27.2         | 38     | 144       | 600    | 605    | 0                 | 0                |

On 114 exactly matched project/root/type/tier/seed requests, browser Worker time is 18,817.1 ms versus 19,922 ms for control (-5.5%). Mode table distributions can include different additional slow inputs; use the matched comparison to assess the relative browser result.

Firefox is installed but cannot launch on this macOS 27 host (`Could not find profile folder`); it remains unavailable and unverified. The symptom matches [Playwright issue 42768](https://github.com/microsoft/playwright/issues/42768) and [Mozilla bug 2062988](https://bugzilla.mozilla.org/show_bug.cgi?id=2062988); root cause is inferred, not independently proved. Chromium and WebKit results do not certify Firefox or physical mobile devices.

## Release verification

Promotion regressions were observed RED (23 failures) before integration and GREEN (six focused files / 193 tests) after it. The final full unit suite has 64 files / 814 passing tests. All four TypeScript projects, ESLint, Prettier and root/subpath production builds pass. The one test-only locator correction also passes the E2E TypeScript project, focused ESLint and Prettier checks.

The full Chromium desktop, Chromium mobile-emulation and WebKit player run recorded 334 passes, two intentional skips of desktop-only physical-keyboard layout coverage, and three failures of the new natural-exhaustion test. All three failures occurred before generation because the test clicked Naive UI's hidden native radio. Clicking the visible label and asserting its checked state fixes the setup. Rerunning the entire generation-loading file produces 12 passes across all three projects, including all three formerly failing exhaustion flows. Across these runs, all 337 distinct available player cases are verified; two platform-specific skips remain. This is a full run plus a targeted correction run, not a claim that the original full command passed.

Real Worker matrices independently verified 246 responses across the same available projects and both roots (132 control, 114 production), with exact payloads and no measured duration at least three seconds. The 1,216-request same-version corpora pass all independent validations. Firefox remains unavailable and mobile remains host emulation.

The independent read-only engine/report review and its bounded locator-correction addendum both report zero remaining actionable findings. The review snapshot explicitly left player execution pending; the final player results above are the implementer's fresh verification, not a claim that the reviewer reran them. Logs, initial failure traces and the review remain under `.superpowers/lightweight-rating-release/`. The user authorized a local integration commit after this verification.

## Artifacts

[Machine-readable release data](2026-10-15-lightweight-rating-v8.json) records every input/fingerprint/work count, same-version comparisons, source hashes, browser results and the original/current exhaustion diagnostics. Full puzzle payloads remain under `.superpowers/generation-efficiency-implementation/results/`. The frozen `prepared-v7/` engine keeps the historical five-mode experiment reproducible after production advances; it is ignored research data, with no historical production dispatcher. Release probes and logs live under `.superpowers/lightweight-rating-release/`.
