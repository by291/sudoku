# Sudoku Generation and Internal Difficulty Rating

Date: 2026-10-13

Status: Approved by the user on 2026-10-13, with authorization to commit this design and continue with implementation planning. Phase A is the first implementation milestone; Phase B follows after its compatibility and assessment foundations are verified.

## 1. Intent and decisions

Improve puzzle generation and difficulty assessment for the existing Chinese-language Sudoku application. A delivered puzzle must have a unique solution, be solvable with the techniques supported for its type and difficulty, and carry an explainable assessment. Development tools and production must execute the same assessment code with the same policies.

The agreed direction is:

- Use the existing pure TypeScript engine, candidate masks, rule-aware search, and logical deductions.
- Own the rating policy rather than integrate Sudoku Explainer (SE), HoDoKu, or another rating dependency.
- Classify difficulty by the lowest supported technique policy that the deterministic logical solver can finish with.
- Record reasoning workload to distinguish puzzles within the same difficulty tier.
- Reuse technique definitions and deduction evidence across generation, assessment, hints, and teaching.
- Preserve static hosting, browser computation, current player workflows, and Chinese interface copy.
- Keep uniqueness, deduction correctness, and difficulty assessment as distinct responsibilities.
- Preserve historical puzzle identities and saved facts when generation or rating evolves.

This document extends the [first-release product design](2026-10-11-sudoku-design.md) and the [variants design](2026-10-11-sudoku-variants-design.md). Their behavior remains authoritative except for the changes explicitly described here. Module ownership follows [Web Architecture](../../architecture.md), and extension requirements follow [Adding a Sudoku Variant](../../variant-extension.md).

## 2. Research context and approaches considered

Puzzle construction, exact validation, and human-oriented rating solve different problems. A practical construction process creates a complete solution, removes clues, verifies uniqueness, and checks logical solvability. Faster machine search does not establish lower difficulty for a player.

There is no universal mapping from labels such as Easy and Hard to an objective human difficulty. SE emphasizes the hardest technique on its chosen solving path; HoDoKu combines technique levels with accumulated step scores. Both depend on their technique coverage, configuration, and solving order. They are useful reference systems, but neither defines this application's policy.

Research on human solving supports considering both the complexity of individual deductions and dependencies between steps. This motivates workload statistics now and possible bottleneck analysis later. Clue count and search cost remain construction and performance data, not the difficulty oracle.

| Approach                                                                | Benefits                                                                                                                  | Trade-offs                                                                                                       | Decision                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Internal TypeScript assessment shared by Node and browser workers       | Fits existing variants, typed evidence, Chinese explanations, and teaching; one implementation controls both environments | Technique coverage and calibration are our responsibility                                                        | Selected                                            |
| Java SE during development and a different production rater             | Convenient external reference during development                                                                          | Does not guarantee the same puzzle receives the same assessment in production                                    | Rejected                                            |
| One externally supplied or compiled SE/HoDoKu core in both environments | Can share a mature external scoring implementation                                                                        | Adds integration, runtime, upstream-version, and evidence-adaptation work; does not replace our variant policies | Rejected in favor of the selected internal approach |
| A rating service running Java in production                             | Can reuse the original Java implementation                                                                                | Introduces a backend and network dependence into the current static application                                  | Outside scope                                       |

Algorithm alternatives include MRV backtracking, Algorithm X with Dancing Links (DLX), and constraint programming. Reuse rule-aware MRV backtracking first. DLX can be evaluated for a demonstrated Classic performance problem; a general constraint-programming runtime is unnecessary for the present constraint model. No algorithm replacement is justified solely by its reputation or an assumed speed advantage.

Primary references:

- [Norvig: Solving Every Sudoku Puzzle](https://www.norvig.com/sudoku.html), for candidate constraints and minimum-remaining-values search.
- [Knuth: Programs](https://www-cs-faculty.stanford.edu/~knuth/programs.html), for DLX and Sudoku exact-cover implementations.
- [Exact Method for Generating Strategy-Solvable Sudoku Clues](https://arxiv.org/abs/2005.14098), for generation constrained by specified solving strategies.
- [Difficulty Rating of Sudoku Puzzles: An Overview and Evaluation](https://www.fi.muni.cz/~xpelanek/publications/sudoku-arxiv.pdf), for evaluation against human performance and step dependency.
- [SE FAQ](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---FAQ) and [HoDoKu rating documentation](https://hodoku.sourceforge.net/en/docs_cre.php), for their rating semantics and limitations.

These references support the design rationale. External raters are not required for runtime operation, development commands, or acceptance tests, and internal scores must not be presented as SE or HoDoKu scores.

## 3. Current implementation

| Area                               | Current behavior                                                                                                                                     | Planned treatment                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `core/sudoku/search.ts`            | Candidate-based MRV backtracking; counts up to two solutions; explicit search/work budget exhaustion                                                 | Retain as the exact-validation foundation                                                           |
| `core/sudoku/generation.ts`        | Classic terminal grids come from legal transformations of one template solution; clue removal checks uniqueness and logical tier; verified fallbacks | Preserve legacy behavior; add broader terminal generation under a new generation version            |
| `core/sudoku/logic.ts`             | Deterministic deduction runner with steps; Classic and variant rating return a tier when supported policies solve                                    | Separate assessment orchestration from the logical runner; derive statistics from successful traces |
| `core/sudoku/techniques.ts`        | Five Classic techniques, variant technique identifiers, typed actions and explanatory evidence                                                       | Keep as the shared technique/evidence contract                                                      |
| `core/sudoku/variantTechniques.ts` | Variant deduction detectors and three technique policies                                                                                             | Retain detectors; place rating policies with their explicit assessment owner                        |
| `core/sudoku/variantGeneration.ts` | Seeded template transforms, variant geometry, uniqueness, logical rating, rule necessity, and fallbacks                                              | Retain orchestration and legal-transform contracts                                                  |
| `worker/`                          | Validated generation/hint messages, cancellation, stale-result fencing, and timeout handling                                                         | Execute the shared assessment in the existing worker boundary                                       |
| Compatibility fixtures             | Historical generation outcomes frozen across types, difficulties, and fallback paths                                                                 | Preserve existing expectations; add separately versioned cases                                      |

Classic already has three product tiers: singles; singles plus locked candidates; and those techniques plus naked/hidden pairs. The proposal formalizes and enriches that policy rather than creating a rating system from scratch.

## 4. Responsibilities and dependency direction

Keep the engine independent of Vue, Pinia, DOM APIs, storage, and worker globals.

- `search.ts` establishes zero, one, or multiple solutions, or an inconclusive budget outcome.
- `logic.ts` finds and applies sound deductions and runs a specified technique policy.
- `techniques.ts` owns shared technique identifiers, actions, and evidence semantics.
- `ratingPolicies.ts` owns typed, static, ordered policies for all six types and the assessment version.
- `rating.ts` orchestrates assessment, selects the successful policy, and summarizes its trace.
- Generation modules construct candidates and use search and rating to decide acceptance.
- A thin development CLI handles input/output and calls the same engine exports used by workers.
- Workers own transport and resource lifetime; storage owns persistence and boundary decoding.

`rating.ts` may depend on `logic.ts` and the policy definitions. The logical runner must not import rating orchestration. Existing rating entry points move to the rating owner with their legacy signatures and behavior preserved during the compatibility phase. Update internal imports instead of retaining a circular forwarding facade.

Assemble policies statically with compile-time coverage of every supported variant and technique. An entry must use only techniques applicable to its rules. Technique order is explicit and deterministic; it is not inferred from object enumeration or localized names. Do not introduce a dynamic plugin framework.

## 5. Difficulty policy

For each type, define nested Easy, Medium, and Hard policies. Assess from Easy to Hard, starting each attempt from the same immutable board and rules. The first successfully completed logical run determines the tier.

| Tier   | Classic                                       | Variant additions where applicable                                                                       |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Easy   | Naked singles and hidden singles              | Cage duplicate exclusion and remainder arithmetic; positional Thermo bounds; one-unknown Arrow equations |
| Medium | Easy techniques plus locked candidates        | Supported cage and Arrow combination eliminations                                                        |
| Hard   | Medium techniques plus naked and hidden pairs | The same higher-tier deductions applied to actual regions, units, and variant constraints                |

Diagonal and Jigsaw use their compiled complete units. Killer cages and Arrow shafts must not be treated as complete nine-digit units. Variant deductions must expose the rule evidence behind an elimination or placement.

Tier means the lowest configured policy that our deterministic solver successfully uses. It does not claim to prove that no alternative easier human solving path exists. Fixed search order, detector behavior, candidate initialization, and policy coverage are part of the assessment version.

The existing labels remain 简单、中等、困难. Hard denotes the highest tier currently supported by this product. Advanced chains, fish, and wings are future technique extensions; they are not silently assigned to Hard while the hint engine cannot explain them. Labels compare puzzles within a type, and records remain separated by type and assistance.

If all supported policies stall, return an ungraded outcome. If a budget runs out, return an inconclusive outcome. Neither outcome is a difficulty tier, and neither is an acceptable assessment for a new-version generated puzzle.

## 6. Reasoning workload

Summarize only the successful logical trace. Failed lower-tier attempts consume assessment budget but do not contribute to the reported reasoning workload.

The first assessment version records:

- Total logical steps.
- Placement-step count.
- Elimination-step count.
- Number of candidate removals, counting actual changes made by each step.
- Counts for every technique, including zero counts for supported techniques that were unused.
- Highest technique tier used and the highest-ranked technique within that tier; ties use the fixed policy order. An already complete board has no highest technique.
- Count of deductions whose evidence includes a variant constraint, including unit deductions supported by earlier variant premises.

Count a logical deduction as one step regardless of how many candidates it removes. Count placements and removals separately so broad elimination steps are visible. Input clues, candidate initialization, search guesses, no-op actions, and work-budget consumption are not logical steps.

These are product metrics of a particular deterministic trace, not measurements of player time. They support within-tier workload comparison and corpus inspection. The first release exposes the existing three tiers to players and keeps these statistics internal; it does not publish a universal numeric score or add new difficulty choices.

Do not fix arbitrary weights or workload acceptance thresholds in the first release. A later policy may define a weighted workload score and within-tier bands after evaluating a versioned corpus and player feedback. Such weights and bands require their own reviewed policy revision. Until then, generation accepts by technique tier, and CLI reports show the metric distributions without converting them into additional grades.

Bottleneck metrics, such as the number of available next deductions at each state, are deferred. They require extra detector enumeration, deduplication, and budgets. Their effect on human difficulty must be validated before they influence generation.

## 7. Assessment contract

Introduce a pure assessment entry point taking a validated board, rules, a selected assessment version, and deterministic limits. It must not mutate the inputs.

The domain result distinguishes:

| Outcome            | Meaning                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `rated`            | A configured policy logically completed the board; includes type, assessment version, tier, and workload statistics |
| `ungraded`         | All configured policies stalled within the limits; unsupported technique coverage is the reason                     |
| `budget-exhausted` | Assessment could not finish within the supplied step/work limits                                                    |
| `invalid`          | Boundary validation or a confirmed rule violation rejected the input; includes explicit issues                      |

A `rated` result is not a substitute for an independent uniqueness check. An invalidity claim must be supported by validation or a confirmed contradiction, not inferred from a stalled logical run.

Use `sudoku-rating-v1` as the initial assessment version, with complete type-specific policy definitions. Persisted and transported summaries carry this version, their type, and the derived difficulty. Runtime decoders validate technique identifiers, finite nonnegative integer counts, count relationships, supported policy versions, and agreement with the associated puzzle's type and difficulty.

Full traces are available for tests and development walkthroughs but are not persisted for every game. Store the compact summary. Requesting a hint continues to analyze current player entries; an initial rating trace is not a hint script for a changed board.

## 8. Development and production parity

The development CLI and the production worker import the same engine assessment function and static policies. No environment-specific score calculations, default technique lists, or fallback classifications are permitted.

The CLI accepts puzzle/rule input and supports single assessment, batch JSONL reports, and fixed-seed generation reports. Reports include the assessment version, input identity, limits, outcome, tier, workload, and generated/fallback source when available. These commands operate on local files and do not upload player data.

Workers continue validating messages and rejecting stale responses. Both adapters map domain outcomes explicitly. Cancellation and wall-clock timeouts describe execution interruption; they never become a claimed difficulty or select a different generated puzzle.

For the same board, rules, assessment version, and work limits, Node and browser execution must return identical domain results and workload counts. Optional adapter timings are performance diagnostics and are excluded from equality checks and seed identity.

CLI and worker conformance is verified by invoking both adapters on fixed fixtures. Sharing a module is necessary but does not by itself prove that adapters supplied matching rules, versions, and limits.

## 9. Generation pipeline

The long-term pipeline is:

1. Construct a valid terminal grid and, for variants, valid rule geometry.
2. Visit removable clues in a seeded order and try a removal.
3. Use rule-aware search to establish uniqueness, stopping after the second solution.
4. Assess logical solvability and tier against the actual rules.
5. Deliver only a candidate matching the requested tier; verify variant rule necessity as well.
6. When construction limits are exhausted, select a seeded authored fallback and independently validate its uniqueness, requested tier, and applicable rule-necessity conditions.

Clue counts can guide puzzle shape but do not determine the grade. A minimal puzzle has no individually removable clue while retaining uniqueness; minimality is not the same as minimum clue count or high difficulty. Neither minimum clue count nor minimality is a delivery requirement here.

Before any clue removal, every terminal grid must satisfy all active rules. Removing clues from that known solution preserves at least one solution. If validation reports no solution, treat it as a construction or validation inconsistency rather than accepting the candidate.

For new Classic generation, use seeded randomized candidate-based search to construct terminal grids beyond the equivalence class of the current template solution. Budget terminal construction as well as clue removal and assessment. Broader sampling is an improvement in structural variety, not a claim of uniform sampling of all valid Sudoku grids.

Keep variant geometry construction in its existing typed strategy owners. Each strategy declares legal transformations. Spatial changes remap the complete geometry; arithmetic variants cannot accept arbitrary digit relabeling. Additional clues must matter: reject decorative variants that remain the same uniquely solvable Classic puzzle when the additional rules are removed.

Higher-tier puzzles must fail the lower-tier policies before they qualify. A candidate that stalls beyond all supported policies is not automatically Hard. Construction order, transformation choices, fallback selection, and acceptance decisions use only deterministic inputs and work limits.

## 10. Budgets and fallback behavior

Preserve legacy generation limits and accounting in the compatibility phase: 20 layout attempts, one million search nodes for Classic construction, the current variant work accounting, 500 logical steps per analysis, and separate fallback validation budgets. Do not retroactively change random consumption or budget boundaries for existing generation versions.

The initial additional assessment has an explicit 500-step limit per policy run and a separate one-million-unit work budget shared across its policy attempts. Arithmetic assignments and propagation consume the existing engine work units. Its exhaustion makes the added summary unavailable; the compatibility-phase puzzle remains validated by the unchanged legacy generation pipeline. Surface that outcome explicitly instead of fabricating statistics.

For new generation versions, use one million work units across terminal construction, uniqueness checks, and logical assessment, with a separate one-million-unit fallback validation budget. Retain 20 layout attempts and 500 logical steps per policy run. Repeated search and arithmetic work count toward the aggregate limit. Require a complete `rated` outcome before delivering a new-version puzzle.

Fallback validation must finish successfully. If it exceeds its budget, return the existing explicit failure outcome rather than reducing the requested difficulty. Preserve the 15-second main-thread timeout and retry/cancellation behavior. Device speed may interrupt a request but must not change its deterministic answer.

## 11. Versioning and persistence

Generation versions identify puzzle construction; assessment versions identify rating semantics. Keep them separate.

- Preserve `sudoku-v1` and `sudoku-variants-v1` generation outputs and the historical compatibility fixture expectations.
- Enrich assessment as a sidecar result during the compatibility phase. Keep the legacy `Puzzle` and raw generation-result contracts unchanged; carry the summary separately through a typed worker envelope and optional session/result metadata.
- Add optional assessment metadata to current format-2 session/result records without changing the IndexedDB schema. Existing records remain valid without it, and older readers may ignore the additive summary.
- Validate present metadata. If optional metadata is corrupt or unsupported, report its unavailability and retain the independently valid puzzle/session; never trust its grade or silently substitute a new assessment as historical fact.
- Do not automatically rescore old completed results or rewrite their difficulty. Existing saves restore the stored puzzle rather than regenerate it.
- Add new generation versions for terminal-diversity changes, new acceptance filters, changed seed consumption, or changed rating semantics used in generation. Route new starts to the new versions only after their implementation and validation are complete.
- Runtime parsers must recognize both retained and new identities. Legacy daily IDs, formal-attempt eligibility, and historical records remain valid. Version selection must not overwrite another day's save or create another formal attempt under the existing rules.

Phase B introduces `sudoku-v2` for Classic; existing variant versions remain unchanged. Select the daily generation version through an explicit release-owned date/type mapping, independently of the default version for free play. A release sets its daily cutover to a future Beijing calendar date; earlier dates retain their previous generation versions. Formal daily session IDs continue to depend on date and type, not generation version. Existing stored sessions and completed attempts take precedence over constructing another puzzle for the same identity.

If a future assessment changes a detector, technique order, policy, or workload definition, increment the assessment version. If that change affects generated puzzle selection, increment the applicable generation version as well. Historical summaries are snapshots, not live views of the latest policy.

## 12. Delivery phases

### Phase A: Formalize shared internal assessment

Extract explicit type-specific policies, introduce the assessment contract and workload summary, and preserve the existing tier semantics. Add a thin Node CLI and production worker integration that invoke the same function. Carry optional assessment metadata without changing legacy puzzle identity or generation outcomes.

Use fixed fixtures and seeded reports to inspect each type/tier's statistics. Retain current Chinese labels, supported techniques, UI layouts, teaching content, and generated/fallback acceptance criteria. This phase needs no external rating dependency or backend.

### Phase B: Improve terminal diversity

Introduce broader seeded Classic terminal construction under a new generation version and integrate shared work accounting. Retain authored fallbacks and all uniqueness/logical/rule-necessity checks. Verify determinism, variety, cost, and all daily/save compatibility paths before switching new-game entry points.

Variant generation keeps its current strategy model. Expand terminal or geometry diversity for an individual variant only when its constraints, permitted transforms, and independently verified fixtures support it.

### Deferred extensions

Numeric workload scores, workload-based generation filters, bottleneck analysis, advanced technique tiers, and deeper variant teaching are separate follow-up decisions. Any new technique requires sound candidate support, typed proof evidence, worker validation, a player explanation, teaching fixtures where applicable, and independent correctness tests. Apply the existing variant extension checklist for new constraint primitives.

Player-feedback calibration is also deferred. The current static application can support local analysis or explicit exports later; this proposal does not introduce telemetry, uploads, accounts, or a data-collection service.

## 13. Verification and acceptance

### Assessment and deduction correctness

- Use independently justified fixtures for each of the six types and three tiers, including a known deduction above the preceding tier.
- Check the successful trace's actions and premises against fixture facts and replay them to the expected solution.
- Test that unsuccessful lower-tier attempts neither leak candidate state nor inflate successful-trace statistics.
- Test stable technique ordering, exact count semantics, no-op rejection, input immutability, malformed rules, ungraded results, and all budget outcomes.
- Do not use the production solver as the sole oracle for its own conclusions. Reuse independent reference constraints/solvers already present in test fixtures and explicit expected facts.

### Generation and identity

- Retain all existing compatibility expectations unchanged.
- For fixed new-version seeds across types and difficulties, verify exact reproducibility, unique solutions, logical completion at the claimed tier, and verified fallback behavior.
- Validate that terminal-diversity sampling produces more than one terminal equivalence class using an independently checked transformation-equivalence oracle on a small fixed corpus. Do not claim diversity merely because digits or clue locations changed.
- Verify variant geometry, permitted transformations, and rule necessity independently.
- Bound terminal construction, repeated arithmetic work, policy attempts, and fallback validation; exercise exhaustion at each stage.

### Adapter and persistence behavior

- Run identical fixture requests through the Node CLI and real production worker assets and compare domain outcomes exactly.
- Validate malformed transport/metadata, missing legacy metadata, unsupported summary versions, and disagreement between summary and puzzle identity.
- Verify cancellation, stale replies, timeout/retry behavior, save restoration, new generation-version dispatch, and retained daily identities.
- Keep generation and assessment usable at both the hosting root and `/sudoku/`.

### Release checks and performance

Implementation requires type checking with `vue-tsc`, lint, formatting, unit tests, production and subpath builds, and the relevant Playwright projects. Include generation, hints, lessons, daily play, and persistence regressions because they share the affected contracts. Record unavailable browser runtimes rather than claiming they passed.

Benchmark a fixed versioned corpus with identical work limits. Report generated/fallback frequencies, ungraded/exhausted outcomes, workload distributions, and execution time separately. A worker must keep the UI responsive and preserve cancellation. A faster machine does not change grade or fallback selection. Tune algorithms only in a new version when tuning alters deterministic outcomes.

For this documentation task, review content, links, and Prettier formatting only. Application checks belong to the later implementation.

## 14. Risks and mitigations

| Risk                                                            | Mitigation                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Product tiers do not match another publisher's labels           | Explain the supported technique policy; avoid claiming a universal standard                  |
| Greedy solving order changes the trace or misses an easier path | Fix and version detector/policy order; describe the rating as solver-relative                |
| Equal technique tiers hide different workloads                  | Preserve the workload vector and inspect corpus distributions before defining bands          |
| Own rating appears to certify its own correctness               | Validate uniqueness and deduction soundness independently from grade selection               |
| More varied terminals cost more work                            | Count terminal search in new-version budgets and retain verified seeded fallbacks            |
| Variant arithmetic hides a deduction's real premises            | Keep arithmetic reductions explicit and carry typed rule evidence into later unit deductions |
| A new rating silently changes daily puzzles or records          | Separate versions, preserve legacy generators/fixtures, and restore stored puzzles           |
| Metadata errors discard playable old saves                      | Validate the optional sidecar separately and report assessment unavailability                |

The immediate deliverable after written-design review is Phase A implementation planning. The selected architecture already supports Phase B without requiring a new runtime, external rater, or backend.
