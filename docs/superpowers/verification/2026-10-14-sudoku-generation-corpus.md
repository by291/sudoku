# Generation Corpus Verification

The approved [local product roadmap](../plans/2026-10-14-sudoku-local-product-roadmap.md) expands terminal construction for the five existing variants. Both baseline and current generators delivered all 1,216 fixed requests with matching complete assessments and independently unique solutions. Fallback changed from 257/1,216 (21.1%) to 234/1,216 (19.2%); there were no delivered failures or exhaustion outcomes under the default limits. Exhaustion paths are separately tested by forcing construction/fallback allowances to zero.

## Corpus and environment

`local-product-corpus-v1` defines 64 seeds, `local-product-corpus-v1:seed:000` through `:063`, for every supported type/tier combination (19). The regular regression subset uses indices 0, 17, 33 and 63 and repeats current generation to check deterministic output. [The machine-readable report](2026-10-14-sudoku-generation-corpus.json) includes the exact seeds, host, limits, per-combination work/trace/technique/timing distributions and type aggregates.

Baseline was captured from `59668e5` before generator edits: Classic `sudoku-v3`, variants `sudoku-variants-v2`, rating `sudoku-rating-v2`. Current variants advance to `sudoku-variants-v3`; Classic and assessment identities remain unchanged. The 256 Classic requests retained measured source, work, workload and terminal contracts. A subsequent regional-mask optimization retained all 1,216 per-seed acceptance, work, workload, terminal-invariant and geometry contracts.

Host: Windows `10.0.26300`, Intel Core Ultra 9 285K, Node.js `26.10.0`. Limits are unchanged: 20 layouts, 1,000,000 construction work, 500 logic steps, and separate 1,000,000 fallback work; production Workers retain 15,000 ms timeout. Generator milliseconds exclude independent oracles and assessment replay. Timings reflect this host/run and background verification; they do not grade difficulty or certify slower devices.

Run the full current corpus in PowerShell:

```powershell
$env:SUDOKU_CORPUS_PHASE = 'current'
pnpm exec vitest run tests/generationCorpus.test.ts
Remove-Item Env:SUDOKU_CORPUS_PHASE
```

The baseline used the same seed set/limits with phase `baseline` before production changes. Raw reports and complete logs remain in the ignored roadmap verification workspace; no historical generator routing was restored.

## Independent checks and diversity

Every current delivered board passes independent row/column/unit constraints and topology: both diagonals; connected nine-cell regional partitions; connected distinct-digit cages and exact totals; legal strictly increasing paths; legal Arrow shafts and exact circle sums, including allowed repetitions. An independent rule-aware oracle proves uniqueness and its exact solution. An independent Classic exact-cover oracle proves additional-rule necessity when the terminal also satisfies Classic; non-Classic Jigsaw terminals directly establish that their regions replace ordinary boxes.

Assessment replay matches the delivered summary/tier. Every placement equals the independently unique solution, and every elimination retains that solution's digit. These checks supplement the independent authored deduction/near-miss tests; the production assessor is not its own sole soundness oracle.

Intercalate counts are invariant under row/column/digit permutations and transpose. Unequal counts prove a family lower bound; equal counts do not establish equivalence. Canonical geometry ignores givens, clue numbering and cage totals, normalizes spatial symmetries, and preserves directed Arrow geometry; Thermo permits global reversal with complement. The aggregate terminal-family gate of four per variant passes: Diagonal 26, Jigsaw 29, Killer 22, Thermo 24 and Arrow 23. Variable-geometry types have multiple canonical signatures. Diagonal geometry is intentionally fixed.

## Per-combination results

