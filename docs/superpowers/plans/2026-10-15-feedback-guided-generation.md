# Feedback Guided Sudoku Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve exact-difficulty generation, especially Classic Expert and Killer Hard, through a shared feedback-guided search within the existing limits.

**Architecture:** A request owns one budget and a bounded set of prepared layouts. Candidate masks have isolated logical state; immutable topology and arithmetic catalogues serve both grading and reversible exact probes. A common scheduler explores masks and applies the existing independent delivery gates.

**Tech Stack:** TypeScript 6.0.3, Vitest 5.0.3, Vite 8.3.4, Playwright 1.64.0, Node.js 26+, pnpm 12.11.2; existing Vue application and Web Workers. No new dependencies.

**Spec:** [Feedback Guided Sudoku Generation](../specs/2026-10-15-feedback-guided-generation-design.md)

## Global Constraints

- At most 40 constructed layouts, 4,000,000 aggregate work units, 500 logical steps per policy and the 3,000 ms generation transport deadline. Assessment and hint transport remain 15,000 ms.
- Generation limits retain exactly three fields: `maxLayouts`, `maxWork`, `maxSteps`, including accepted lower limits and zero.
- Classic maximum clues remain Easy 36, Medium 32, Hard 30 and Expert 28. Variants gain no clue cap. Expert remains exclusive to Classic.
- Deliver only a valid, terminal-consistent puzzle with completed exact uniqueness, complete matching assessment and meaningful variant rules, including the existing Jigsaw exception.
- Preserve `sudoku-rating-v2` policies, candidate initialization, deterministic deductions, evidence, workload and record formats. Keep stored puzzles, results, daily IDs and eligibility authoritative.
- Advance generation to `sudoku-v10` / `sudoku-variants-v10` only after validation. No historical production dispatcher, authored fallback, downgrade, puzzle pool, background generation or cross-request cache.
- Initial search bounds: two active layouts, eight checkpoints per layout, 4,096 seen masks per layout, 32 proposals per checkpoint, eight non-improving evaluations before another layout becomes eligible.
- Complete ordered catalogues cover Killer cages of size at most four, bounded by 512 tuples per constraint and 8,192 per layout. Larger cages, Arrow and Thermo keep exact bounded enumeration.
- English documentation, identifiers, comments and test descriptions; Chinese player copy. Pure engine dependencies remain independent of Vue, storage, workers and browser APIs.
- Before material code changes, review the relevant installed-version official TypeScript/Vitest/Worker guidance and existing repository conventions; reuse that guidance through the task rather than changing dependencies.
- Freeze the dirty v9 implementation before the first product edit, then preserve its reviewed, verified changes in a local baseline commit. Never overwrite its raw comparison results or stage unrelated existing changes.

## Review Focus

1. A cancelled, exhausted or completed probe followed by a different clue mask must have fresh domains and owned evidence/solutions (Tasks 3–5).
2. Preparation or a discarded catalogue can consume the last work unit; it must remain charged and inconclusive, including nested accounting (Tasks 1–2).
3. Layout attempt 40 can fail construction while an earlier layout still has useful checkpoints; creation stops but exploration continues (Task 6).
4. A matching logical grade above the Classic clue cap, or a matching variant with unnecessary rules, must never be delivered (Tasks 5–6).
5. A generation-version change must not rewrite stored daily/session facts or disguise a paired success regression through a different random identity (Tasks 7–8).

---

## File ownership and execution order

| Files under `src/core/sudoku/`                                        | Responsibility                                                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `budget.ts`, `ruleTypes.ts`, `rules.ts`                               | Existing shared budget; exclusive work-stage diagnostics; owned topology and cell memberships.            |
| New `constraintSupport.ts`                                            | Raw support enumeration, bounded prepared catalogues, and local-domain memo contracts.                    |
| `constraints.ts`, `logic.ts`, `techniques.ts`, `variantTechniques.ts` | Consume support without changing conflict, candidate or deduction semantics.                              |
| `search.ts`, `propagationSearch.ts`                                   | One exact solver; prepared entry point, fresh probe initialization and reversible branch trail.           |
| `rating.ts`                                                           | One shared full/target policy runner, bounded feedback and owned completion.                              |
| New `generationCandidates.ts`                                         | Canonical masks, edit cursors, bounded frontiers, novelty and deterministic ranking.                      |
| New `generationSearch.ts`                                             | Request ownership, scheduling, prepared layouts, rejection policy and final acceptance.                   |
| `generationStrategies.ts`, `variants/*.ts`                            | Complete typed static construction registration for all six variants.                                     |
| `classicGeneration.ts`, `variantGeneration.ts`                        | Focused terminal/geometry construction and existing variant necessity; remove duplicate generation loops. |
| `generation.ts`, `random.ts`                                          | Public validation/current identities, metrics, engine exhaustion causes and deterministic substreams.     |

