# Guided Killer Generation Verification

Historical v5 report. [Generation Without Fallback](2026-10-14-generation-without-fallback.md) records current v7 behavior; [Generation Budgets and Jigsaw Verification](2026-10-14-three-second-generation.md) records the intermediate v6 milestone. The measurements below remain unchanged.

The implementation improves fresh Killer Hard construction while retaining the existing difficulty and delivery gates. In a paired 64-seed comparison using identical v5 requests, fresh construction increased from 25 to 43 puzzles, and verified fallback decreased from 39 to 21. Median generation time fell from 270.6 to 128.4 ms in that run. The complete 1,216-request corpus delivered independently unique, structurally valid puzzles with matching complete assessments; fallback across all types decreased from 53 to 34.

Current identities are `sudoku-v5` for Classic and `sudoku-variants-v5` for variants. Both advance because shared grading work reuse can affect budget-limited generation across all types. Assessment remains `sudoku-rating-v2`: the technique policies, complete trace/evidence and workload definitions retain their semantics. Saved boards, results, assessment snapshots, time, assistance and formal daily identities remain authoritative.

The [machine-readable report](2026-10-14-killer-guided-generation-corpus.json) contains fixed seeds, identities, host, limits, paired results, assessment comparisons and every type/tier aggregate. The baseline is commit `80cb17f` and its delivered v4 corpus in [Shared Search Verification](2026-10-14-sudoku-search.md). This report supersedes that report's current-generation statements without rewriting its historical measurements.

## Diagnosis and sources

The earlier v4 implementation freshly generated 26/64 Killer Hard puzzles. All 38 fallback requests exhausted the one-million-unit construction allowance after only one to four layouts, rather than reaching the 20-layout cap. Diagnostic observer output attributed 97.9% of total construction work, and 99.9% of fallback-request work, to logical grading. Of 8,504 construction assessments, 6,658 were Easy, 1,635 Medium, 28 Hard, 147 ungraded and 36 exhausted. Only 26 Hard states completed every delivery gate. Repeated lower-policy work and geometry that frequently forced singleton cages were more useful targets than another exact counter.

