# Sudoku Core Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give the Sudoku engine clear responsibility boundaries and readable TypeScript while preserving every observable v10 result.

**Architecture:** Move cohesive subsystems into explicit directories and extract existing contracts, decoding, proof validation and presentation from mixed modules. Keep the scheduler and policy runner cohesive. Consumers import their actual owners directly, and dependency checks enforce the resulting graph.

**Tech Stack:** TypeScript 6.0.3, typescript-eslint 8.71.1, ESLint 10.12.0, Prettier 3.9.10, Vitest 5.0.3, existing Vue/Vite/Playwright toolchain, pnpm 12.11.2 and Node 26 or newer.

**Spec:** [Approved design](../specs/2026-10-15-sudoku-core-organization-design.md). Read [Web Architecture](../../architecture.md), [Variant Extension](../../variant-extension.md) and [Repository Guidelines](../../../AGENTS.md) before execution.

## Global Constraints

- Baseline: `dbcb83e746df397c93a2b807cd34a316de7713f6`; capture it before modifying product source.
- Preserve `sudoku-v10`, `sudoku-variants-v10` and `sudoku-rating-v2`.
- Preserve `maxLayouts: 40`, `maxWork: 4000000`, `maxSteps: 500` and the `3000` ms Worker deadline. Keep lower and zero limits valid and generation limits restricted to exactly three fields.
- Preserve seed serialization, random draw order, detector/policy/edit order, acceptance gates, exact outcomes, full logical traces, work charges and every diagnostic counter/cause.
- Preserve puzzle/assessment/Worker/storage/backup shapes, historical identities and Chinese explanations/diagnostics. Import paths may change.
- Keep the engine independent of presentation, Vue, Pinia, browser APIs, storage and workers. Use explicit `@/` imports and `import type`; no forwarding modules or barrels.
- Add no dependencies, caches, plugin framework, algorithm tuning, version bump, budget increase or blanket assertion/suppression.
- English documentation, identifiers, comments and test descriptions; player-facing text remains Chinese.
- Existing contract tests prove behavior-preserving moves. Add tests only for new guards, enforceable boundaries or an uncovered contract.
- Use logical paragraph breaks, focused names and concise invariant/ownership comments. Keep tightly related calculations together; Prettier handles mechanical formatting.
- Leave historical generation harnesses/reports unchanged. New comparison work belongs to `.superpowers/sudoku-core-organization/`, with a durable report under `docs/superpowers/verification/`.

## Review Focus

1. Untrusted technique IDs, including inherited object keys and non-strings, must never become valid deductions or summary counts. Task 4 adds explicit guard cases and retains Worker rejection coverage.
2. Zero or interrupted work must preserve incomplete outcomes, charge attribution and branch restoration. Tasks 3 and 6 retain named low-budget contracts; Task 8 compares complete results and counters.
3. Reused prepared data must not retain another board's candidates or expose mutable proof snapshots. Tasks 3–5 retain prepared-search, variant-proof and completed-trial ownership regressions.
4. Historical or malformed saved metadata must keep its current absent/unavailable/error distinction. Tasks 1 and 5 retain puzzle/assessment decoder cases and Task 8 exercises backup/persistence.
5. Type-only moves can conceal an upward dependency or break emitted Workers at a subpath. Task 7 tests static/dynamic dependency policies and the runtime graph; Task 8 tests real emitted Workers at both roots.

---

## File Responsibility Map

Paths below are relative to `src/core/sudoku/` unless stated otherwise. A moved test retains its assertions; splitting tests follows the split production responsibility.