Tasks 1–4 establish reusable computation; Task 5 establishes candidate operations; Task 6 integrates them. Tasks 7–8 verify the application and release. Existing `expertGeneration.ts` and its implementation-specific tests are removed only when their useful behavioral contracts have moved to the common explorer.

### Task 1: Owned topology, preparation accounting and frozen comparison source

**Files:** Modify `src/core/sudoku/{budget,ruleTypes,rules}.ts` and their existing tests. Create `.superpowers/feedback-guided-generation/freeze-v9.mjs` and local `baseline-v9/manifest.json`; preserve existing verification files.

**Interfaces:**

- Keep `createWorkBudget(limit: number): WorkBudget` and `consumeWork(budget: WorkBudget, units?: number): boolean`.
- Add `WorkStage = 'preparation' | 'arithmetic' | 'exact' | 'logic' | 'proposals'`, `WorkAccounting = { stage: WorkStage; byStage: Record<WorkStage, number> }`, optional `WorkBudget.accounting`, and `withWorkStage<T>(budget: WorkBudget, stage: WorkStage, operation: () => T): T`. `consumeWork` attributes successful charges to the innermost stage; no observer callback.
- Extend `RuleContext` with immutable `cellUnits` and `cellConstraints`, both `readonly (readonly number[])[]` containing indices into its owned arrays.
- Keep `compileRules(rules: PuzzleRules): RuleContext`; add `prepareRuleContext(rules: PuzzleRules, budget: WorkBudget): { status: 'ready'; context: RuleContext } | { status: 'budget-exhausted' }`. Both use the same topology builder; invalid rules throw `TypeError`. The prepared entry point charges before puzzle-specific compilation operations.

- [x] **Freeze the baseline before editing product files.** Copy every non-test `src/core/sudoku/**/*.ts` source, record SHA-256 hashes, Git base and dirty paths, and compare hashes with the v9 report. Make the script refuse replacement of a different existing snapshot. Reuse this frozen tree for every control run; never substitute the older v8 snapshot.
- [x] **Checkpoint the verified v9 baseline.** Review the frozen dirty-path manifest against the existing v9 verification reports, stage that exact coherent v9 source/test/document set and commit as `perf: preserve verified v9 generation baseline`. Include its new Expert implementation and research/verification reports; exclude the new refactor planning documents and ignored harness. Confirm the staged diff contains no unrelated files and record the baseline commit in the manifest. This preserves independently usable task commits without losing the user's existing work.
- [x] **Write failing ownership and accounting tests.** Mutate caller-owned Jigsaw regions/Killer cages after compilation and verify rules, memberships and subsequent behavior remain unchanged. Assert Classic cell 0's row/column/box membership is `[0, 9, 18]`, matching the existing ordered unit definitions. Arithmetic memberships must not appear as full units. Add nested accounting assertions:

  ```ts
  expect(budget.used).toBe(3)
  expect(accounting.byStage).toEqual({
    preparation: 1,
    arithmetic: 2,
    exact: 0,
    logic: 0,
    proposals: 0,
  })
  expect(accounting.stage).toBe('preparation')
  expect(consumeWork(budget)).toBe(false)
  ```

  Arrange a three-unit limit, charge once in preparation, twice in nested arithmetic, then return/throw through the scope. A zero-budget prepared context returns exhaustion with zero used; an interrupted preparation never returns a partial context.

- [x] **Observe RED.** Run `pnpm exec vitest run src/core/sudoku/budget.test.ts src/core/sudoku/rules.test.ts`; new contracts must fail before implementation.
- [x] **Implement owned compilation and scoped accounting.** Snapshot parsed rules, freeze shared topology arrays, and build memberships once. Preserve full units versus duplicate peers/related cells. Keep the unbudgeted public compiler for existing pure callers; generation uses the charged preparation entry point. Default accounting starts at preparation only when explicitly attached by generation.
- [x] **Verify GREEN and checkpoint.** Run the same tests and `pnpm typecheck`; require passing output. Commit only this task's reviewed diff with message `refactor: own prepared rule topology and work accounting`. Use path-limited staging and verify the staged diff before committing.

### Task 2: Bounded exact constraint support shared by logic and search

