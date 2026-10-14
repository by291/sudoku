# Generation Budgets, Jigsaw Search and Loading Verification

Historical v6 verification. [Generation Without Fallback](2026-10-14-generation-without-fallback.md) records the subsequent removal of authored-puzzle substitution. The measurements below retain their original identities and limits.

Date: 2026-10-14. Generation identities are `sudoku-v6` and `sudoku-variants-v6`; assessment remains `sudoku-rating-v2`. The user authorized larger budgets for every type, a three-second generation target, loading feedback, and learning from existing Jigsaw generators. This report supersedes current-version statements in [Guided Generation Verification](2026-10-14-killer-guided-generation.md), preserving its historical measurements. The [machine-readable report](2026-10-14-three-second-generation-corpus.json) contains the full comparison.

## Delivery behavior

All six types and 19 supported type/tier combinations use `{ maxLayouts: 40, maxWork: 4000000, maxSteps: 500, fallbackWork: 1000000 }`. Terminal construction, geometry, clue removal, uniqueness, logical grading and rule necessity share the construction allowance. Abandoned attempts do not reset it. Fallback verification has its separate one-million-unit allowance. Standalone assessment defaults to four million work units; hint budgets and difficulty policies are unchanged.

Generation returns immediately after its first fully validated candidate. The client uses a 3,000 ms request timeout; assessment and hints retain 15,000 ms. Timeout cancels the Worker, retains the current save and offers retry with the same input. Device speed does not select a different fallback or seed output. The pure engine has no wall-clock predicates. Finite deterministic work bounds and measurements are not a universal promise for every seed or device.

The client prepares one idle module Worker ahead of interaction and after settlement. It sends no puzzle request while idle. Startup errors remain explicit failures, and disposal terminates both idle and active jobs. This avoids spending the generation deadline on cold script initialization while keeping each actual job isolated.

Free play, daily play and full-board practice show one Chinese live status with a spinner and cancellation. Inputs remain disabled during generation. Existing games retain their paused, concealed board; cancellation or failure cannot replace their save. The spinner respects reduced motion and the cancellation control fits narrow screens. No accounts, cloud sync, ranking or offline installation are introduced.

## Jigsaw sources and chosen algorithm

The reviewed source snapshots are concrete implementations, rather than evidence that another project's difficulty labels match ours:

- [Solo in the maintained Android port](https://github.com/chrisboyle/sgtpuzzles/blob/d1e10eb57dd80af4999e698a9ab31f546e9a0b9d/app/src/main/jni/solo.c#L2772-L2975) fills a shuffled complete row, uses masks and randomized backtracking, and bounds each regional terminal search at `area * area`, or 6,561 recursive visits for an 81-cell board. Failed terminals restart with new regions. Its [divvy region generator](https://github.com/chrisboyle/sgtpuzzles/blob/d1e10eb57dd80af4999e698a9ab31f546e9a0b9d/app/src/main/jni/divvy.c#L263-L665) grows connected regions and steals boundary cells; outer retries are not bounded like ours. The [official puzzles site](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/index.html) links this Android port; the pinned snapshot is not a claim about today's upstream.
- [KDE KSudoku](https://github.com/KDE/ksudoku/blob/f73263416601eb9383b8d317b3e515e3c9fafa1d/src/generator/sudokuboard.cpp#L707-L891) pre-fills a complete clique, propagates singles, and chooses between cell candidates and unit/digit locations. Its [Jigsaw shape](https://github.com/KDE/ksudoku/blob/f73263416601eb9383b8d317b3e515e3c9fafa1d/src/shapes/Jigsaw.xml) is predefined. Our existing dual-MRV regional search already follows that useful branch-space principle.
- [The QQWing-based C# generator](https://github.com/doug24/Sudoku/blob/b435085f318b50a287291b638e43ce7b122c4480/QQWing/QQWing.cs#L492-L615) separates fast fill/count operations from full logical rating. Its [orchestration](https://github.com/doug24/Sudoku/blob/b435085f318b50a287291b638e43ce7b122c4480/Sudoku/Model/Puzzle.cs#L29-L175) uses predefined regions and races eight tasks with a ten-second UI cancellation path. Those concurrency and timing choices are not adopted.

Our independently implemented Jigsaw terminal construction seeds the first full unit with shuffled digits. Every global digit relabeling preserves these complete-unit rules, so fixing this unit removes redundant label permutations without restricting the possible terminal structures. Each regional terminal DFS stops after 6,561 visits. A local `attempt-exhausted` result abandons that terminal and retries another layout with the same aggregate budget; aggregate exhaustion remains separate. Classic and Diagonal random-call ordering within terminal construction is retained.

A standalone unit-prefill prototype without the attempt bound still reached 17.5–19.3 seconds on some regional seeds. The bounded version addresses that expensive-tail behavior. Existing region templates and permitted transformations remain; this change does not claim arbitrary or uniform sampling of all connected region partitions. No third-party source code or production dependency was copied.

## Complete fixed-seed corpus

The corpus uses 64 fixed `local-product-corpus-v1:seed:000` through `063` inputs for every supported type/tier: 1,216 requests. Every request passed independent uniqueness, geometry and necessity checks, successful logical trace replay, difficulty checks and work invariants. All 1,216 delivered fresh generated puzzles; none used authored fallback.

The host was Windows `10.0.26300`, Intel Core Ultra 9 285K and Node.js `26.10.0`. The final corpus test took 177.15 seconds, including independent checks. Generator timings exclude those checks. Median/p95 use sorted index `min(n - 1, floor(n * p))`. The comparison includes changed v5/v6 identities, seed streams and allowances, so it does not isolate one algorithm.

| Type / tier       | Fallback / 64, v5 → v6 | v6 median ms | v6 p95 ms | v6 maximum ms |
| ----------------- | ---------------------- | ------------ | --------- | ------------- |
| classic / easy    | 0 → 0                  | 13.6         | 19.3      | 27.6          |
| classic / medium  | 0 → 0                  | 65.0         | 398.0     | 860.0         |
| classic / hard    | 5 → 0                  | 135.9        | 453.7     | 724.5         |
| classic / expert  | 1 → 0                  | 58.9         | 234.4     | 392.3         |
| diagonal / easy   | 0 → 0                  | 15.1         | 20.1      | 22.1          |
| diagonal / medium | 0 → 0                  | 30.2         | 111.9     | 130.4         |
| diagonal / hard   | 0 → 0                  | 102.4        | 352.7     | 463.0         |
| jigsaw / easy     | 1 → 0                  | 22.5         | 82.2      | 171.8         |
| jigsaw / medium   | 0 → 0                  | 49.0         | 116.5     | 150.3         |
| jigsaw / hard     | 5 → 0                  | 127.0        | 603.9     | 768.1         |
| killer / easy     | 1 → 0                  | 20.6         | 27.0      | 29.8          |
| killer / medium   | 0 → 0                  | 39.5         | 48.8      | 61.3          |
| killer / hard     | 21 → 0                 | 100.7        | 263.1     | 423.9         |
| thermo / easy     | 0 → 0                  | 19.9         | 25.9      | 72.8          |
| thermo / medium   | 0 → 0                  | 94.0         | 303.8     | 366.3         |
| thermo / hard     | 0 → 0                  | 140.1        | 404.7     | 761.9         |
| arrow / easy      | 0 → 0                  | 19.7         | 69.9      | 82.0          |
| arrow / medium    | 0 → 0                  | 21.9         | 27.8      | 29.9          |
| arrow / hard      | 0 → 0                  | 87.5         | 489.3     | 747.6         |

Overall, fresh generation increased from 1,182 to 1,216 and fallback decreased from 34 to zero. The maximum fell from 4,666.1 to 860.0 ms, while median increased from 33.0 to 36.9 ms and p95 increased from 287.7 to 321.6 ms. More successful fresh construction is not an across-the-board speedup. Maximum construction work was 3,347,703. Canonical geometry count increased from 572 to 591; the aggregate terminal-family lower bound remained 30. These are fixed-sample results, not guarantees for unseen seeds.

## Real production Worker measurements

The slowest observed seed from each of the 19 corpus groups was run through emitted Worker assets at both hosting roots, in all four browser projects: 152 requests. The timer includes Worker creation, initialization, computation and transport to the test process. All were below 3,000 ms, with matching complete assessments. These measurements use one Playwright worker and mobile browser emulation.

| Project | Browser version | Requests | Maximum ms |
| ------- | --------------- | -------- | ---------- |
| desktop | 156.0.8078.4    | 38       | 579.3      |
| mobile  | 156.0.8078.4    | 38       | 585.5      |
| firefox | 157.0           | 38       | 978.5      |
| webkit  | 27.2            | 38       | 1080.0     |

Raw Worker measurements alone did not establish real opening-flow performance. Initial real-flow tests on this Windows WebKit build reproduced timeouts. HTTP downloads took 3.5–5.0 ms, but test-only script timestamps showed initialization taking 2,913–2,978 ms before Classic computation of 26–175 ms. A prepared idle Worker experiment passed all four Classic tiers with the unchanged 3,000 ms request deadline. The production client now owns that preparation; diagnostic wrappers and modified assets are excluded from shipping.

## Verification

- Final source checks passed: 726 unit tests in 62 files, all four TypeScript projects including Vue checking, ESLint, Prettier, root/subpath production builds and diff checks. Forty local document links were checked.
- The full fixed-seed corpus passed 19 groups and 1,216 independently checked requests. Forty production-Worker browser checks passed across Chromium desktop/mobile, Firefox and WebKit at both roots. The separate latency run measured 152 actual requests as reported above.
- Final relevant workflow coverage passed 258 distinct checks, with two device-conditional keyboard skips, across all four browser projects. This covers real openings and every Classic tier, all variant rules and hints, daily play, loading/timeout/cancel, save/reload, all 32 course practice tiers, Expert play and local backup/restore. The complete unrelated end-to-end suite was not rerun in this phase.
- The first prepared-Worker flow run encountered the host's documented Firefox default-cache launch failure before opening any page. All 27 affected checks passed when rerun with the documented project-local browser cache. No configured browser was disabled.
- A stale-result backup fixture deliberately holds a Worker while another tab restores data. Its synthetic request now has a longer test-only interruption window so epoch fencing remains observable on slow WebKit UI actions. That regression passed in every browser; ordinary three-second deadlines remain separately verified by client and loading tests. The initial failed fixture run is not counted as green.
- Independent read-only review reported no substantive findings and passed 17 additional Worker lifecycle checks, including concurrent requests, pre-aborted signals, startup/constructor failure, stale replies, one idle-slot refill, complete termination and timer cleanup. The earlier time-based fallback experiment was rejected because it could change same-seed output by device speed; no such predicate remains in the pure engine.

Preparation reduces startup overhead but does not guarantee that an immediate request or rapid retry finds a ready Worker. Its deadline still starts at submission. Cancellation, startup failure and timeout remain explicit, and none can install an unvalidated alternative puzzle or replace the current save.
