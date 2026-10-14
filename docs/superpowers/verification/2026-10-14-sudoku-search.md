# Shared Sudoku Search Verification

The optimization covers Classic, Diagonal, Jigsaw, Killer, Thermo and Arrow. All 1,216 fixed requests delivered independently unique puzzles with matching complete assessments. Fresh construction increased from 982 to 1,163 requests; verified fallback decreased from 234 (19.2%) to 53 (4.4%). The shared counter was faster on the same sparse authored inputs for every type. This does not imply that every generation tier became faster.

The user explicitly authorized algorithm and generator changes across all types, including changed seed outputs. Current identities are `sudoku-v4` for Classic and `sudoku-variants-v4` for variants. Rating remains `sudoku-rating-v2`: machine search does not change the player technique policies. Stored boards, results, assessments, time, assistance and daily formal eligibility remain authoritative snapshots.

The [machine-readable comparison](2026-10-14-sudoku-search-corpus.json) contains the fixed seeds, versions, host, limits, per-tier generation statistics and algorithm measurements. The baseline is the delivered v3 corpus described in [Variant Generation Corpus Verification](2026-10-14-sudoku-generation-corpus.md), against repository commit `52df1c5`.

## Selected implementation

`search.ts` validates inputs and delegates every type to `propagationSearch.ts`. Domains use nine-bit masks, including singleton masks for givens. A singleton excludes its digit from duplicate peers; a complete nine-cell unit requires a position for each digit. Arithmetic clues obtain exact local support through the existing constraint engine. A reduction queues affected cells, units and clues until a fixed point, rather than recalculating the whole board at every recursive visit.

MRV search branches only after propagation. Each child copies its parent's pruned domains and owns subsequent mutations. The counter stops after proving two solutions; finding one solution before work or node exhaustion remains inconclusive. Visits, cell propagation, bounded unit sweeps, clue checks and support enumeration consume the same caller allowance. Full units, duplicate peers and arithmetic paths retain their distinct meanings, including repeated Arrow shaft digits where peers permit them.

Terminal construction now maintains unit digit masks for Classic and Diagonal as well as Jigsaw. Forty-eight comparisons against the prior implementation produced identical complete terminals and work counts for the same supplied random streams. The identity upgrade deliberately changes the streams used by new generation requests.

Killer Hard additionally evaluates logical tier before exact counting. Complete different-tier states may remain tentative construction states; ungraded states are rolled back. Every delivered candidate still requires exact uniqueness, a complete matching assessment and meaningful variant rules. Difficulty, geometry, necessity and fallback validation remain separate gates.

## Algorithm comparison