**Files:** Create `src/core/sudoku/constraintSupport.ts` and `constraintSupport.test.ts`. Modify `constraints.ts`, `constraints.test.ts`, `logic.ts`, `techniques.ts`, `variantTechniques.ts`, `variantTechniques.test.ts`, and their direct support-type imports.

**Interfaces:**

- Move `ConstraintSupport`, `CageSupportMemo` and raw `getConstraintSupport(board: Board, candidates: readonly NoteMask[], context: RuleContext, constraint: RuleConstraint, budget: WorkBudget): ConstraintSupport` from `constraints.ts` to `constraintSupport.ts`; update imports rather than retaining forwarding exports.
- Export `PreparedConstraintSupport = { get(board: Board, candidates: readonly NoteMask[], constraint: RuleConstraint, budget: WorkBudget): ConstraintSupport }` and `PreparedRuleComputation = { readonly context: RuleContext; readonly support: PreparedConstraintSupport }`.
- Export the engine-internal builder `prepareConstraintSupport(context: RuleContext, budget: WorkBudget, limits?: Readonly<CatalogueLimits>): { status: 'ready'; support: PreparedConstraintSupport } | { status: 'budget-exhausted' }`, where `CatalogueLimits = { maxTuplesPerConstraint: number; maxTuplesPerLayout: number }`. Defaults are exactly 512/8,192; explicit limits may only lower them. This permits small deterministic overflow tests without inventing impossible valid layouts or changing request limits.
- Export `prepareRuleComputation(rules: PuzzleRules, budget: WorkBudget): { status: 'ready'; computation: PreparedRuleComputation } | { status: 'budget-exhausted' }`. It consumes Task 1's charged compiler and prepares complete support catalogues; invalid rules throw `TypeError`.
- Add optional `support?: PreparedConstraintSupport` to `LogicalState`, `LogicalWorkspace`, `LogicalOptions`, `createLogicalWorkspace(board, context?, support?)`, and as the last argument of `evaluateCandidates` / `evaluateConflicts`. Existing callers without support retain raw enumeration. The exact parameter type for each new argument is `PreparedConstraintSupport | undefined`.

- [x] **Write failing support tests with independent expected facts.** A distinct two-cell cage totaling 3 supports exactly digits 1 and 2 in each cell; fixing its first cell to 1 leaves only 2 in the second. An ordered three-cell cage totaling 6 with domains `{1}`, `{2,3}`, `{2,3}` has only assignments `[1,2,3]` and `[1,3,2]`. Assert literal masks, input order, and no repeated cage digits. Cover conflicting fixed digits, and an Arrow whose non-peer shaft cells may repeat a digit. Compare all small fixed-domain cases with a test-only Cartesian enumerator importing no production support implementation.
- [x] **Add fallback, exhaustion and ownership regressions.** Pin default capacity values 512/8,192, reject increases, and use lower builder limits to force overflow: a two-tuple cage with per-constraint capacity 1; two two-tuple cages with layout capacity 3. Also test the size-five cage fallback and exhaustion during compilation/filtering. Overflow discards the partial catalogue, retains spent work and uses exact enumeration; exhaustion returns no partial masks. Mutating returned supports or evidence must not change the next query. Each new logical workspace starts with an empty cage-domain memo; only complete support can be memoized.
- [x] **Observe RED.** Run `pnpm exec vitest run src/core/sudoku/constraintSupport.test.ts src/core/sudoku/constraints.test.ts src/core/sudoku/variantTechniques.test.ts`.
- [x] **Implement bounded catalogues and consumers.** Generate distinct sum combinations and complete ordered tuples for size ≤4; retain original cell order and peer compatibility. Charge each extension and compatibility test in the arithmetic scope. Use the same prepared interface for all constraints; larger cages, Arrow and Thermo delegate to the existing enumerator. Freeze prepared data, copy returned masks, and keep domain memo state exclusively in each fresh logical workspace. Do not alter Killer's explained candidate initialization.
- [x] **Verify GREEN and checkpoint.** Run the same tests plus `pnpm exec vitest run src/core/sudoku/logic.test.ts src/core/sudoku/ratingPolicies.test.ts`; require literal support expectations and unchanged fixed logical steps. Commit reviewed task hunks as `perf: prepare bounded arithmetic support catalogues`.

### Task 3: Prepared exact probes with reversible domains

**Files:** Modify `src/core/sudoku/search.ts`, `propagationSearch.ts`, `search.test.ts`, `variantSearch.test.ts`; create `preparedSearch.test.ts`. Reuse `tests/support/referenceSudoku.ts` and `referenceVariants.ts` without importing production search into either oracle.

