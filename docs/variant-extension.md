# Adding a Sudoku Variant

The engine uses typed, static definitions for Classic and the five variants. Generation, session transitions, worker transport, and persistence remain shared. A registry entry connects an implementation; it does not supply missing solver semantics.

Read [AGENTS.md](../AGENTS.md), [Web Architecture](architecture.md), and the [variant design](superpowers/specs/2026-10-11-sudoku-variants-design.md) first. Check installed versions and current official guidance before changing framework or browser APIs.

## Registration locations

| Responsibility                          | Location and contract                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule identity and payload               | `src/core/sudoku/ruleTypes.ts`: `SudokuVariant`, `PuzzleRules`, `RulesFor`, and `VariantRuleDefinition`                                                                                                 |
| Runtime decoding and compilation        | `src/core/sudoku/variants/*.ts` and `variantRegistry.ts`: complete typed definition map and checked dispatch                                                                                            |
| Geometry generation and safe transforms | `generationStrategies.ts` and the variant module: typed geometry capabilities and legal rule transformations; `generationLayouts.ts`: complete typed construction registration                          |
| Common generation and validation        | `generation.ts`, `generationSearch.ts`, `generationCandidates.ts`, `variantGeneration.ts` and `rating.ts`: current identity, shared bounded search, exact delivery, target screening and rule necessity |
| Chinese catalogue                       | `src/features/game/model/variants.ts`: `VARIANT_PRESENTATION`, ordered options, and query validation; review setup and teaching summaries too                                                           |
| Board geometry and accessibility        | `src/shared/model/boardGeometry.ts`: `VariantBoardAdapter`; `SudokuClues.vue` renders supported clue primitives                                                                                         |
| Worker proof boundary                   | `src/worker/hintEvidence.ts`: evidence decoding and validation against the actual puzzle; `protocol.ts` retains message envelopes                                                                       |
| Internal assessment                     | `src/core/sudoku/ratingPolicies.ts` and `rating.ts`: applicable nested policies, ordered tiers, version, workload semantics, and runtime decoders                                                       |
| Teaching                                | `src/features/learning/model/{lessonIds,lessons,variantExamples}.ts`: stable identifiers and independently justified exercises                                                                          |
| Daily, saves, and records               | Game daily models, `src/storage/records.ts`, and records aggregation: identity, runtime validation, slot scope, and statistics                                                                          |

Definitions do not import the registry that constructs them. Shared rule/topology helpers stay in the engine; strategy backreferences use type-only imports. Keep Vue and Chinese presentation out of engine definitions. The maps use `satisfies` to require complete registration without losing each payload's discriminant.

## A rule using existing primitives

1. Define its discriminated payload and decoder. Treat worker and persisted input as untrusted: reject invalid indices, duplicate identifiers, disconnected regions, malformed paths, and invalid totals or bounds. Document any rule-specific restrictions.
2. Compile topology into the appropriate categories. Full nine-digit units, duplicate groups, and related highlights have different meanings. A cage need not contain nine cells; related Arrow shaft cells need not be duplicate peers.
3. Add a typed generation strategy and legal transform capabilities. Shared generation still owns uniqueness, logical difficulty, clue necessity, budgets, explicit failure, and result identity. Preserve order and arithmetic when moving geometry.
4. Provide independent grading and teaching fixtures for every supported difficulty. Generated puzzles must come from fresh construction; exhausted requests must return an explicit error without installing these fixtures. Verify them with an independent reference solver and explicit expected facts. Budget exhaustion is inconclusive; it never proves uniqueness or contradiction.
5. Register Chinese names/rules and board presentation. Check accessible cell descriptions, clue overlap, selected-rule text, focus, and pause concealment. Introduce new rendering geometry only when current primitives cannot express the rule.
6. Add teaching examples with stable lesson identifiers and known deductions. Extend worker evidence to identify the actual clue, cell positions, direction, bounds, and numeric premises; a valid object shape alone is insufficient.
7. Verify separate free-save slots, formal daily identity, replay eligibility, stored-attempt precedence, and record filtering. Current generation does not require historical seed reproduction; avoid rewriting stored boards or formal eligibility.
8. Register applicable Easy/Medium/Hard policies with `satisfies` coverage and explicit order. Register new techniques in the tier map and complete count shape; update evidence classification/decoding together. Add independently justified fixtures and verify real production-worker outcomes at both roots. Keep rating and generation versions separate; generated ready results must carry a matching complete assessment under shared work accounting.

## A genuinely new constraint primitive

Registration cannot make an unsupported constraint solvable. Extend `RuleConstraint`, `constraintCells`, and `satisfiesConstraint`, then candidate support, conflict evaluation, and propagation in the engine. Any new logical technique needs an explicit technique identifier and typed evidence, with worker decoding and actual-clue validation. Extend board geometry, rendering, and descriptions together.

Use fixed fixtures to prove valid and invalid assignments, candidates, conflicts, uniqueness, completion, and supported deductions. Reference checks must not call production constraint evaluation. A search or arithmetic budget that runs out must return an inconclusive result rather than a false deduction.