The selected approach follows the constraint-propagation and search method described by [Peter Norvig](https://www.norvig.com/sudoku.html), adapted to the repository's rule model, finite budgets and two-solution counting. The implementation remains pure TypeScript and adds no production dependencies.

- **Whole-cage Algorithm X/DLX:** [Knuth's paper](https://arxiv.org/abs/cs/0011047) and [KDE's cage generator](https://raw.githubusercontent.com/KDE/ksudoku/master/src/generator/cagegenerator.cpp) informed a bounded small-cage prototype. It was much faster than the original Killer search. On 64 real construction states, final propagation took about 0.568 ms median versus DLX's 0.807 ms, with all independent counts matching. Propagation also covers the other five types without factorial whole-cage option encoding, so DLX is preserved only as an ignored experiment.
- **Incremental SAT:** a Node probe using [logic-solver](https://github.com/meteor/logic-solver) 2.0.1 matched all independent counts for 64 fixed states and 576 changing-givens queries. Model creation plus the first count took about 20.7 ms median; reusing a model for changed givens took about 0.177 ms. Incremental reuse is promising. The tested JS interface exposes no work-budget/interruption hook, and browser integration was not measured. It is not a production dependency.
- **Z3/WASM:** the [first-party JavaScript documentation](https://raw.githubusercontent.com/Z3Prover/z3/master/src/api/js/PUBLISHED_README.md) describes browser threading and SharedArrayBuffer requirements. Introducing that runtime would add deployment requirements to the current static application; it was not benchmarked here.
- **Cage digit-set support:** a separate suffix-DP prototype improved its isolated large-cage support case but still produced 64/64 Killer Hard fallback and slowed that generation probe. It was reverted and retained only as an experiment.

The algorithm measurements are local Node measurements, not process cold starts or browser startup measurements. Rules are compiled outside the timer; the public original and selected counter calls include input validation. Nineteen authored type/tier fixtures each supplied five queries: original givens, the complete solution and two/four/eight added givens. All 95 queries matched independent solution counts. The following table reports the 76 sparse queries, excluding the trivial completed grids.

| Type     | Sparse queries | Original counter median ms | Shared counter median ms |
| -------- | -------------: | -------------------------: | -----------------------: |
| Classic  |             16 |                      0.444 |                    0.183 |
| Diagonal |             12 |                      0.294 |                    0.127 |
| Jigsaw   |             12 |                      0.211 |                    0.079 |
| Killer   |             12 |                      1.596 |                    0.218 |
| Thermo   |             12 |                      0.899 |                    0.179 |
| Arrow    |             12 |                      0.205 |                    0.113 |

Terminal construction medians were approximately 0.338 → 0.261 ms for Classic and 0.413 → 0.319 ms for Diagonal. Jigsaw was already using masks and remained approximately 1.5 ms. These small timings are sensitive to JIT and host scheduling; they are evidence for this sample, not universal speed guarantees.

## Complete generation corpus

The corpus retains the original 64 seeds for each of 19 supported combinations. Default limits remain 20 layouts, 1,000,000 construction work, 500 logic steps and a separate 1,000,000 fallback work. The real Worker timeout remains 15,000 ms. Independent verification covers uniqueness, full solutions, structure, variant necessity, matching tier and each trace conclusion. All aggregate terminal and geometry diversity gates passed.

The host was Windows `10.0.26300`, Intel Core Ultra 9 285K, Node.js `26.10.0`. Generator timing excludes the independent oracle and assessment replay. The final corpus ran after the unit suite; its test run took 153.65 seconds. Summed generator time was 170.8 → 111.5 seconds, and overall median/p95 was 68.2/543.4 → 40.0/320.7 ms. Versions and generated layouts differ, so these full-generation comparisons include changed construction paths and cannot isolate the counter alone.

| Type/tier       | Fallback / 64 before → after | Terminal family lower bound | Canonical geometries | Generator median / p95 ms before → after |
| --------------- | ---------------------------: | --------------------------: | -------------------: | ---------------------------------------- |
| Classic/Easy    |                        0 → 0 |                     19 → 20 |                1 → 1 | 14.2 / 15.7 → 12.2 / 15.2                |
| Classic/Medium  |                        0 → 0 |                     20 → 22 |                1 → 1 | 94.5 / 441.4 → 65.9 / 243.9              |
| Classic/Hard    |                        9 → 6 |                     20 → 18 |                1 → 1 | 265.6 / 835.6 → 156.0 / 410.5            |
| Classic/Expert  |                        0 → 2 |                     18 → 19 |                1 → 1 | 158.0 / 514.7 → 94.5 / 303.8             |
| Diagonal/Easy   |                        0 → 0 |                     18 → 21 |                1 → 1 | 14.6 / 19.7 → 17.0 / 22.3                |
| Diagonal/Medium |                        0 → 0 |                     19 → 17 |                1 → 1 | 39.2 / 409.5 → 32.0 / 152.1              |
| Diagonal/Hard   |                        0 → 0 |                     22 → 18 |                1 → 1 | 288.2 / 1538.0 → 91.2 / 395.1            |
| Jigsaw/Easy     |                        0 → 0 |                     23 → 22 |                9 → 7 | 27.3 / 167.4 → 24.3 / 82.1               |
| Jigsaw/Medium   |                        1 → 0 |                     22 → 19 |                8 → 6 | 73.6 / 425.4 → 53.1 / 148.8              |
| Jigsaw/Hard     |                        8 → 6 |                     19 → 20 |                4 → 4 | 330.5 / 1363.6 → 132.5 / 607.6           |
| Killer/Easy     |                        0 → 0 |                     18 → 19 |              64 → 64 | 23.9 / 38.6 → 20.6 / 27.2                |
| Killer/Medium   |                       21 → 0 |                     19 → 22 |              44 → 64 | 78.0 / 94.4 → 44.1 / 57.3                |
| Killer/Hard     |                      64 → 38 |                      1 → 15 |               1 → 27 | 100.2 / 118.8 → 164.5 / 334.8            |
| Thermo/Easy     |                        0 → 0 |                     21 → 20 |              64 → 64 | 20.3 / 26.0 → 18.5 / 25.9                |
| Thermo/Medium   |                       36 → 0 |                     17 → 20 |              29 → 64 | 90.8 / 145.6 → 107.7 / 313.4             |
| Thermo/Hard     |                       50 → 1 |                     11 → 22 |              15 → 64 | 109.0 / 159.0 → 150.9 / 489.4            |
| Arrow/Easy      |                        7 → 0 |                     17 → 19 |              58 → 64 | 19.2 / 126.1 → 19.0 / 83.0               |
| Arrow/Medium    |                        0 → 0 |                     19 → 20 |              64 → 64 | 21.6 / 28.3 → 19.9 / 24.8                |
| Arrow/Hard      |                       38 → 0 |                     14 → 19 |              27 → 64 | 114.1 / 201.3 → 107.6 / 415.6            |

Intercalate counts provide a transformation-invariant family lower bound; equal counts do not establish equivalence. Canonical geometry ignores givens and clue numbering. Neither measure grades player difficulty.

## Remaining limits and regressions

Killer Hard now freshly constructs 26/64 puzzles, but still uses verified fallback for 38/64 (59.4%). Its median generation time increased because the generator spends more time reaching new matching Hard states instead of always falling back. Thermo Medium/Hard also trade longer construction for substantially fewer fallback puzzles. Arrow Hard has a lower median and higher p95. Diagonal Easy is slightly slower in this changed-layout corpus. These are reported rather than hidden by larger allowances or easier tier policies.

Classic Expert fallback increased from zero to two. Seeds `024` and `048` hit the 20-layout cap after 418,743 and 422,749 construction work, respectively; neither exhausted the million-work allowance. Both delivered independently verified Expert fallback. New identity/layout selection is part of this comparison.

Jigsaw Hard seed `020` is the final corpus's slowest request, at approximately 3.83 seconds in Node. It exhausts construction in its first terminal attempt and delivers verified fallback. A work allowance is not a wall-clock guarantee. The browser checks therefore use the final high-work regional seeds (`019` Medium and `020` Hard), retaining the real 15-second timeout at both roots.

## Verification and review

- Seven sparse Hard/Expert branching regressions failed under the original search and passed with the shared counter. Shared-budget late exhaustion and retry isolation are exercised for all seven fixtures. Existing zero/one/multiple, source-immutability and arithmetic tests remain active.
- All 684 unit tests across 60 files passed. The separate full corpus passed all 19 groups and 1,216 requests. Root and `/sudoku/` production builds passed.
- All four configured TypeScript projects, ESLint, repository Prettier checking and `git diff --check` passed.
- The 36-check real Worker matrix passed across Chromium desktop/mobile, Firefox and WebKit, including generated Killer Hard, all Classic tiers, each variant, rule evidence and subpath save/reload. The final high-work regional seed check was repeated successfully in each project at both roots, without increasing the timeout. Puzzle payloads and complete assessment summaries are compared with the shared Node engine. Mobile configurations are browser emulation.
- An independent read-only review reported no remaining findings and ran 443 additional checks, including overlapping Thermo/Arrow clues, independent counts, pre-consumed budgets, late multiplicity exhaustion, mutation isolation and terminal retry boundaries. Final report wording and ignored prototypes were excluded from that review and remain the executor's responsibility.

Experiments and raw observer output remain under ignored `.superpowers/killer-generation/`; no shipping test imports them. Production package dependencies and the lockfile are unchanged. The work remains on the existing branch without a worktree.