**Interfaces:**

- Export `PreparedExactValidator = { count(board: Board, budget: WorkBudget, nodeBudget: number): SearchResult }` and `prepareExactValidator(computation: PreparedRuleComputation): PreparedExactValidator` from `search.ts`.
- Preserve `countSolutions(board: Board, options: { maxSolutions: 2; nodeBudget: number; context?: RuleContext; workBudget?: WorkBudget }): SearchResult`; standalone counting uses the same prepared search implementation and charges any new preparation to its supplied/default budget.
- Change internal `countPropagationSolutions` to consume `PreparedRuleComputation`. `SearchResult` and deterministic unit/constraint/branch order remain unchanged.

- [x] **Write failing observable probe tests.** For fixed Classic and variant boards, assert independent counts 0/1/2 and, where unique, the known terminal. Run prepared probes in order A → conflicting B → stepwise work-exhausted B → A, verifying both A results and original givens. Mutate a returned solution, repeat A, and require the known unmutated terminal. Compare prepared and standalone complete results excluding their explicitly different preparation charges.
- [x] **Pin branch restoration at interruption boundaries.** Use a fixed board requiring a failed branch and enumerate small work caps through its traversal; each inconclusive call must leave a later full probe correct. Assert `budget.used <= budget.limit`, no count/solution published as complete on exhaustion, and shared arithmetic-stage charges plus exact-stage charges sum to actual consumed work.
- [x] **Observe RED.** Run `pnpm exec vitest run src/core/sudoku/preparedSearch.test.ts src/core/sudoku/search.test.ts src/core/sudoku/variantSearch.test.ts`.
- [x] **Implement a domain trail.** Allocate fresh/reset initial givens and domains per probe, record every changed domain with its previous mask, mark each branch and restore in `finally` on all exits. Keep queues branch-local or rebuild them consistently. Use prepared memberships and support; eliminate per-probe membership reconstruction and recursive domain-array copies. Returned solutions own their arrays. Search state never enters logical evidence.
- [x] **Verify GREEN and checkpoint.** Run the same tests plus `pnpm typecheck`. Commit reviewed task hunks as `perf: reuse exact topology with reversible search probes`.

### Task 4: Target-aware screening with unchanged full assessments

**Files:** Modify `src/core/sudoku/rating.ts`, `logic.ts`, `preparedAssessment.test.ts`, `trialAssessment.test.ts`, `rating.test.ts`; create `targetAssessment.test.ts`. Update preparation call sites in `classicGeneration.ts` and `variantGeneration.ts`. Reuse `tests/fixtures/rating.ts` and `ratingWitnesses.ts`.

**Interfaces:**

- Add `TargetFeedback = { remainingCells: number; deductions: number }` and `TargetScreenResult` with variants: `{ status: 'below-target' | 'matching-target'; difficulty: Difficulty; feedback: TargetFeedback; complete(): RatedAssessmentResult }`, `{ status: 'target-stalled'; feedback: TargetFeedback }`, `{ status: 'budget-exhausted'; cause: 'work-limit' | 'logical-step-limit' }`, and `{ status: 'invalid'; issues: readonly string[] }`.
- Add `PreparedAssessment.screenTarget(board: Board, target: Difficulty, budget: WorkBudget): TargetScreenResult`; keep existing `assess`, `screen` and public assessment envelope formats.
- Export `prepareAssessmentWithComputation(computation: PreparedRuleComputation, limits: AssessmentLimits): PreparedAssessment`. Generation passes its already charged computation; standalone/prepared public assessment still validates and owns rules/limits and charges new arithmetic preparation when evaluated. No catalogue work may occur uncharged in a constructor lacking a budget.
- Remove the internal `PreparedAssessment.context` property: ordinary `prepareAssessment(rules, limits)` validates/copies inputs, then lazily performs charged rule/support preparation inside the first evaluation. Cache only complete preparation within that owner's lifetime. Generation call sites prepare explicitly under their existing request budget, handle inconclusive preparation, retain that context locally and pass the computation to the new factory. Replace tests reading the exposed context with observable ownership assertions; no temporary unbudgeted compiler path.
- Refine internal logic outcomes with a work/step exhaustion discriminator; strip that internal detail when producing existing public `AssessmentOutcome` values.

