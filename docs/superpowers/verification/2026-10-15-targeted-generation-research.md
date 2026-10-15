# Research: Targeted Expert and Killer Hard Generation

Date: 2026-10-15. Baseline: local commit `b73cc61`, with current v8 generation and rating v2. The user requested improving Classic Expert and Killer Hard success without increasing any budget, then explicitly requested external research before choosing the implementation direction. Production code remains unchanged during the research probes.

## Objective and constraints

Improve the probability of reaching the requested logical tier within 40 terminal/layout attempts, 4,000,000 aggregate work units, 500 logical steps and the three-second Worker deadline. A delivery still requires exact uniqueness, the current complete matching assessment and meaningful variant rules. Difficulty substitution, authored fallback, historical production dispatch and changes to rating policies are excluded. Existing stored boards and assessments remain authoritative.

Failure under finite attempts does not by itself demonstrate a correctness defect. The measured problems are generation efficiency and target-tier success. Work/layout exhaustion must continue to be reported honestly.

## Primary-source findings

- [HoDoKu's generator](https://github.com/PseudoFish/Hodoku/blob/master/src/generator/SudokuGenerator.java) constructs a full grid and removes clues while testing uniqueness. Its [background generator](https://github.com/PseudoFish/Hodoku/blob/master/src/generator/BackgroundGenerator.java) subsequently solves and filters for the requested grade, repeating construction when the grade does not match. This supports keeping generation and the logical difficulty oracle separate, but the large retry allowance cannot be imported into our fixed-budget product.
- [Tdoku](https://github.com/t-dillon/tdoku#generating-puzzles) searches through clue removal and recompletion with a scored candidate pool. Its machine-guess-based objective differs from our human-technique policy. The useful transferable idea is exploring nearby clue sets instead of discarding every terminal after one deletion path; its score and native/SIMD runtime are not selected.
- [KDE's cage generator](https://github.com/KDE/ksudoku/blob/master/src/generator/cagegenerator.cpp) treats cage size, singleton counts and possible digit combinations as generation parameters, with rollback for unsuitable cages. The narrow-space and anti-isolation rules are already present in our engine. Cage geometry remains a useful difficulty control, but neither size nor combination count replaces final logical grading.
- [Simon Tatham Solo's maintained source](https://github.com/chrisboyle/sgtpuzzles/blob/main/app/src/main/jni/solo.c) tests cage-only Killer states, uses solver feedback for adjacent-cage merging, and rolls back when the result exceeds its target. The earlier local merge experiment was weaker under our policies and is not being repeated without a new hypothesis. Solo's solver covers different techniques and its open-ended outer retry loop does not meet our request budget.
- [Andrew Stuart's generation and grading account](https://www.sudokuwiki.org/Sudoku_Creation_and_Grading.pdf), especially its Killer section, explains that excess singleton and two-cell cages can make high-grade puzzles unsuitable. It also separates required logical techniques from clue count. This motivates testing the cage-size distribution while retaining the existing exact tier oracle.
- [Nishikawa and Toda's exact strategy-solvable generation paper](https://arxiv.org/html/2005.14098v1) models the required solving strategies directly. Its CSP experiments include minute-scale generation and difficult cases exceeding 600 seconds; those timings do not support introducing that runtime for our three-second browser target.
- [Lakolam's first-party implementation account](https://www.lakolam.com/generators/sudoku/) describes an Expert clue-swap climb guided by required techniques. Its reported 15–35-second cost and difficulty downgrade on a miss do not fit our product. Treat the report as motivation for a much smaller measured neighbourhood, not evidence that its success rate transfers to this engine.

## Local diagnosis and previous experiments

Classic follows one seeded removal order per terminal. Every retained intermediate board must be rated, which can prevent exploration through a temporarily unsupported clue arrangement. The old v7 Expert seed 010 produced no Expert trial over 40 terminals; the current v8 64-seed sample succeeds for all Expert requests, but some need up to 28 terminals.

Killer Hard uses a fixed target cage-size range of two to four. The current exhausted seed 048 visits six cage layouts and repeatedly alternates between Medium and ungraded states with only two to eight remaining givens. Its grading consumes 99.48% of all work. Changing that terminal's cage information can be more useful than evaluating more masks under the same strong cages.

The previous all-type terminal-decision skeleton experiment increased overall exhaustion and is not selected. Known-solution alternative counting produced modest speed savings but did not improve the old exhaustion cases. Neither provides evidence of the requested target-tier improvement. The previous adjacent-cage merging prototype also underperformed the selected anti-isolation geometry.

## Isolated probes

All probes use the committed v8 identities, identical seed texts and unchanged aggregate limits. Baseline source is frozen under `.superpowers/targeted-generation-research/baseline/`; overlays are throwaway research and do not enter production imports. Node timers exclude validation. Each delivery is independently checked for structure, exact uniqueness, meaningful Killer rules and sound trace conclusions, then completely reassessed by the unchanged engine.

- **Expert neighbourhood:** retain a Hard-rated checkpoint after the existing greedy pass. After a miss, add two solution-consistent givens and try a different removal order, with at most two refinements per terminal. Every removal passes the exact counter and is screened; only a complete Expert result meeting the existing clue target may be delivered. All work stays in the original request budget.
- **Expert minimization and repair:** minimize under uniqueness, then add a small number of givens if the full logical oracle cannot finish. This tests HoDoKu-style final filtering without changing our required grade. It is not assumed better than neighbourhood exploration.
- **Killer cage distribution:** change the target-size range from two–four to three–four for the focused experiment. Connectivity, distinct solution digits, anti-isolation and exact acceptance remain unchanged. Residual smaller cages are still possible; this is a target-size policy, not a promise about every cage. Production adoption, if justified, would be scoped to Hard and preserve Easy/Medium behavior.

Initial 64-seed results and separate fixed samples are recorded below. The later samples became development evidence when they informed subsequent retry-profile experiments; no statistical claim or untouched-holdout claim is made for that tuning. Single-pass timings are diagnostic, not a statistical or cross-device guarantee.

## Selection evidence so far

The initial v8 64-seed comparison is not sufficient on its own. Expert neighbourhood exploration preserves 64/64 successes and reduces total charged work from 8,344,328 to 7,506,694; first-terminal successes increase from nine to thirteen. Minimization/repair also succeeds for all 64 but increases work to 10,920,325 and terminal attempts from 390 to 489, so it is not selected.

A separate 128-seed `targeted-holdout-v1` sample preserves all 128 Expert successes under neighbourhood exploration, reduces terminal attempts from 735 to 660, and changes total work from 16,080,152 to 15,938,777. A subsequent 64-seed `targeted-validation-v1` sample still succeeds for all Expert requests but increases work from 7,920,422 to 8,334,684. Benefits are uneven: do not promise lower cost for every request. The original historical Expert seed 010 is also reproduced privately under its v7 construction identity: baseline exhausts 40 layouts / 852,527 work, while neighbourhood exploration produces a fully verified Expert puzzle in 11 layouts / 282,065 work. This research identity override is absent from production.

The larger-cage-only Killer prototype improves the first corpus from 63/64 to 64/64, then regresses on the separate sample from 126/128 to 123/128. It is rejected as a global policy. Alternating the cage profile after the first failed layout improves that sample to 127/128, but introduces one exhaustion in the next sample, where baseline succeeds for all 64. The regressed request originally succeeds on its second layout. A subsequent probe preserves the first two normal layouts before using the alternate profile; results are recorded below. The later sample is now development evidence, not an untouched holdout for this subsequent adjustment.

## Final focused results

| Sample                  | Type    | Baseline ready | Candidate ready | Baseline work | Candidate work | Baseline terminals | Candidate terminals |
| ----------------------- | ------- | -------------- | --------------- | ------------- | -------------- | ------------------ | ------------------- |
| local-product-corpus-v1 | classic | 64/64          | 64/64           | 8,344,328     | 7,506,694      | 390                | 307                 |
| local-product-corpus-v1 | killer  | 63/64          | 64/64           | 60,532,760    | 26,110,560     | 80                 | 80                  |
| targeted-holdout-v1     | classic | 128/128        | 128/128         | 16,080,152    | 15,938,777     | 735                | 660                 |
| targeted-holdout-v1     | killer  | 126/128        | 128/128         | 119,416,745   | 52,340,802     | 159                | 159                 |
| targeted-validation-v1  | classic | 64/64          | 64/64           | 7,920,422     | 8,334,684      | 362                | 347                 |
| targeted-validation-v1  | killer  | 64/64          | 64/64           | 66,367,893    | 27,897,241     | 78                 | 78                  |

Across 256 Killer Hard requests, support reuse raises success from 253 to 256, with zero new exhaustions. All 253 previously successful puzzle/assessment payloads match exactly and every such request uses no more work. Total work is 106,348,603 versus 246,317,398 (-56.8%); single-pass Node generator time is 15,885.1 versus 20,129.5 ms (-21.1%). Timings exclude independent validation and do not certify browser/mobile performance.

The Expert neighbourhood retains all 256 current-v8 successes and rescues the original separately reproduced v7 Expert exhaustion. Aggregate terminal attempts decrease, but work and timing improvements are uneven between samples. Its value is a bounded additional route through the same terminal, not a demonstrated universal latency reduction.

The support memo is recreated for every logical workspace. It retains at most one complete entry per cage, matches context/constraint identity and every effective domain mask including fixed values, and owns saved cells/support arrays. Cache hits copy those arrays; incomplete enumeration is never saved. The caller still charges the constraint visit, and all earlier enumeration work remains in the cumulative allowance. No domains, deduction state or incomplete proof crosses clue masks. The current Node prototype is not a completed production typechecked implementation.

The historical Killer Hard seed 059 also reproduces its exact old failed result fingerprint at 4,000,000 work / three layouts. The memo prototype finishes a fully verified Hard puzzle in the same three layouts with 1,552,516 work. Its historical input identity is retained only in ignored research hooks, never in production dispatch.

## Recommended bounded implementation

1. Keep ordinary Classic generation first. For Expert only, retain a unique Hard-rated checkpoint and explore at most two small clue exchanges after the ordinary pass misses. Keep complete Expert assessment, exact counting, the existing clue target and all request budgets.
2. Keep Killer cage construction unchanged. Give each fresh logical workspace an owned, bounded memo for exact cage support. Recompute on any domain/clue change; retain complete facts only; keep technique priority, trace/evidence ownership, grade summaries and actual work accounting. This directly removes the measured repeated enumeration rather than tuning cage distributions against a few seeds.
3. Exclude minimization/repair, global larger cages and both retry-profile portfolios. The early alternate introduces a new exhaustion in the final sample; the delayed alternate moves the two holdout failures to different seeds while retaining the same success count. Neither provides the stable benefit of exact support reuse.
4. After approval, use production contract regressions and advance current generation identities for changed construction/budget outcomes. Verify a full 1,216-request same-version control, additional focused inputs, available real Workers at both roots and player flows. Preserve saved snapshots and formal daily facts. Do not introduce historical runtime branches.

Production remains at `b73cc61`; only this research documentation is uncommitted. The selected direction still requires the bounded-design approval before product implementation. The [machine-readable research record](2026-10-15-targeted-generation-research.json) contains every measured input/outcome/fingerprint and effective source hashes. Complete payloads and scripts remain under `.superpowers/targeted-generation-research/`.

## Approval and implementation

The user approved the selected bounded Expert neighbourhood and workspace-local Killer cage support designs on 2026-10-15. Implementation and current-v9 verification are recorded in the [release report](2026-10-15-targeted-generation-v9.md). The v8 measurements above remain historical research evidence.