| Type/tier       | Baseline fallback / 64 | Current fallback / 64 | Terminal families before → after | Geometry before → after | Current steps min-median-max | Current work p95 | Generator ms median/p95 |
| --------------- | ---------------------: | --------------------: | -------------------------------: | ----------------------: | ---------------------------: | ---------------: | ----------------------: |
| classic/easy    |                      0 |                     0 |                          19 → 19 |                   1 → 1 |                     45-45-45 |             2387 |               14.2/15.5 |
| classic/medium  |                      0 |                     0 |                          20 → 20 |                   1 → 1 |                     51-57-64 |           115213 |              94.5/368.4 |
| classic/hard    |                      9 |                     9 |                          20 → 20 |                   1 → 1 |                     52-59-66 |           262020 |             265.6/700.1 |
| classic/expert  |                      0 |                     0 |                          18 → 18 |                   1 → 1 |                     54-58-69 |           180128 |             158.0/461.8 |
| diagonal/easy   |                      0 |                     0 |                           1 → 18 |                   1 → 1 |                     25-40-51 |             3700 |               14.6/19.2 |
| diagonal/medium |                      0 |                     0 |                           1 → 19 |                   1 → 1 |                     48-61-68 |           117576 |              39.2/402.1 |
| diagonal/hard   |                      1 |                     0 |                           1 → 22 |                   1 → 1 |                     53-66-77 |           471323 |            288.2/1458.9 |
| jigsaw/easy     |                      0 |                     0 |                           1 → 23 |                   4 → 9 |                     31-51-58 |            36316 |              27.3/123.9 |
| jigsaw/medium   |                      0 |                     1 |                           1 → 22 |                   4 → 8 |                     49-57-67 |           133788 |              73.6/338.6 |
| jigsaw/hard     |                      9 |                     8 |                           1 → 19 |                   3 → 4 |                     48-61-73 |           430608 |            330.5/1288.1 |
| killer/easy     |                      0 |                     0 |                           1 → 18 |                 64 → 64 |                     18-38-54 |           296665 |               23.9/37.8 |
| killer/medium   |                     21 |                    21 |                           1 → 19 |                 44 → 44 |                     55-65-79 |          1000000 |               78.0/94.2 |
| killer/hard     |                     64 |                    64 |                            1 → 1 |                   1 → 1 |                  112-112-113 |          1000000 |             100.2/115.8 |
| thermo/easy     |                      0 |                     0 |                           1 → 21 |                 64 → 64 |                     15-46-55 |            88938 |               20.3/26.0 |
| thermo/medium   |                     45 |                    36 |                           1 → 17 |                 20 → 29 |                     56-58-70 |          1000000 |              90.8/143.2 |
| thermo/hard     |                     60 |                    50 |                           1 → 11 |                  5 → 15 |                     62-64-74 |          1000000 |             109.0/155.9 |
| arrow/easy      |                      3 |                     7 |                           1 → 17 |                 62 → 58 |                     22-43-53 |          1000000 |              19.2/125.3 |
| arrow/medium    |                      0 |                     0 |                           1 → 19 |                 64 → 64 |                     21-51-65 |            75786 |               21.6/28.3 |
| arrow/hard      |                     45 |                    38 |                           1 → 14 |                 20 → 27 |                     61-61-89 |          1000000 |             114.1/197.6 |

## Trace and fallback review

Technique tiers remain the primary grade. Steps, placements, eliminations, removals, variant steps and complete technique totals are retained as workload facts in the JSON report; clue count and wall time do not become human difficulty scores.

Easy traces span 15–58 steps across types: direct arithmetic/path clues can leave short traces, while Classic's clue target gives 45 placements. Medium policies predominantly add intersections or arithmetic combinations; Hard requires pairs beyond Medium. Classic Expert traces span 54–69 steps, with 33 highest-technique XY-Wing cases, 30 coloring cases and one naked-triple case; other advanced deductions also occur as intermediate steps. All trace conclusions were checked against independent solution facts.

Killer Hard remains 64/64 verified fallback in both corpora, with 112–113 steps dominated by the authored pair/intersection trace. Its broad random cage layouts rarely produce a matching pair-dependent puzzle within the unchanged allowance. This is a material concentration limit rather than evidence of broader Hard generation; Killer's aggregate diversity comes from Easy/Medium. Thermo fallback decreases from 105 to 86 across tiers, and Arrow from 48 to 45.

The two per-tier fallback regressions were investigated: Jigsaw Medium 0→1 and Arrow Easy 3→7. Read-only stage-work probes show Jigsaw Medium seed `036` abandons two layouts, then spends 979,173 remaining nodes on its third terminal. Across that request, terminals consume 979,344 work, geometry 40, uniqueness/necessity 17,030 and assessment 3,586. Arrow Easy seed `001` uses 973,534 work in uniqueness/necessity and 26,268 in assessment across two layouts. Killer Hard seed `000` similarly uses 959,507 work in uniqueness/necessity and 40,373 in assessment before fallback. Both regressions retain independently verified matching fallback, preserve total work bounds and improve broader terminal diversity; Jigsaw Hard and Arrow Hard fallback decrease. No limit, tier policy, seed set or production timeout was increased to conceal these outcomes.

Regional unit-mask caching and noncompetitive MRV scan short-circuiting reduce repeated scans without changing seeded choices or node work. On this run, the two slow regional requests dropped from about 8.68 s / 5.79 s to 6.45 s / 3.72 s. Real emitted Worker checks include these seeds and fixed type/tier fixtures at `/` and `/sudoku/`. Device/runtime timeout remains an explicit transport outcome, independent of seeded engine acceptance.

Stored puzzles remain snapshots, original daily IDs/results retain precedence, and new daily construction remains Medium. All 19 combinations have a forced independently verified fallback and explicit fallback exhaustion regression. No accounts, telemetry, manual calibration or numeric score was introduced.