- [ ] **Write failing policy-boundary tests.** On independently labeled Easy/Medium/Hard/Expert fixtures, assert each below/matching/stalled outcome. An Expert fixture screened for Hard is `target-stalled`, never classified Expert. Spy on the existing exported `analyzeLogicalWorkspace` boundary: its last permitted Classic policy must be exactly `['naked-single', 'hidden-single', 'locked-candidate', 'naked-pair', 'hidden-pair']`, with no subsequent call; also assert bounded stalled feedback and less work than full Expert assessment after equal preparation. Unsupported variant Expert requests are invalid. Pin invalid-board, zero-work and zero-step distinctions; a solved terminal needs no logical step.
- [ ] **Write full-result and isolation tests.** For every rating fixture, complete a matching target screen and compare summary plus full trace with a fresh full assessment and the fixed fixture facts. Preserve existing prefix continuation/reset tests and count all prior steps against each policy's 500-step limit. Interleave masks, mutate nested returned evidence, call `complete()` twice, and require independently owned unchanged results. A completion must not run policy search again or add synthetic work.
- [ ] **Observe RED.** Run `pnpm exec vitest run src/core/sudoku/targetAssessment.test.ts src/core/sudoku/preparedAssessment.test.ts src/core/sudoku/trialAssessment.test.ts`.
- [ ] **Implement one policy runner.** Parameterize its final supported policy; expose feedback from the last permitted state, preserve Classic canonical order and variant priority resets, and create a fresh workspace for every board. Completion replays the owned successful trace exactly as v9 does; preserve existing replay charging semantics. Keep full assessment and hints on the same deduction implementation.
- [ ] **Verify GREEN and checkpoint.** Run the same tests plus `pnpm exec vitest run src/core/sudoku/rating.test.ts src/core/sudoku/ratingPolicies.test.ts src/core/sudoku/expert.test.ts src/core/sudoku/hint.test.ts`; require rating-v2 fixture equivalence. Commit reviewed task hunks as `perf: stop generation screening at the requested tier`.

### Task 5: Owned candidate masks, bounded frontiers and deterministic edits

**Files:** Create `src/core/sudoku/generationCandidates.ts` and `generationCandidates.test.ts`; modify `random.ts` and create `random.test.ts`.

**Interfaces:**

- Use `GivenMask = bigint` with only bits 0–80, never persisted or sent through the Worker. Export `givenMask(board: Board): GivenMask` and `materializeCandidate(terminal: Board, mask: GivenMask): Board`.
- Export `CandidateCheckpoint` as a discriminated union: both carry `layoutId: number`, `mask: GivenMask` and `feedback: TargetFeedback`; solved checkpoints also carry `kind: 'solved'`, `difficulty: Difficulty`, `exact: 'unchecked' | 'unique'`; stalled checkpoints carry `kind: 'stalled'`, `exact: 'unknown' | 'unique'`. No workspace, narrowed domains or mutable trace is retained.
- Export `CandidateProposal = { kind: 'remove' | 'restore' | 'exchange'; mask: GivenMask; intermediates: readonly GivenMask[] }` and `createCandidateFrontier(layoutId: number, terminal: Board, target: Difficulty): CandidateFrontier`. Its methods are `retain(checkpoint: CandidateCheckpoint): boolean`, `next(random: () => number, budget: WorkBudget): CandidateProposal | null`, and `recordEvaluation(improved: boolean): void`; readonly diagnostics expose `seenCount`, `checkpointCount`, `stagnant`, `exhausted`.
- Export `createGenerationRandom(input: GenerationInput, phase: 'terminal' | 'geometry' | 'candidate', layoutIndex: number, proposalIndex?: number): () => number`. Seed with `JSON.stringify([input.puzzleVersion, input.variant, input.difficulty, input.seed, phase, layoutIndex, proposalIndex ?? 0])` using existing `seededRandom`.