| Current owner                                                                                       | Final owner and responsibility                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`, `board.ts`, `budget.ts`, `difficulties.ts`                                              | Same paths; board/value/work primitives. Remove board's indirect rule-type re-exports after migrating callers.                                                                                                                                                                                    |
| `generation.ts`                                                                                     | `puzzle.ts`: `Puzzle` and `parsePuzzle`; `generation/types.ts`: versions, input/limits/results/metrics and construction contracts; `generation/input.ts`: input/limit factories and decoders; `generation/generate.ts`: request entry point.                                                      |
| `random.ts`                                                                                         | Same path: generic stream/shuffle; `generation/random.ts`: version-owned stream derivation.                                                                                                                                                                                                       |
| `ruleTypes.ts`, `ruleTopology.ts`, `variantRegistry.ts`, `rules.ts`                                 | `rules/types.ts`, `rules/topology.ts`, `rules/registry.ts`, `rules/context.ts`; contracts, topology/validation, registration and context compilation respectively.                                                                                                                                |
| `variants/{classic,diagonal,jigsaw,killer,thermo,arrow}.ts`                                         | Rule-only portions to `rules/definitions/<variant>.ts`; geometry/transform strategies to `generation/variants/<variant>.ts` for the five non-classic variants.                                                                                                                                    |
| `constraintSupport.ts`                                                                              | `constraints/types.ts`: shared support/computation/memo/limit types; `constraints/cageCatalogue.ts`: bounded catalogue construction/filtering; `constraints/support.ts`: generic enumeration, prepared dispatch and fallbacks; `constraints/computation.ts`: charged context/support preparation. |
| `constraints.ts`                                                                                    | `constraints/candidates.ts`: candidate fixed point and its result; `constraints/conflicts.ts`: violations, conflict evaluation and unchanged diagnostic strings.                                                                                                                                  |
| `search.ts`, `propagationSearch.ts`                                                                 | `search/exact.ts`, `search/propagation.ts`; exact public validation/preparation and owned trail-based traversal.                                                                                                                                                                                  |
| `techniques.ts`                                                                                     | `logic/types.ts`: logical/evidence contracts; `logic/techniques.ts`: IDs, action catalogue and guards; `logic/evidence.ts`: owned copying; `src/features/game/model/techniquePresentation.ts`: Chinese names/explanations.                                                                        |
| `logic.ts`                                                                                          | `logic/types.ts`: workspace/options/results; `logic/workspace.ts`: construction/mutation; `logic/basicTechniques.ts`: five basic detectors; `logic/solver.ts`: ordered dispatch and solve/resume loops.                                                                                           |
| `advancedTechniques.ts`                                                                             | `logic/advancedTechniques.ts`: discovery; `logic/advancedEvidence.ts`: independent proof validation.                                                                                                                                                                                              |
| `variantTechniques.ts`, `hint.ts`                                                                   | `logic/variantTechniques.ts`: variant deductions; root `hint.ts`: existing orchestration over logic and rating policies. `StepOutcome` moves to `logic/types.ts`.                                                                                                                                 |
| `rating.ts`, `ratingPolicies.ts`                                                                    | `rating/types.ts`, `rating/input.ts`, `rating/assessment.ts`, `rating/workload.ts`, `rating/decoding.ts`, `rating/policies.ts`; contracts, validated input, single assessment owner, trace statistics, persisted decoding and ordered policies.                                                   |
| `generationSearch.ts`, `generationCandidates.ts`, `generationLayouts.ts`, `generationStrategies.ts` | `generation/search.ts`, `generation/candidates.ts`, `generation/layouts.ts`, `generation/variantStrategies.ts`; scheduler, frontier, construction registry and variant dispatch. Strategy contracts move to `generation/types.ts`.                                                                |
| `terminalConstruction.ts`, `classicGeneration.ts`, `variantGeneration.ts`, `variantTemplates.ts`    | `generation/terminalConstruction.ts`, `generation/classic.ts`, `generation/variant.ts`, `examples/variants.ts`; existing terminal construction, layout composition and authored examples.                                                                                                         |

Test destinations: `generation.test.ts`, `variantPuzzle.test.ts` and the metadata tests split between `puzzle.test.ts`, `generation/input.test.ts` and `generation/generate.test.ts`; generation search/candidate/metrics/classic/variant/terminal tests move beside their respective owners. Rule/registry tests move to `rules/`; support/candidate/conflict tests to `constraints/`; exact/prepared/variant-search tests to `search/`; logical/advanced/variant-deduction/expert tests to `logic/`; assessment/policy/prepared/trial/target tests to `rating/`; example tests to `examples/`. Presentation tests from `techniques.test.ts` move beside `techniquePresentation.ts`. Root board/budget/difficulty/hint tests stay. Generic and generation-specific random tests follow their owners.

External consumers in `src/worker/`, `src/storage/`, feature models/stores/composables/views, `tests/fixtures/`, `tests/support/` and `tests/e2e/` change only their imports unless a new shared guard replaces duplicated membership checking.

## Task 1: Isolate Puzzle Snapshots and Generation Identity Contracts

**Files:** Split `src/core/sudoku/generation.ts` and `random.ts` into the owners above; migrate their direct consumers/tests. Create `.superpowers/sudoku-core-organization/{freeze-baseline.mjs,compare.mjs}` and `baseline/manifest.json` during execution.

**Interfaces:**

- `puzzle.ts` produces `Puzzle` with the existing six fields and `parsePuzzle(value: unknown): ParseResult<Puzzle>`.
- `generation/types.ts` produces the existing generation versions, `GenerationInput`, `GenerationLimits`, `GenerationMetrics`, `GenerationAttemptResult`, `GenerationExhaustionCause`, `GenerationResult`, `VariantGenerationStrategy<K>`, `LayoutRandomStreams`, `LayoutConstructionResult<K>` and `GenerationStrategy<K>` without changed fields. Copy their current signatures; implementation modules import these contracts directly.
- `generation/input.ts` produces `DEFAULT_GENERATION_LIMITS`, `createGenerationInput(variant: SudokuVariant, difficulty: Difficulty, seed: string): GenerationInput`, `parseGenerationInput(value: unknown): ParseResult<GenerationInput>` and `parseGenerationLimits(value: unknown): ParseResult<GenerationLimits>`.
- `generation/generate.ts` produces `generatePuzzle(input: GenerationInput, limits?: GenerationLimits): GenerationResult`; it initially calls the existing scheduler path, updated in Task 6.
- `generation/random.ts` produces `createGenerationRandom(input: GenerationInput, phase: 'terminal' | 'geometry' | 'candidate', layoutIndex: number, proposalIndex?: number): () => number`. Generic `seededRandom` and `shuffle` signatures stay unchanged.

- [x] **Step 1: Capture the committed comparison baseline.** Freeze all production engine sources from the exact commit using Git, record SHA-256/path metadata, versions, limits and the four existing `candidate-v10-{full,targeted,feedback,hard058}-current-native-42b2a413ef24-initial.json` hashes. Never snapshot uncommitted live files as the baseline.
- [x] **Step 2: Establish the new comparison oracle before source edits.** Implement `node .superpowers/sudoku-core-organization/compare.mjs <baseline|current> <full|targeted|feedback|hard058|contracts>` with separate Node processes and explicit baseline/current entry-point maps. Resolve baseline aliases exclusively to frozen sources, without source rewriting. The generation suites assert cardinalities `1216`, `256`, `768`, `1`, matching input identities, `SHA256(JSON.stringify(result))`, payload hashes and full result equality against historical v10 rows. `contracts` records full assessments/traces for every `RATING_FIXTURES` entry and fixed exact/hint/decoder cases, including zero work. Save source hashes with every run.
- [x] **Step 3: Validate the harness on unchanged source.** Run all four generation suites in baseline mode plus `baseline contracts`. Expected: all `2241` generation rows match existing v10 fingerprints, no identity/counter mismatch, and contract snapshots are saved. The harness must exit nonzero for a deliberately changed expected fingerprint; restore that private check afterward.
- [x] **Step 4: Extract the snapshot, generation contracts, input dispatcher and stream owners.** Preserve parse guard order, validation issues, version literals and seed serialization `[puzzleVersion, variant, difficulty, seed, phase, layoutIndex, proposalIndex]`. Move callers directly; delete `generation.ts` once no imports remain. Do not introduce temporary re-export wrappers.
- [x] **Step 5: Run the existing snapshot/input/random contracts.** Run `pnpm exec vitest run src/core/sudoku/puzzle.test.ts src/core/sudoku/generation/input.test.ts src/core/sudoku/generation/generate.test.ts src/core/sudoku/generation/random.test.ts tests/generationLimits.test.ts src/worker/protocol.test.ts` and `pnpm typecheck`. Expected: pass, retaining malformed rules/contradictory solution, historical metadata, lower/zero limits, extra-field rejection and independent random-stream assertions.
- [x] **Step 6: Commit the reviewed contract migration.** Stage only this task's source/tests/import changes and the approved design/plan; use `refactor: isolate sudoku puzzle and generation contracts`. Keep baseline/harness evidence in the refactor workspace until the final durable report.

## Task 2: Separate Rule Definitions from Generation Geometry

**Files:** Move the four rule modules into `rules/`; split the six variant modules as mapped; update consumers and `rules/{context,registry}.test.ts` plus existing geometry tests.

**Interfaces:**

- Consumes `GenerationStrategy<K>`, `VariantGenerationStrategy<K>` and construction contracts from Task 1.
- `rules/types.ts` owns unchanged `PuzzleRules`, `RulesFor<K>`, `RuleConstraint`, `RuleContext`, `SudokuUnit`, `VariantRuleDefinition<K>` and variant identifiers. Rule definitions export their existing `*_RULE_DEFINITION` names and remain generation-independent.
- `rules/context.ts` produces unchanged `parseRules(value: unknown): ParseResult<PuzzleRules>`, `compileRules(rules: PuzzleRules): RuleContext`, `prepareRuleContext(rules: PuzzleRules, budget: WorkBudget)`, `CLASSIC_RULES`, `CLASSIC_CONTEXT`, `constraintCells`, `satisfiesConstraint` and `isSudokuVariant` with their baseline signatures.
- `generation/variants/*.ts` produce their existing `*_GENERATION_STRATEGY` exports, typed through `satisfies`. Definitions never import their registry. Shared topology validation remains in the rule owner.

- [x] **Step 1: Move the rule contracts, topology, registry and context modules.** Migrate type imports to `rules/types.ts`, including consumers of board/rules re-exported types. Remove those incidental re-exports after migration.
- [x] **Step 2: Extract geometry/transform code into generation-owned variant files.** Preserve each helper's iteration and random calls. Keep rule validation/compilation in definitions, the existing typed complete maps and exhaustive dispatch. Consolidate duplicate cell-index predicates only after comparing their accepted inputs; otherwise keep domain-specific guards.
- [x] **Step 3: Run rule registration and geometry contracts.** Run `pnpm exec vitest run src/core/sudoku/rules src/core/sudoku/variantGeneration.test.ts src/core/sudoku/terminalConstruction.test.ts src/core/sudoku/variantTemplates.test.ts` and `pnpm typecheck`. Expected: pass, including all six decoded kinds, mismatched definition rejection, no mutation while compiling, permitted transformations and complete construction registration.
- [x] **Step 4: Commit the boundary change.** Use `refactor: separate sudoku rules from generation geometry` with the complete import migration in the same commit.

## Task 3: Give Constraint Preparation and Exact Search Explicit Owners

**Files:** Split/move `constraintSupport.ts`, `constraints.ts`, `search.ts`, `propagationSearch.ts` and their tests according to the map; migrate exact/constraint consumers.

**Interfaces:**

- `constraints/types.ts` produces unchanged `ConstraintSupport`, `PreparedConstraintSupport`, `PreparedRuleComputation`, `CageSupportMemo` and `CatalogueLimits` contracts.
- `constraints/cageCatalogue.ts` produces `DEFAULT_CATALOGUE_LIMITS` (`512` tuples/constraint, `8192`/layout), `compileCageCatalogue(cage: Extract<RuleConstraint, { kind: 'cage' }>, capacity: number, budget: WorkBudget): CatalogueResult` and `filterCageCatalogue(cells: readonly number[], domains: readonly NoteMask[], tuples: readonly (readonly NoteMask[])[], budget: WorkBudget): ConstraintSupport`. `CatalogueResult` retains complete/fallback/budget-exhausted outcomes.
- `constraints/support.ts` produces unchanged `getConstraintSupport(board, candidates, context, constraint, budget): ConstraintSupport` and `prepareConstraintSupport(context: RuleContext, budget: WorkBudget, limits?: Readonly<CatalogueLimits>)` with ready/support or budget-exhausted outcomes.
- `constraints/computation.ts` produces `prepareRuleComputation(rules: PuzzleRules, budget: WorkBudget): { status: 'ready'; computation: PreparedRuleComputation } | { status: 'budget-exhausted' }`.
- Candidate/conflict modules retain their existing typed results and `evaluateCandidates`, `evaluateConflicts`, `constraintMessage` signatures. `search/exact.ts` retains `prepareExactValidator(computation: PreparedRuleComputation): PreparedExactValidator` and `countSolutions(board: Board, options: { maxSolutions: 2; nodeBudget: number; context?: RuleContext; workBudget?: WorkBudget }): SearchResult`; `.count(board, budget, nodeBudget)` remains unchanged.

- [x] **Step 1: Extract catalogue construction/filtering and prepared computation.** Keep dispatch and fallback in support, including context ownership validation, the query's initial charge and domain-product comparison before choosing enumeration. Preserve complete-only memoization, ordered cage tuples, stage scopes and charges on abandoned preparation.
- [x] **Step 2: Move candidate/conflict evaluation and exact traversal.** Keep diagnostic strings intact, fresh domains per probe, contradiction guards and `finally` trail restoration. No propagation rewrite or changed error conditions.
- [x] **Step 3: Run exact and support contracts.** Run `pnpm exec vitest run src/core/sudoku/constraints src/core/sudoku/search` and `pnpm typecheck`. Expected: pass, especially independent Cartesian support, catalogue bounds/fallback retaining work, incomplete catalogue/filter rejection, singleton-domain enumeration, independent zero/one/multiple counts and restoration after interrupted traversal. Retain returned-solution ownership assertions.
- [x] **Step 4: Compare fixed exact contracts with the frozen baseline.** Run `node .superpowers/sudoku-core-organization/compare.mjs current contracts`. Expected: the exact subset matches status, solution, nodes visited, work used and caller budget state, including interrupted calls. Other not-yet-migrated entry points remain explicitly mapped.
- [x] **Step 5: Commit this cohesive engine boundary change.** Use `refactor: organize sudoku constraints and exact search`.

## Task 4: Separate Logical Solving, Evidence and Chinese Presentation

**Files:** Split/move the five logical modules into `logic/`; create `src/features/game/model/techniquePresentation.ts`; update the hint entry, Worker decoder, hint panel, learning consumers and associated tests.

**Interfaces:**

- `logic/types.ts` owns unchanged technique unions, `LogicalState`, `LogicalStep`, evidence, `LogicalWorkspace`, `LogicalOptions`, `LogicResult` and `StepOutcome`.
- `logic/techniques.ts` produces the existing ordered basic/advanced/classic lists and guards, plus `isTechnique(value: unknown): value is Technique` and `TECHNIQUE_ACTIONS`, the existing complete 17-key action map moved from rating.
- `logic/evidence.ts` produces `copyLogicalStep(step: LogicalStep): LogicalStep`; nested copy helpers remain private.
- `logic/basicTechniques.ts` produces `findBasicStep(state: LogicalState, technique: BasicClassicTechnique): LogicalStep | null`; charging/order remain in the solver. Advanced discovery and `validateAdvancedStep(state: LogicalState, step: LogicalStep): boolean` have separate owners.
- Workspace exports retain `createLogicalWorkspace(board: Board, context?: RuleContext, support?: PreparedConstraintSupport): LogicalWorkspace` and `applyLogicalStep(state: LogicalWorkspace, step: LogicalStep): void`. Solver exports retain `findLogicalStep`, `analyzeLogic` and `analyzeLogicalWorkspace` with baseline signatures, including resumable prefixes.
- Presentation exports `TECHNIQUE_NAMES: Record<Technique, string>`, `explainStep(step: LogicalStep): string` and `explainStepEvidence(step: LogicalStep): readonly string[]`. Root `analyzeHint` keeps its current signature and policy lookup.

- [x] **Step 1: Add shared-guard contract coverage.** In `logic/techniques.test.ts`, test every one of the existing 17 IDs; assert false for `null`, `undefined`, `0`, `{}`, `[]`, `''`, `'constructor'`, `'toString'`, `'__proto__'` and `'unknown-technique'`. Run that file before implementation; expected RED because the new module/guard does not yet exist. This covers an actual new public guard.
- [x] **Step 2: Extract contracts, catalogue and owned evidence copying.** Implement the guard with own-key membership in the typed catalogue; retain current action kinds and ordered technique lists. Replace Worker dictionary membership and rating's count-object membership with this guard. Keep count construction semantics unchanged.
- [x] **Step 3: Extract workspace, basic discovery, advanced proof validation and solver orchestration.** Move `StepOutcome` out of variant detection. Preserve detector priority/charging, Killer initialization, proof premises, per-workspace support memoization and independent proof validation rather than detector replay.
- [x] **Step 4: Move Chinese explanations to the game presentation model.** Transfer text and formatting verbatim; migrate all callers and presentation assertions. Keep explanation assertions within deduction integration tests when they verify evidence-to-copy behavior; do not delete coverage to simplify imports. Root hints retain the same policy sequence.
- [x] **Step 5: Verify solving, decoding and presentation contracts.** Run `pnpm exec vitest run src/core/sudoku/logic src/core/sudoku/hint.test.ts src/features/game/model/techniquePresentation.test.ts src/worker/protocol.test.ts src/features/learning` and `pnpm typecheck`. Expected: pass, including independent advanced proof rejection, changed-domain/context invalidation, incomplete-support non-reuse, owned returned evidence and unchanged Chinese output.
- [x] **Step 6: Commit the logical/presentation separation.** Use `refactor: separate sudoku logic evidence and presentation`.

## Task 5: Separate Assessment Execution, Workload and Decoding

**Files:** Split `rating.ts`, move `ratingPolicies.ts`, colocate assessment/input/workload/decoding/policy/prepared/trial/target tests, and migrate storage/Worker/generation callers.

**Interfaces:**

- `rating/types.ts` owns existing assessment/input/limit/outcome/trial/target/identity/saved-assessment contracts, preserving optional and incomplete outcomes. `rating/policies.ts` owns unchanged `RATING_VERSION`, `RatingVersion`, `RATING_POLICIES` and `TECHNIQUE_TIERS`.
- `rating/input.ts` produces `DEFAULT_ASSESSMENT_LIMITS`, `createAssessmentInput(board: Board, rules: PuzzleRules, limits?: AssessmentLimits): AssessmentInput`, `parseAssessmentLimits(value: unknown): ParseResult<AssessmentLimits>` and `parseAssessmentInput(value: unknown): ParseResult<AssessmentInput>`.
- `rating/workload.ts` produces `summarizeLogicalTrace(board: Board, context: RuleContext, steps: readonly LogicalStep[]): ParseResult<ReasoningWorkload>`. Keep empty counts local unless two current owners need the same factory.
- `rating/assessment.ts` produces unchanged `assessPuzzle(input: AssessmentInput): AssessmentResult`, `assessPuzzleWithBudget(input: AssessmentInput, budget: WorkBudget): AssessmentResult`, `prepareAssessment(rules: PuzzleRules, limits?: AssessmentLimits): PreparedAssessment`, `prepareAssessmentWithComputation(computation: PreparedRuleComputation, limits: AssessmentLimits): PreparedAssessment` and `toAssessmentOutcome(result: AssessmentResult): AssessmentOutcome`.
- `rating/decoding.ts` produces unchanged `parseAssessmentSummary`, `parseAssessmentOutcome`, `decodePuzzleAssessment(value: unknown, identity: AssessmentIdentity): PuzzleAssessment | undefined` and `toPuzzleAssessment(result: AssessmentOutcome, identity: AssessmentIdentity): PuzzleAssessment`.

- [x] **Step 1: Extract types, input validation, workload replay and saved decoding.** Reuse pure catalogue guards/action types; retain validation order, exact issues and missing/unsupported/corrupt/identity-mismatch distinctions. Keep full counted-technique coverage and workload arithmetic unchanged.
- [x] **Step 2: Retain one assessment owner and policy runner.** Move them together into assessment, preserving lazy charged preparation, resumable prefixes, original-candidate restart when order changes, per-board workspaces and completed-trial owned snapshots. Document ownership immediately above the relevant operations.
- [x] **Step 3: Run existing assessment contracts.** Run `pnpm exec vitest run src/core/sudoku/rating src/worker/protocol.test.ts src/storage` and `pnpm typecheck`. Expected: pass, including full authored traces, caller aggregate exhaustion, owned rules/limits/proofs, target stalled feedback, complete-after-clue-mutation and saved-summary absence/version/identity cases.
- [x] **Step 4: Compare full fixture assessments and traces.** Run `node .superpowers/sudoku-core-organization/compare.mjs current contracts`. Expected: every captured contract matches, including hints, full traces and charged work; no comparison is reduced to difficulty labels.
- [x] **Step 5: Commit the assessment responsibility split.** Use `refactor: organize sudoku assessment contracts and execution`.

## Task 6: Group Generation Workflows and Authored Examples

**Files:** Move all remaining generation helpers/tests and authored examples to the mapped final owners; update fixture/support/E2E imports without rewriting historical scratch harnesses.

**Interfaces:**

- Consumes Task 1's generation contracts/streams, Task 2's rule/geometry contracts, Task 3's prepared computation/exact APIs and Task 5's assessment owner.
- `generation/search.ts` retains `searchGeneration(input: GenerationInput, limits: GenerationLimits, metrics: GenerationMetrics): GenerationAttemptResult` and `PreparedLayout` with baseline fields.
- `generation/candidates.ts` retains `GivenMask`, checkpoint/proposal/frontier types, `givenMask`, `materializeCandidate`, `createCandidateFrontier` and `GENERATION_SEARCH_BOUNDS` unchanged.
- `generation/layouts.ts` retains `constructGenerationLayout(input: GenerationInput, random: LayoutRandomStreams, budget: WorkBudget): LayoutConstructionResult` and complete `GENERATION_STRATEGIES`.
- `generation/variantStrategies.ts` retains `VARIANT_GENERATION_STRATEGIES`, `createVariantGeometry` and `transformVariantRules`; contracts come from `generation/types.ts`. Classic/variant/terminal and authored-example exports retain their baseline signatures.

- [x] **Step 1: Move scheduler/frontier/layout/terminal composition and authored examples.** Keep related workflow state together. Preserve every branch, loop/draw order, frontier bound (`2`, `8`, `4096`, `32`, `8`), layout quantum and exact/necessity delivery gate; no fallback templates or new retry logic.
- [x] **Step 2: Migrate the remaining direct consumers.** Verify old production paths are absent with `rg` across `src` and `tests`; update import references in current architecture/extension docs later. Do not change historical verification documents to pretend they used new paths.
- [x] **Step 3: Verify generation contracts.** Run `pnpm exec vitest run src/core/sudoku/generation src/core/sudoku/examples tests/generationCorpus.test.ts tests/generationLimits.test.ts tests/generationStructure.test.ts tests/killerGeneration.test.ts` and `pnpm typecheck`. Expected: pass, preserving zero/one/twenty-work interruption, retained-layout progress, stalled checkpoint restoration, final rule-necessity incompleteness and aggregate construction metrics.
- [x] **Step 4: Compare the recovery and targeted suites first.** Run current `hard058` then `targeted` through the refactor harness. Expected: `1/1` and `256/256` whole results match baseline, including payloads, work/layout/candidate/stage metrics and exhaustion causes. Investigate a mismatch before continuing.
- [x] **Step 5: Commit the generation organization.** Use `refactor: group sudoku generation workflows and examples`.

## Task 7: Enforce Dependencies and Finish the Readability Pass

**Files:** `eslint.config.js`, `tests/module-boundaries.test.ts`, all production/test files under the reorganized core, `AGENTS.md`, `docs/architecture.md` and `docs/variant-extension.md`.

**Interfaces:**

- Keep `restrictImports({ paths, patterns })` as the shared static/dynamic policy generator. Compose each core policy with the existing engine/external restrictions; later flat-config entries must not overwrite them with a narrower list.
- New test-local graph inspection uses the installed TypeScript parser to inspect runtime imports/exports and literal dynamic imports. Erased `import type` edges do not count as runtime cycles. No new production graph service or dependency is introduced.
- Apply these production policies to static and literal dynamic imports: root `types.ts`/`budget.ts`/`random.ts` reject logic/rating/generation; rules reject constraints/search/logic/rating/generation; constraints reject search/logic/rating/generation; search rejects logic/rating/generation; logic rejects rating/generation; rating rejects generation. Rule definitions also reject `rules/registry` and `rules/context`. Root `hint.ts` may import rating. Preserve `board.ts`'s legitimate rule-context dependency and test fixture exemptions.

- [x] **Step 1: Add boundary regressions before changing lint rules.** Extend static/dynamic reject cases with one source/target pair for each forbidden owner pair in this task's policy, including both forbidden registry imports from a definition. Add accepts for generation→rating/search, rating→logic, root hint→rating, board→rule context and learning model→game technique presentation. Retain existing framework/browser restrictions and test exemptions. Run `pnpm exec vitest run tests/module-boundaries.test.ts`; expected RED only for newly forbidden internal edges.
- [x] **Step 2: Implement scoped core boundaries and syntax rules.** Add `@typescript-eslint/consistent-type-imports` with separate type imports and `@typescript-eslint/no-non-null-assertion` for core source. Retain `curly: all`, `one-var: never`, browser restrictions and the same dynamic policy. Do not enable a repository-wide typed-lint preset.
- [x] **Step 3: Pin actual runtime acyclicity.** Add `keeps the production Sudoku runtime import graph acyclic`, asserting a DFS over resolved production core paths has no cycles, and fixture assertions that an ordinary two-node cycle is found while type-only edges are ignored. Include literal dynamic imports and runtime re-exports. Run the boundary file; expected PASS with current source and meaningful cycle-detection assertions.
- [x] **Step 4: Review logical grouping and names throughout the core.** Separate input guards, setup, computation, state mutation and return where stages change. Keep tightly related values together. Replace unexplained local abbreviations, nested workflow choices and comma declarations in touched code; preserve domain IDs and numeric behavior. Add concise comments for masks, seed-call order, budget stages, immutable prepared data, trail undo, trial ownership and permitted transforms where names/types alone do not explain correctness.
- [x] **Step 5: Update current conventions and extension instructions.** Document the actual owners/import direction, pure technique guard/presentation boundary and necessary TypeScript comments in the three repository documents. Keep the variant checklist tied to concrete rule/geometry/policy/presentation registrations and fixtures. Remove stale current-path references; preserve historical reports.
- [x] **Step 6: Run style, boundary and whole-unit checks.** Run `pnpm exec prettier --write` on changed files, then `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test:unit`. Expected: all pass with no suppressions, removed assertions or weakened checks. Inspect the diff manually for business paragraph breaks that the formatter cannot decide.
- [x] **Step 7: Commit enforcement, readability and documentation.** Use `refactor: enforce sudoku module boundaries and readability`.

## Task 8: Verify Whole-Result Equivalence and Real Player Flows

**Files:** New refactor-specific scripts/results under `.superpowers/sudoku-core-organization/`; durable `docs/superpowers/verification/2026-10-15-sudoku-core-organization.md` and machine-readable evidence manifest. Existing E2E suites remain the player-flow oracle.

**Interfaces:**

- The comparison harness resolves the exact baseline/current owner maps; it validates source hashes and complete result equality without candidate code overlays. Historical JSON result fingerprints remain the primary generation oracle.
- Extend its contracts capture for every ready generated board: `assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))` from frozen/current modules, comparing the complete result/trace and work consumed by corresponding caller-budget assessment calls. Compare equivalent serialized data, not object identity or elapsed time.
- Evidence records requested/succeeded/skipped/unavailable cases, source fingerprints, versions, limits, deployment base, browser/version and whether correctness was rerun or inherited from identical historical payloads.

- [ ] **Step 1: Run every current generation suite and generated-board assessment comparison.** Run current `full`, `targeted`, `feedback` and `hard058` with the harness. Expected: `2241/2241` whole generation results match, zero lost or changed result, and all generated-board full rating traces/results/work match frozen v10. Reuse prior independent uniqueness/structure evidence only for identical payloads and label that reuse explicitly.
- [ ] **Step 2: Build both deployment roots.** Run `pnpm build` and `pnpm build:subpath`. Expected: both builds succeed, including emitted Worker assets. Keep the production deadline at `3000` ms.
- [ ] **Step 3: Check Firefox availability freshly.** Run `pnpm exec playwright test tests/e2e/worker.spec.ts --project=firefox`. If the browser cannot launch, preserve the launch error, report unavailable and continue with available runtimes. Do not label launch failure as an application pass or change project settings to hide it.
- [ ] **Step 4: Run the player suites in available runtimes.** Run `pnpm exec playwright test --project=desktop --project=mobile --project=webkit`, plus Firefox if available. Existing worker tests assert current-identity recovery/slowest requests and logical evidence at root and `/sudoku/`; game, hints, lessons, storage and backup tests cover import consumers. Expected: all applicable assertions pass, with only existing intentional physical-keyboard/touch skips. Record mobile as emulation.
- [ ] **Step 5: Produce an auditable verification report.** Record the exact commit/source manifests, corpus counts, full-trace comparison, budgets/counters, root/subpath Worker outcomes, player results and unavailable runtimes. Reference immutable old evidence rather than editing it. Do not claim physical-device or fresh independent uniqueness verification unless actually performed.
- [ ] **Step 6: Obtain one fresh independent whole-change review.** Follow `superpowers:requesting-code-review`; the reviewer checks this spec/plan, the entire baseline-to-current diff, runtime/type dependencies, seeded identity/work pricing, evidence ownership, readable stages/comments and report claims. Fix substantiated findings and rerun affected checks/comparisons before the final report. Do not spawn per-task agents in Native execution.
- [ ] **Step 7: Complete final verification and commit evidence.** After review fixes, run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test:unit`; repeat builds/browser/corpus checks only when affected source changed. Expected: all applicable checks pass against the final source manifest. Commit the durable report and any reviewed fixes with `docs: record sudoku core refactor verification`. Leave branch integration to the user's instruction; no automatic deletion or push.

## Plan Self-Review

- Spec coverage: Tasks 1–6 own every mapped production responsibility, Task 7 owns conventions/enforcement, and Task 8 owns equivalence/product verification and independent review.
- Boundary clarification: root `hint.ts` stays above logic because it consumes rating policy; shared constraint types prevent catalogue/dispatcher type back-dependencies. Neither change alters behavior.
- Step precision: moves are bounded by the file map and preserved baseline signatures; only the new guard, basic dispatcher, catalogue boundary and graph checks introduce interfaces.
- Type consistency: generation contracts are available before geometry extraction; constraint contracts before logical/rating consumers; technique guard/actions before decoder migration. No forwarding owner is needed between commits.
- Review focus: all five risks have named existing contracts or new boundary/guard assertions in their owning tasks.
- Proportion: no detector, scheduler or propagation implementation is reproduced in this plan. Existing contracts and immutable result fingerprints are reused instead of mirroring private helpers.