- [KDE's cage generator](https://github.com/KDE/ksudoku/blob/master/src/generator/cagegenerator.cpp) informed starting in narrow spaces and absorbing neighbours that would otherwise become isolated. Its [Mathdoku generation entry](https://github.com/KDE/ksudoku/blob/master/src/generator/mathdokugenerator.cpp) retries bounded cage generation, but does not enforce this application's precise Medium-stalls/Hard-solves policy. Its existence therefore does not establish success under our difficulty criteria.
- [Simon Tatham Solo's maintained source](https://github.com/chrisboyle/sgtpuzzles/blob/main/app/src/main/jni/solo.c) informed a local experiment with adjacent-cage merges, solver feedback and rollback. Merges preserved connectivity, maximum size and distinct solution digits. Under our construction pipeline, that prototype was weaker than the anti-isolation approach and was excluded from shipping. Solo's difficulty model also differs from this application's model.

The shipping algorithms are independently implemented in the existing pure TypeScript engine. There are no new production dependencies or runtime services. Ignored prototypes and raw diagnostics remain under `.superpowers/killer-generation/` and are not imported by shipping tests.

## Selected changes and invariants

`variants/killer.ts` chooses an unused start cell with the fewest free cardinal neighbours, then prioritizes adjacent cells at risk of isolation. Seeded ordering still resolves ties. Target sizes remain two to four, cells remain connected and disjoint, and every cage contains distinct digits from the verified terminal with the matching sum. Residual singletons remain possible. Each start/frontier cell evaluation consumes shared construction work, and exhaustion discards incomplete geometry.

`logic.ts` exposes continuation of a caller-owned workspace. `rating.ts` reuses a stalled lower policy's candidate state and trace only when the next policy's actual detector priorities preserve the earlier prefix. Classic's canonical priority order is checked explicitly. Changed priorities or a reduced policy restart from the original board and discard the prior trace. Earlier deductions count toward the total per-policy step limit; the complete successful trace drives the unchanged summary. No workspace crosses requests.

Killer Hard's removal check now runs a cheap Easy proof first on givens and cages built from the same verified terminal. Solved Easy states remain tentative removals below the target tier. Every accepted Hard candidate still needs full grading, exact uniqueness and rule necessity. An exhausted screen remains inconclusive. This shortcut is not applied to external or unvalidated boards.

Limits remain 20 layouts, 1,000,000 construction work, 500 logical steps per policy and a separate 1,000,000 fallback allowance. The Worker timeout remains 15,000 ms. Fallback validation still proves uniqueness and matching difficulty; neither larger allowances nor easier policies account for the improvement.

## Experiments and paired comparison

A pilot used 16 fixed seeds; full exploratory modes used the original 64 v4 inputs. The original implementation generated 26 puzzles, anti-isolation geometry generated 37, and geometry plus a cheap Easy rejection also generated 37. Reusing compatible policy work increased both latter modes to 41. The merge/rollback prototype generated 31 before policy reuse and 37 after reuse, so it was not selected. Exploratory modes ran in separate processes and their timings are unsuitable for a clean performance comparison.

The final paired run executed the old and selected algorithms in sequential phases in one process on identical `sudoku-variants-v5` inputs. This isolates the selected algorithm bundle from the generation identity change. The original v4 outcome of 26 is a separate historical comparison; the paired old-algorithm outcome is 25.

| Measure                             | Old algorithms, v5 inputs | Selected algorithms, v5 inputs |
| ----------------------------------- | ------------------------: | -----------------------------: |
| Fresh construction / 64             |                        25 |                             43 |
| Verified fallback / 64              |                        39 |                             21 |
| Generation median / p95 ms          |             270.6 / 391.2 |                  128.4 / 256.7 |
| Generation maximum ms               |                     438.0 |                          314.4 |
| Fresh-puzzle singleton median / max |                     5 / 9 |                          1 / 2 |
| Terminal family lower bound         |                        12 |                             17 |
| Canonical geometries                |                        26 |                             44 |

All 128 paired results passed independent uniqueness, solution/structure and trace-conclusion checks, and replayed complete assessments matched delivered summaries. The full corpus additionally checks rule necessity. Eight same-terminal, same-random-stream geometry fixtures reduced singleton counts from 7/8/3/7/5/7/5/5 to 1/0/0/0/0/0/1/0.

Assessment comparison covered 19 authored type/tier fixtures with their original givens and two/four/eight added givens: 76 cases in total. Complete results, every step, evidence and summaries matched fresh-policy analysis, with no work increase. The authored Killer Hard fixture required 19,756 work units before reuse and 11,592 after reuse. Reordered-policy and step/work exhaustion regressions confirm when continuation must stop or reset.

## Complete generation corpus

The final corpus covers all 19 supported combinations and their original 64 seeds, for 1,216 requests. All delivered ready results passed independent uniqueness, terminal/structure checks, applicable rule necessity, matching difficulty and trace conclusions. Generation work remained within unchanged bounds, and all aggregate diversity gates passed.

The host was Windows `10.0.26300`, Intel Core Ultra 9 285K and Node.js `26.10.0`. The separate final corpus test took 180.54 seconds. Generator timers exclude independent validation and replay. Median/p95 select sorted zero-based index `min(n - 1, floor(n * p))`, matching the preceding report. The full-corpus comparison includes changed v4/v5 layouts and seed streams; it does not isolate a single algorithm. Local JIT and scheduling also affect timings.

| Type/tier       | Fallback / 64 v4 → v5 | Terminal family lower bound | Canonical geometries | Generator median / p95 ms v4 → v5 |
| --------------- | --------------------: | --------------------------: | -------------------: | --------------------------------- |
| Classic/Easy    |                 0 → 0 |                     20 → 18 |                1 → 1 | 12.2 / 15.2 → 12.8 / 16.5         |
| Classic/Medium  |                 0 → 0 |                     22 → 21 |                1 → 1 | 65.9 / 243.9 → 54.4 / 184.6       |
| Classic/Hard    |                 6 → 5 |                     18 → 17 |                1 → 1 | 156.0 / 410.5 → 121.9 / 432.2     |
| Classic/Expert  |                 2 → 1 |                     19 → 21 |                1 → 1 | 94.5 / 303.8 → 89.6 / 293.1       |
| Diagonal/Easy   |                 0 → 0 |                     21 → 19 |                1 → 1 | 17.0 / 22.3 → 17.2 / 21.7         |
| Diagonal/Medium |                 0 → 0 |                     17 → 19 |                1 → 1 | 32.0 / 152.1 → 40.4 / 142.2       |
| Diagonal/Hard   |                 0 → 0 |                     18 → 19 |                1 → 1 | 91.2 / 395.1 → 71.9 / 230.5       |
| Jigsaw/Easy     |                 0 → 1 |                     22 → 19 |                7 → 4 | 24.3 / 82.1 → 23.8 / 87.5         |
| Jigsaw/Medium   |                 0 → 0 |                     19 → 20 |                6 → 9 | 53.1 / 148.8 → 49.8 / 111.0       |
| Jigsaw/Hard     |                 6 → 5 |                     20 → 23 |                4 → 4 | 132.5 / 607.6 → 158.6 / 3358.4    |
| Killer/Easy     |                 0 → 1 |                     19 → 22 |              64 → 64 | 20.6 / 27.2 → 18.5 / 24.6         |
| Killer/Medium   |                 0 → 0 |                     22 → 19 |              64 → 64 | 44.1 / 57.3 → 33.5 / 40.2         |
| Killer/Hard     |               38 → 21 |                     15 → 17 |              27 → 44 | 164.5 / 334.8 → 109.5 / 179.1     |
| Thermo/Easy     |                 0 → 0 |                     20 → 20 |              64 → 64 | 18.5 / 25.9 → 18.2 / 23.9         |
| Thermo/Medium   |                 0 → 0 |                     20 → 18 |              64 → 64 | 107.7 / 313.4 → 72.3 / 261.8      |
| Thermo/Hard     |                 1 → 0 |                     22 → 19 |              64 → 64 | 150.9 / 489.4 → 106.4 / 359.4     |
| Arrow/Easy      |                 0 → 0 |                     19 → 19 |              64 → 64 | 19.0 / 83.0 → 20.9 / 87.2         |
| Arrow/Medium    |                 0 → 0 |                     20 → 22 |              64 → 64 | 19.9 / 24.8 → 20.9 / 27.1         |
| Arrow/Hard      |                 0 → 0 |                     19 → 22 |              64 → 64 | 107.6 / 415.6 → 110.0 / 390.1     |

Overall median/p95 improved from 40.0/320.7 to 33.0/287.7 ms. Summed generator time stayed approximately flat at 111.5 → 111.6 seconds, because slower regional tail requests offset improvements elsewhere. Intercalate diversity is a transformation-invariant family lower bound: equal counts do not establish equivalence. Canonical geometry ignores givens and clue numbering. Neither measure grades human difficulty.

## Remaining limits and regressions

Killer Hard still needs verified fallback for 21/64 requests (32.8%). All 21 exhaust the construction work allowance after one or two layouts. The narrow supported Hard band remains difficult to reach; this change improves success without eliminating that limitation. Anti-isolation construction does not guarantee zero singleton cages.

Jigsaw Easy seed `060` and Killer Easy seed `029` now use fallback after exhausting construction, where v4 had no Easy fallback in those groups. Jigsaw Hard has fewer fallbacks overall but a slower p95. Its seed `010` is the final corpus's slowest request at approximately 4.67 seconds in Node; seeds `018` and `060` also take several seconds. Changed regional seed streams can create much more expensive terminals even with the same work cap. Final real-Worker checks use v5 Jigsaw `006` Medium and `010` Hard at both roots to exercise the current measured latency boundary. A finite work allowance is not a wall-clock guarantee.

Classic Hard's five fallbacks and Expert's one fallback reach the 20-layout cap below the work ceiling. Several Easy/Arrow medians and Diagonal Medium are slightly slower in this changed-layout sample. These results are retained in the table rather than described as universal speed gains.

## Budget sensitivity follow-up

The user asked whether the remaining fallback was an algorithm limitation or overly strict budgets. A separate ignored Node experiment varied limits without changing the current v5 algorithms, seed identities, difficulty policies or 500-step ceiling. Every one of its 276 results passed independent uniqueness/structure checks and matched a complete assessment replay under the original one-million-unit grading allowance. Internal generators were called directly, and only the test process's rating validation ceiling was temporarily widened; production decoders, limits and Workers remain unchanged.

| Killer Hard construction work | Fresh / 64 | Fallback / 64 | Node median / p95 ms | Maximum ms |
| ----------------------------- | ---------: | ------------: | -------------------- | ---------: |
| 1,000,000                     |         43 |            21 | 95.1 / 170.3         |      189.8 |
| 2,000,000                     |         58 |             6 | 98.0 / 208.0         |      253.7 |
| 4,000,000                     |         64 |             0 | 97.5 / 280.7         |      357.9 |
| 8,000,000                     |         64 |             0 | 102.4 / 292.8        |      354.0 |

Killer Hard retains the 20-layout cap in every row. The four/eight-million runs needed at most 3,790,895 work and three layouts; eight million added no fresh results and had identical consumed-work/layout counts for all 64 seeds, with timing differences from host/JIT effects. For this fixed sample, the current remaining Killer Hard fallback is primarily budget-limited. Earlier algorithm improvements remain relevant: they increased same-budget success and made additional work inexpensive enough to consider. Success for all 64 seeds is not a guarantee for arbitrary seeds or browser runtimes.

All seven cases that hit the original 20-layout cap below the work ceiling—five Classic Hard, one Classic Expert and one Jigsaw Hard—freshly generated with 40 layouts while retaining one million work. They needed 26–35 layouts, at most 738,000 work, and approximately 0.55–0.97 seconds in this Node run. Raising the cap to 60 added no benefit for these cases.

The other work-limited cases responded differently. With construction work doubled to two million, Killer Easy seed `029` freshly generated in about 197 ms. Only two of five Jigsaw cases were rescued: Hard seeds `058` and `060`. Easy `060` and Hard `010`/`018` still used fallback; the Jigsaw requests took approximately 4.0–8.7 seconds. Therefore a uniform work increase has a poor latency trade-off for the measured slow regional cases. Type/tier-specific budgets and bounds on expensive individual attempts should be evaluated alongside regional search/retry improvements. Enlarged budgets have not been verified in real production Workers.

This follow-up diagnoses the existing limits; it does not change them. The original complete-corpus statistics above continue to describe the delivered implementation under its original limits. Same-seed checks reproduced the original Killer Hard construction metrics before the larger-budget runs, and the [JSON report](2026-10-14-killer-guided-generation-corpus.json) retains all sensitivity aggregates and other-case results.

## Verification and review

- Geometry, shared-budget and reduced-grading-work regressions were observed failing under the old algorithms before implementation. New v5 Killer seeds `000` and `017` require fresh Hard construction, independent uniqueness and a matching assessment.
- All 716 unit tests across 60 files passed after both v5 identity changes. The separate full corpus passed 19 groups and 1,216 requests. Root and `/sudoku/` production builds passed.
- All four TypeScript projects, ESLint, repository Prettier checking and `git diff --check` passed. All 33 local Markdown links in the updated documents were checked.
- The 36-check real production-Worker matrix passed across Chromium desktop/mobile, Firefox and WebKit. Checks cover fresh Killer Hard, every Classic tier, each variant and rule evidence, emitted assets at both deployment roots, and subpath save/reload. The final high-work regional seeds completed within the unchanged 15-second request timeout at both roots in every project. Payloads and complete summaries match the shared Node engine. Mobile configurations are browser emulation.
- Independent read-only review reported no findings and passed 1,333 additional checks for assessment equivalence, step/work boundaries, trace isolation, 128 fresh cage geometries and shared-budget exhaustion. Final report wording and ignored experiments were outside that review.

Production package dependencies and the lockfile are unchanged. Work stays in the existing checkout and branch; no worktree was created.