- [ ] **Write failing mask/edit tests.** Materialization preserves exactly the terminal's selected digits, including cells 0 and 80. Each remove/restore/exchange mask and intermediate retains the known solution. Reject high/negative masks, unchanged/duplicate proposals and cross-layout checkpoint use. Mutating source boards cannot change retained candidates.
- [ ] **Write bounded exploration tests.** Pin two pools sharing eight slots: reserve four solved/four stalled when both exist and lend empty slots to the other pool. Matching grade above the Classic clue cap can remain a solved checkpoint. Assert closest solved tier/progress ranking, stalled remaining-cell/deduction ranking, and clue count only as tie-breaker. Pin 32 proposals/checkpoint, retirement at 4,096 seen masks without evict/revisit, and stagnation exactly after eight evaluated non-improvements. Charging failure publishes no proposal and cannot mutate a committed candidate.
- [ ] **Write random isolation tests.** Consuming 1,000 candidate random values must not change terminal/geometry streams for layout 1. Pin representative literal random outputs after calculating them once with the existing independent FNV/Mulberry32 algorithm; diagnostics and support preparation consume no RNG calls.
- [ ] **Observe RED.** Run `pnpm exec vitest run src/core/sudoku/generationCandidates.test.ts src/core/sudoku/random.test.ts`.
- [ ] **Implement bounded operations.** Start with a seeded removal sweep; then select restore, one/two-restoration exchanges and alternate checkpoint sweeps using stable seeded tie-breaking. Store owned masks and per-checkpoint edit cursors. Rank progress deterministically and charge proposal construction before each executed edit; intermediate screens/counts remain the scheduler's charged responsibility.
- [ ] **Verify GREEN and checkpoint.** Run the same tests and `pnpm typecheck`. Commit reviewed task files as `feat: explore bounded terminal-consistent clue candidates`.

### Task 6: One generation scheduler with exact delivery gates

**Files:** Create `src/core/sudoku/generationSearch.ts` and `generationSearch.test.ts`. Modify `generation.ts`, `generationStrategies.ts`, `classicGeneration.ts`, `variantGeneration.ts`, the six `variants/*.ts` generation registrations, `generation.test.ts`, `generationMetrics.test.ts`, `classicGeneration.test.ts`, `variantGeneration.test.ts`, `variantRegistry.test.ts`. Remove `expertGeneration.ts` and move its useful regressions before removing `expertGeneration.test.ts`.

**Interfaces:**

- Export `searchGeneration(input: GenerationInput, limits: GenerationLimits, metrics: GenerationMetrics): GenerationAttemptResult`; `generatePuzzle` validates then invokes it for every variant.
- `PreparedLayout` owns `id: number`, `terminal: Board`, `computation: PreparedRuleComputation`, `assessor: PreparedAssessment`, `validator: PreparedExactValidator`, `frontier: CandidateFrontier`. These resources retire together.
- Extend static registration with `GenerationStrategy<K extends SudokuVariant>.construct(difficulty: Difficulty, random: { terminal: () => number; geometry: () => number }, budget: WorkBudget): LayoutConstructionResult<K>` and existing explicit transform permissions. `LayoutConstructionResult<K>` is ready with `terminal: Board; rules: RulesFor<K>`, `budget-exhausted`, `attempt-exhausted`, or failed with `reason: string`. Use a complete `satisfies { [K in SudokuVariant]: GenerationStrategy<K> }` map and exhaustive dispatch; keep per-variant construction focused.
- Add `GenerationExhaustionCause = 'work-limit' | 'logical-step-limit' | 'layout-limit' | 'exhausted-frontier'` to engine construction exhaustion, retaining `status` and `stage`. Extend metrics with `workByStage: Record<WorkStage, number>`, `candidateVisits: number`, `completedLayouts: number`; `layouts` remains the count of attempted layouts.
- Keep `variantRulesMatter` in `variantGeneration.ts` with its existing contract and Jigsaw exception; route its exact checks through shared-budget search. No second acceptance workflow or callback service container.

