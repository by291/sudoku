# Current Generation and Classic Diversity Verification

> Historical milestone: the user removed the Node CLI on 2026-10-13. CLI tasks, commands, and parity results below describe the earlier implementation and are no longer current requirements. The retained boundary suite now lives in `tests/module-boundaries.test.ts`. See the current README and the CLI-removal plan for active checks.

This report covers the [Phase B plan](../plans/2026-10-13-sudoku-classic-terminal-diversity.md) under the [continuation amendment](../specs/2026-10-13-sudoku-generation-and-rating-design.md#continuation-amendment-no-historical-generation-compatibility). The user removed historical-generation compatibility requirements. Current construction uses `sudoku-v2` and `sudoku-variants-v2`; difficulty remains `sudoku-rating-v1`.

## Delivered behavior

Classic now constructs full terminals using seeded randomized MRV search before clue removal. One current dispatcher supplies free play, daily starts, CLI, and Worker generation. Historical Classic generation, rating wrappers, old budget parameter names, frozen old-output fixtures, and cutoff routing are absent. Valid saved boards remain stored snapshots, and formal daily attempts retain precedence and eligibility; no records are cleared or regraded.

Generation limits are `{ maxLayouts: 20, maxWork: 1000000, maxSteps: 500, fallbackWork: 1000000 }`. Terminal construction, uniqueness, fresh assessment policies, and variant necessity share construction work. Fallback uniqueness/assessment/necessity use one separate allowance. Every delivered puzzle has a complete matching compact assessment. Default adapters reuse it; explicit CLI diagnostic limits or traces run a separate assessment without changing construction acceptance. The production timeout stays 15,000 ms.

## Independent fixed corpus

The actual built Node CLI generated Classic seeds `classic-v2-corpus-01` through `classic-v2-corpus-16` at each tier, followed by `variant-v2-corpus-01` for all five variants at each tier. All 63 requests completed with rated summaries matching their requested type/tier. A separate reference solver confirmed exactly one solution and equality with the supplied solution for every returned puzzle.

| Corpus                     | Requests | Generated | Authored fallback | Independently verified |
| -------------------------- | -------: | --------: | ----------------: | ---------------------: |
| Classic Easy               |       16 |        16 |                 0 |                     16 |
| Classic Medium             |       16 |        16 |                 0 |                     16 |
| Classic Hard               |       16 |        16 |                 0 |                     16 |
| Five variants, three tiers |       15 |        13 |                 2 |                     15 |
| Total                      |       63 |        61 |                 2 |                     63 |

The 48 delivered constructed Classic solutions had sixteen different intercalate totals: `10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27`. An intercalate is an unordered pair of rows/columns forming `a,b / b,a`. Permuting rows, columns, or digits and transposing preserve its total. Therefore these different totals prove at least sixteen terminal transformation classes. Equal totals do not establish equivalence, and this finite corpus does not demonstrate uniform sampling.

A separate terminal-only corpus, `classic-terminal-v2-01` through `-16`, was independently valid and had eleven different totals (`11, 12, 13, 16, 17, 18, 20, 21, 24, 25, 26`). Construction consumed 82–87 visited-node work units (mean 83.69) in that corpus. Tests verify repeatability, transform invariance, zero/small allowance exhaustion, and different delivered classes without relying on production search as the oracle.

| Classic tier | Successful trace steps | Mean steps | Fresh CLI process elapsed | Mean elapsed |
| ------------ | ---------------------: | ---------: | ------------------------: | -----------: |
| Easy         |                  45–45 |      45.00 |           86.30–106.59 ms |     94.79 ms |
| Medium       |                  52–61 |      56.25 |          101.55–525.47 ms |    214.46 ms |
| Hard         |                  52–68 |      59.38 |          100.11–706.26 ms |    317.47 ms |

Elapsed observations include process startup, file I/O, generation, and JSON output; browser tests ran concurrently. Independent reference verification occurred afterward and is excluded from these timings. These are local corpus observations, not device-wide performance guarantees or weighted difficulty scores. Raw reports, full workload vectors, terminal boards, and logs remain in the ignored `.superpowers/sdd/2026-10-13-sudoku-classic-terminal-diversity/` directory while implementation is uncommitted.

## Checks and review

Type checking, ESLint, Prettier, all 511 unit tests across 47 files, and root/subpath/CLI builds passed. Regression tests cover caller-owned budget accumulation and malformed states, current-only request versions/limits, incomplete fallback rejection, unique reproducible generation, successful summary reuse, explicit diagnostic exhaustion, cancellation/reset fencing, and saved-attempt precedence.

The browser suite compares actual Node CLI results with real emitted Worker results for Classic at every tier and all five variants at both deployment roots, in addition to the eighteen authored assessment fixtures and explicit domain outcomes. Every configured project completed: desktop/mobile/Firefox passed 281 tests with one expected mobile skip in 4.0 minutes using two Workers; WebKit passed 93 tests with one expected touch-device skip in 9.3 minutes using one Worker. Total: 374 passes and two expected skips. Commands were `pnpm test:e2e --project desktop --project mobile --project firefox` and `pnpm test:e2e --project webkit --workers 1`, with the established project-local browser cache. The default concurrency and production timeout were unchanged.

One fresh read-only review found no Critical, Important, or Minor issue. It checked code, independent fixtures, current contracts, unit evidence, and the fixed corpus. Historical seed reproduction was excluded by explicit user instruction; uniform sampling, variant diversity, numeric calibration, and advanced techniques remain separate work. Browser emulation does not establish physical-device performance or deployment readiness.

Local document links, final formatting, and `git diff --check` passed. Implementation is complete on `feat/internal-assessment`, with code and scratch evidence retained uncommitted until requested. Existing jsdom `scrollTo` notices and Vite chunk-size warnings did not fail verification.