## Determinism and verification

Random call order, legal transforms, region presets and work limits determine current seeded outputs and explicit exhaustion. Pin current determinism and independent solution/tier facts. The user removed historical-generation compatibility requirements: no old generator dispatch, frozen old-output corpus, or daily cutoff is required. Bump current generation identity when algorithm semantics change; do not silently regrade or regenerate saved boards.

Current variants use `sudoku-variants-v9`. Complete-unit variants can use `terminalConstruction.ts`; arithmetic variants construct a Classic terminal and build compatible clues without retaining an authored path from another solution. Keep all abandoned work in the caller budget. Shared finite-domain propagation stays behind `search.ts`: only full nine-digit units require every digit, duplicate peers exclude repeated values, and arithmetic constraints supply exact local support. Exhaustion cannot justify removing a value or proving uniqueness. Early tier screening during construction does not replace final exact uniqueness. Killer's early tier classification still validates its board and runs the actual policy prefix; matching delivery requires a complete assessment. A trial cannot reuse candidates after its clue mask changes. Extend the fixed corpus and independent structural/necessity/trace checks for new generation semantics, and prove terminal diversity beyond digit/spatial/given-mask changes. Add forced layout/work/step exhaustion cases without puzzle delivery, a verified fresh construction case, and a local backup round trip for every newly supported type/tier. Backup decoding must retain stored facts and epoch fencing rather than construct a new puzzle.

Assessment can continue a stalled lower policy only when its actual detector priority order is a prefix of the next policy. Preserve this check when registering techniques or changing policy order; a reordered or reduced policy must restart from the original board and discard the prior trace. The per-policy step limit includes reused deductions. Verify full trace/evidence equivalence with fresh-policy analysis as well as the final grade and summary.

Run relevant engine, worker, lifecycle, storage, and presentation tests during implementation. Before completion, run type checking, lint, formatting, all unit tests, root and `/sudoku/` builds, and the configured Playwright projects. Verify real worker assets, modal keyboard ownership, touch controls, pauses, saves, lessons, and completion. Report actual unavailable browser runtimes; mobile emulation does not certify a physical device.

## Advanced play and course contracts

`core/sudoku/difficulties.ts` statically covers all six types and 19 supported type/tier combinations. Expert belongs only to Classic and must be rejected for variants at generation, transport, persistence, and player selection boundaries. Easy/Medium/Hard technique policies remain unchanged. `advancedTechniques.ts` owns bounded advanced detection and direct proof validation; unit, candidate, fish, wing, and strong-link premises cannot be supplied by a search answer or manual player notes.

Learning owns 32 stable IDs, authored candidate snapshots in `courseFragments.ts`, and ordered exercise/transfer states in `exerciseStages.ts`. Every unit requires two exercises; combined variant units use three stages per exercise. Stage cursors use optional settings metadata and dataset epoch fencing. Only committed final completion writes enter lesson progress. Preserve all original lesson completion IDs and the independent lifetime of full-board practice.

Current generation defaults are 40 layouts, four million shared construction work units, 500 logical steps, with no separate fallback budget or authored-puzzle delivery. Regional terminal construction distinguishes its 6,561-visit per-attempt cap from aggregate exhaustion; keep consumed work when retrying a layout. Complete-unit digit prefill requires rules invariant under global digit relabeling and must not be applied blindly to arithmetic variants. Generation transport interrupts requests after three seconds without selecting a different puzzle. Preserve deterministic engine outcomes, explicit errors, idle/active Worker disposal and save-preserving loading/cancellation when extending delivery.

## Feedback-guided construction extension

Register construction in the six-variant mapped `GENERATION_STRATEGIES` definition and keep geometry registration pure; constructors must not import their own registry. A terminal or changed rule geometry consumes a new layout slot before work starts, including partial failures. Clue edits use that layout's terminal and owned mask frontier. Respect the fixed active-layout/checkpoint/novelty/proposal/stagnation bounds in `generationCandidates.ts`; avoid a new variant-specific removal or repair loop.

Prepare owned topology/support under the request budget and share it through `PreparedRuleComputation`. A new primitive must serve exact support, conflicts, completion, logical deductions/evidence and accessible drawing. Complete support and independently checked traces must match the existing rating semantics; incomplete support is never contradiction. Keep domain-dependent memo entries within a fresh board workspace, and restore exact-search trails after every branch. Preparation and discarded catalogues remain charged. No preparation uses a global request cache or idle-worker puzzle computation.

Add fixed-seed tests for target stopping/full-result equivalence, terminal-consistent edits, every final acceptance gate, budget causes and retained-frontier continuation after the layout cap. Pair old/new algorithms under identical diagnostic identities and unchanged limits; compare current-version output separately. Independently validate uniqueness, variant necessity, geometry and terminal diversity, then exercise actual emitted Workers at both roots and stored daily/backup facts. Historical identity overlays belong only to private test harnesses.