- [ ] **Write failing scheduler scenarios.** Using typed module mocks only at construction/screen/count boundaries, script: a lower-tier sweep repaired into target; a stalled candidate restored into target; rejected uniqueness followed by another valid candidate; a single step-limited candidate followed by success. Assert every delivered board was counted exactly and all returned arrays own their data. Port the existing Expert checkpoint/exchange behavior as a common-search regression.
- [ ] **Pin limits and cause precedence.** Failed terminal and changed-geometry attempts increment layouts before construction. Test zero layouts, zero work, and 40 attempted layouts with a still-live earlier frontier that subsequently succeeds. Pin at most two active prepared owners, full owner disposal, no mask transplantation, and shared work across every retry/preparation/necessity check. Test each exhaustion cause: work first; logical-step only when all remaining routes are step-limited; layout only after creation is blocked and frontiers end; otherwise exhausted-frontier.
- [ ] **Pin every delivery gate.** Reject a matching Classic Hard at 31 clues while retaining its checkpoint, then accept an independently unique Hard at ≤30. Reject unnecessary variant geometry, permit the existing non-Classic-terminal Jigsaw exception, and keep an incomplete final exact/necessity check inconclusive. A lost known solution is failed internal validation. An uncounted stalled state is explicitly unknown and cannot be delivered. Independently validate real fixed-seed deliveries with reference solvers.
- [ ] **Observe RED.** Run `pnpm exec vitest run src/core/sudoku/generationSearch.test.ts src/core/sudoku/generationMetrics.test.ts src/core/sudoku/generation.test.ts`.
- [ ] **Implement scheduling and one acceptance operation.** Charge attempts before construction; prepare each successful layout once. Retain useful checkpoints, rotate after eight non-improvements, preserve the best active owner when replacing the least useful, and keep exploring retained frontiers after creation is capped. Maintain a static type/tier rejection-order table: begin with current uniqueness-first choices and screening-first Killer Hard; evaluate screening-first Classic Hard/Expert in Task 8 and freeze the measured choice. Final acceptance independently checks identity/rules/terminal consistency, exact tier/clue policy, full assessment, completed count-one known terminal, then variant necessity under the same budget.
- [ ] **Remove duplicate orchestration and verify GREEN.** Replace Classic/variant deletion loops and Expert-only repairs with the common search. Keep terminal constructors, geometry transforms and their diversity tests. Run the above tests plus `pnpm exec vitest run src/core/sudoku/classicGeneration.test.ts src/core/sudoku/variantGeneration.test.ts src/core/sudoku/variantRegistry.test.ts src/core/sudoku/terminalConstruction.test.ts`; require work-stage totals equal `constructionWork` on success and every incomplete path. Commit reviewed task hunks as `refactor: share feedback-guided generation scheduling`.

### Task 7: Preserve Worker, daily and persisted gameplay contracts

**Files:** Review/update `src/worker/sudoku.worker.ts`, `protocol.ts`, `client.test.ts`, `protocol.test.ts` only where needed; `src/features/game/model/daily.test.ts`; `tests/fixtures/generationLatency.ts`; `tests/e2e/{worker,generation-loading,daily,expert,rating,storage,backup,learning}.spec.ts`; `README.md`, `docs/architecture.md`, `docs/variant-extension.md`, `docs/superpowers/specs/2026-10-13-sudoku-generation-and-rating-design.md`.

**Interfaces:** Public `WorkerOutcome`, `WorkerRequest`, `WorkerResponse`, puzzle/assessment records and daily ID construction remain unchanged. Engine causes/metrics are diagnostic only. Transport keeps generation 3,000 ms and hints/assessment 15,000 ms; `idleWorker` performs runtime preparation only.

- [ ] **Write failing boundary regressions.** Test all engine exhaustion causes map to the existing Worker budget-exhausted message/status without leaking diagnostics into player copy. Strict request parsing still rejects a fourth limit field, unsupported identity or variant Expert. Persist a v9 daily attempt/session, switch the current generator identity in a local test overlay, reload and verify exact old puzzle/assessment/result/daily ID and eligibility without generation or reassessment.
- [ ] **Pin lifetime and interaction behavior.** Use actual Worker tests for timeout, cancellation, stale response fencing, explicit low-budget exhaustion and saved-session preservation. Require the recovered Killer Hard identity plus the exact remaining Hard 058 diagnostic request at both root and `/sudoku/` in the private harness, with independent payload verification. Keep Chinese accessible locators aligned with current product labels.
- [ ] **Observe RED for new uncovered boundary regressions.** Run `pnpm exec vitest run src/worker src/features/game/model/daily.test.ts`; record which new behavior fails before adapter changes. Existing preservation tests may already pass; do not manufacture failures or rewrite working adapters.
- [ ] **Integrate and document the implemented ownership.** Adapt only deliberate engine diagnostics; keep wire formats and persistence schemas stable. Update extension instructions for static construction registration, prepared support and difficulty policy. Mark previous v9 algorithm requirements as historical/superseded with a link to the new spec; preserve historical reports.
- [ ] **Verify GREEN and checkpoint.** Run the same unit scope, `pnpm typecheck`, `pnpm lint`, and `pnpm exec prettier --check` on changed files. Run `pnpm test:e2e tests/e2e/worker.spec.ts tests/e2e/generation-loading.spec.ts --project=desktop --project=mobile` after both builds. Commit reviewed task hunks as `refactor: preserve gameplay boundaries for shared generation`.

### Task 8: Paired release measurements, current identities and independent review

**Files:** Create local `.superpowers/feedback-guided-generation/{corpus-runner.mjs,experiment.config.mjs,browser-runner.mjs,write-report.py}` and immutable `results/`. Create `docs/superpowers/verification/2026-10-15-feedback-guided-generation.{json,md}`. Modify `generation.ts` current identity constants and explicitly identity-dependent tests/fixtures only after paired gates pass.

**Interfaces:** `node .superpowers/feedback-guided-generation/corpus-runner.mjs <control-v9|candidate-v9|candidate-v10> <full|targeted|feedback|hard058>` emits immutable raw rows with input identity, source hashes, limits, result payload, independent checks, work/layout/candidate diagnostics and elapsed time. `control-v9` always loads the Task 1 snapshot; `candidate-v9` uses only private identity overlays. `browser-runner.mjs` consumes these rows and checks emitted Worker results at both roots. No harness option reaches production code.

- [ ] **Establish comparison harness assertions before running candidate experiments.** Verify source hashes against the frozen manifest, exact paired input/limits equality, row counts and independent validators. Assert 1,216 full rows, 256 additional targeted rows and 768 feedback rows per mode; feedback seeds are predeclared `feedback-generation-v1:seed:000..255` for Classic Hard/Expert and Killer Hard. Preserve Hard 058 under its exact v9 identity. Reject missing rows, duplicate identities or a changed corpus between arms.
- [ ] **Run paired development suites under unchanged identities and limits.** Execute the runner for `control-v9` and `candidate-v9`, each with `full`, `targeted`, `hard058`. Require no previously ready request lost, no independent uniqueness/grade/geometry/diversity failure, and a fully valid Hard result for exact Hard 058 before calling it resolved. Report every exhaustion and stage-work total; independently check fixed-board rating-v2 traces against frozen v9, not just the new grader against itself.
- [ ] **Select fixed choices, then run the reserved release sample.** Compare bounded defaults and rejection order with fixed alternate configurations, changing one choice at a time using only existing/targeted samples. Keep the spec's defaults unless evidence supports a recorded fixed choice. Freeze that configuration, then run both modes with `feedback` as the final check; do not tune after inspecting its individual failures. Apply the same no-loss/correctness gates. Report target hit counts, completed-layout counts, candidate visits, work by stage, median/p95/worst runtime and repeatable non-target regressions. Failed release gates remain unresolved work, never justify increasing limits or weakening grading.
- [ ] **Advance and verify the current identity.** After same-identity gates pass, set `PUZZLE_VERSION = 'sudoku-v10'` and `VARIANT_PUZZLE_VERSION = 'sudoku-variants-v10'`. Update current-identity tests without rewriting persisted historical fixtures. Run the `candidate-v10` suites, distinguish these results from algorithm comparisons, and independently validate all ready outputs. Recheck the original v9 diagnostic request through the private overlay.
- [ ] **Run complete product verification.** Require `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, `pnpm build:subpath`. Run `PLAYWRIGHT_BROWSERS_PATH=.superpowers/playwright-browsers pnpm test:e2e --project=desktop --project=mobile --project=webkit --project=firefox`; preserve failed initial runs separately, record unavailable browser launch failures, and rerun corrected affected scopes. Exercise free/daily play, cancel/timeout/exhaustion, hints/evidence, lessons, session persistence and backups. Report mobile emulation separately from physical-device validation.
- [ ] **Verify real emitted Workers and review the release.** Build isolated paired Worker bundles with the private overlay, test both roots with recovered failures, explicit exhaustion and the union of per-combination slowest/exhausted inputs; compare payload hashes with independently checked Node rows and retain 3,000 ms deadlines. Run one fresh independent whole-change review using the execution method selected by the user, resolve findings and rerun affected checks. Save raw evidence, final source/configuration hashes and concise reports. Commit the reviewed release diff as `feat: release feedback-guided sudoku generation v10`; do not push without authorization.

## Plan self-review

- Spec coverage: Tasks 1–3 own topology/catalogues/trails/accounting; Task 4 owns rating equivalence and target bounds; Tasks 5–6 own all shared exploration and delivery gates; Tasks 7–8 own identity, stored facts, Worker lifetime and paired release evidence.
- Review Focus: each of the five risks has an explicit regression in the owning task, including inconclusive preparation and layout-cap continuation.
- Interfaces: the shared names are `PreparedRuleComputation`, `PreparedConstraintSupport`, `PreparedExactValidator`, `TargetScreenResult`, `CandidateFrontier`, `PreparedLayout`; no task introduces a second policy runner or solver.
- Execution first preserves the reviewed v9 baseline as its own commit, then each task stages only its own changes. No existing work is discarded or swept into an unrelated task commit.
- This is one engine refactor with dependent interfaces. Native execution in this session followed by one fresh whole-change review is recommended; no product code starts before plan review and execution selection.
