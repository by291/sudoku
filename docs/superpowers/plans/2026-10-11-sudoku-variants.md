# Sudoku Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver playable Diagonal, Jigsaw, Killer, Thermo, and Arrow Sudoku, with three difficulties, independent daily challenges, explained hints, introductory lessons, and resumable local saves.

**Architecture:** Extend the existing pure Sudoku engine with explicit rule data, compiled constraints, and bounded evaluation. Carry those rules through the existing worker, session, persistence, and player workflows. Share the board and game screens across all six types; keep Classic generation and legacy identities compatible.

**Tech Stack:** Vue 3.5.43, TypeScript 6.0.3, Vite 8.3.4, Vue Router 5.4.0, Pinia 4.0.3, Naive UI 2.45.3, idb 8.0.4, native CSS, Web Workers, Vitest 5.0.3, Playwright 1.64.0, pnpm 12.11.2.

**Spec:** [Approved Sudoku Variants Design](../specs/2026-10-11-sudoku-variants-design.md). Also follow [AGENTS.md](../../../AGENTS.md) and [Web Architecture](../../architecture.md).

## Global Constraints

- Use stable identifiers `classic`, `diagonal`, `jigsaw`, `killer`, `thermo`, and `arrow`; all types use 81 cells and digits 1–9.
- Write documentation, identifiers, comments, and test descriptions in English; write player-facing copy in Chinese.
- Preserve `sudoku-v1` and the existing Classic seed outcomes. Use `sudoku-variants-v1` for new types, including type, difficulty, and seed in their generation identity.
- New generation permits at most 20 layout attempts and 500 logical steps per analysis. Use one million work units across generation search and logical validation, plus a separate one-million-unit budget for fallback uniqueness and rating validation. Count search nodes, partial arithmetic assignments, and repeated arithmetic propagation. Preserve the 15-second client timeout.
- Every delivered variant, including a fallback, must need its additional rules and have a verified unique solution and supported logical difficulty. Author puzzle content for this repository.
- Keep one active free-play save per type. Learning retains one active practice session overall. Use record `formatVersion: 2` for new session/result writes; retain the database name, schema version, object stores, leases, and serialized writes.
- Every type has a Medium daily puzzle, changing at midnight in `Asia/Shanghai`. Preserve Classic daily seeds and IDs; new types use `daily:sudoku-variants-v1:<variant>:<YYYY-MM-DD>` and `daily:<variant>:<YYYY-MM-DD>:formal`.
- Preserve routes, Classic lessons/progress IDs, keyboard/touch actions, assistance, timing, theme, ownership, and failed-save recovery. No backend or additional dependency is needed.
- Continue on the already-authorized current branch and in this conversation. Do not create a worktree or commit without a new explicit request.

## Review Focus

1. Invalid partitions, disconnected cages/regions, repeated path cells, and legal overlap between different paths must be distinguished at validation boundaries (Tasks 1, 6, 7, 8).
2. Repeated digits on an Arrow shaft can be legal: candidate support, manual-note cleanup, and highlighting must not assume all-different membership (Tasks 1–4, 8, 10).
3. Exhausting arithmetic enumeration or repeated propagation is inconclusive, never an empty candidate domain or uniqueness proof (Tasks 2–7).
4. A failed save or late response while switching types must preserve the current in-memory session; concurrent tabs cannot replace another type's free save (Tasks 8, 9, 11).
5. Legacy Classic records retain revisions, history, assistance, seeds, and formal daily eligibility; two types completed on one date have separate streaks (Tasks 6, 8, 9).

---

## File Ownership and Delivery Order

| Owner                    | New files                                                                                                                                            | Existing files to extend                                                                                                    | Responsibility                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pure engine              | `src/core/sudoku/rules.ts`, `constraints.ts`, `budget.ts`, `variantTechniques.ts`, `variantTemplates.ts`, `variantGeneration.ts` and colocated tests | `board.ts`, `search.ts`, `techniques.ts`, `logic.ts`, `hint.ts`, `generation.ts` and their tests                            | Rule validation/compilation, bounded support, search, explained deductions, original fallback data, rule-preserving generation |
| Independent verification | `tests/fixtures/variants.ts`, `tests/support/referenceVariants.ts`                                                                                   | `tests/support/referenceSudoku.ts`, `tests/support/gameFixtures.ts`, `tests/support/runtime.ts`, `tests/fixtures/sudoku.ts` | Known facts, separate reference search, Classic compatibility fixtures, runtime doubles                                        |
| Computation boundary     | `src/worker/protocol.test.ts`                                                                                                                        | `src/worker/protocol.ts`, `client.ts`, `client.test.ts`, `sudoku.worker.ts`                                                 | Complete rule-bearing requests/results, validated evidence, cancellation and stale replies                                     |
| Game/persistence         | `src/features/game/model/variants.ts`, `variants.test.ts`, `presentation.test.ts`, `src/storage/records.test.ts`                                     | `session.ts`, `daily.ts`, game store/tests, `src/storage/records.ts`, `repository.ts` and tests                             | Session rules, strict/legacy parsing, slots, safe transitions, daily identity, query validation                                |
| Shared board             | `src/shared/components/SudokuClues.vue`, `SudokuClues.test.ts`, `src/shared/model/boardGeometry.ts`, `boardGeometry.test.ts`                         | `SudokuBoard.vue`, `SudokuBoard.test.ts`, `src/styles/theme.css`                                                            | Controlled presentation, clue geometry, readable notes/focus, accessibility                                                    |
| Player workflows         | `src/features/learning/model/variantExamples.ts`, `tests/e2e/variants.spec.ts`                                                                       | Game/daily/home/records/learning views and models, records store/tests, e2e support and existing specs                      | Type selection, resume, daily status, statistics, rule lessons, browser coverage                                               |
| Documentation            | This plan's completion record                                                                                                                        | `README.md`, `docs/architecture.md`                                                                                         | Supported rules, storage compatibility, generation/hint limits, verification evidence                                          |

Tasks 1–5 establish independently tested engine capabilities while existing Classic entry points remain usable. Task 6 introduces required puzzle rules and migrates all Classic constructors/fixtures together. Tasks 7–9 integrate computation and persistence before exposing new types in Tasks 10–11. Task 12 verifies the complete product.

Before implementation in a new area, check installed versions and review its relevant official references from AGENTS.md. Reuse references already reviewed in this task. Keep tests beside owners and use `@/` source imports. Use native execution and self-review throughout; independent review follows the applicable completion skill rather than dispatching implementation tasks automatically.

### Task 1: Typed Rules, Validation, and Compiled Relationships

**Files:** Create `src/core/sudoku/rules.ts`, `rules.test.ts`, and `tests/fixtures/variants.ts`. Modify `src/core/sudoku/board.ts` only to re-export the expanded unit types and preserve its Classic constants.

**Interfaces:**

- Produce `SudokuVariant = 'classic' | 'diagonal' | 'jigsaw' | 'killer' | 'thermo' | 'arrow'` and `NewSudokuVariant = Exclude<SudokuVariant, 'classic'>`.
- Produce `PuzzleRules`: `{ kind: 'classic' }`, `{ kind: 'diagonal' }`, `{ kind: 'jigsaw'; regions: readonly (readonly number[])[] }`, `{ kind: 'killer'; cages: readonly { cells: readonly number[]; sum: number }[] }`, `{ kind: 'thermo'; paths: readonly (readonly number[])[] }`, or `{ kind: 'arrow'; arrows: readonly { circle: number; shaft: readonly number[] }[] }`.
- Produce `Unit = { kind: 'row' | 'column' | 'box' | 'region' | 'diagonal'; index: number }`, `SudokuUnit = Unit & { cells: readonly number[] }`, and `RuleConstraint`: cage/thermo/arrow geometry with `kind`, a deterministic `id`, and its index in the original clue collection.
- Produce `RuleContext = { rules: PuzzleRules; units: readonly SudokuUnit[]; duplicatePeers: readonly (readonly number[])[]; relatedCells: readonly (readonly number[])[]; constraints: readonly RuleConstraint[] }`, `CLASSIC_RULES`, `CLASSIC_CONTEXT`, `isSudokuVariant(value: unknown): value is SudokuVariant`, `parseRules(value: unknown): ParseResult<PuzzleRules>`, and `compileRules(rules: PuzzleRules): RuleContext`.
- Fixture exports: `VARIANT_FIXTURES: Record<NewSudokuVariant, { rules: PuzzleRules; givens: Board; solution: Board }>`, `ARROW_REPEAT_BOARD`, `ARROW_REPEAT_RULES`, and `FULL_LENGTH_THERMO_RULES`. Fixtures contain literal expected facts, not production-computed expectations.

- [x] Write `rules.test.ts` cases named `rejects overlapping or disconnected partitions`, `rejects malformed ordered paths`, `allows shared cells across different paths`, and `separates related arrow cells from duplicate peers`. Assert nine connected nine-cell Jigsaw regions; Killer cages partition 81 cells, contain 1–9 cells, and have integer feasible sums; Thermo paths contain 2–9 unique adjacent cells; Arrow shafts contain 1–9 unique adjacent cells, excluding the circle. Reject unknown kinds and indices outside 0–80.

  ```ts
  it('separates related arrow cells from duplicate peers', () => {
    const context = compileRules(ARROW_REPEAT_RULES)
    expect(context.relatedCells[16]).toContain(40)
    expect(context.duplicatePeers[16]).not.toContain(40)
  })
  ```

- [x] Run `pnpm test:unit src/core/sudoku/rules.test.ts`; witness missing exports or unsupported-rule assertions fail.
- [x] Implement parsing and compilation. Use orthogonal connectivity for regions/cages and king-step adjacency for ordered paths. Give each clue a stable ID such as `cage:0`. Nine-digit units alone participate in hidden singles; cages add duplicate peers without becoming units; arrows add related cells without extra duplicate peers.
- [x] Author the fixture facts. The Arrow repeat fixture has circle 8 with value 8, shaft `[16, 24, 32, 40]` with values `[2, 1, 3, 2]`: cells 16 and 40 are related but are not duplicate peers. The full-length Thermo fixture has path `[0, 1, 2, 3, 4, 5, 6, 7, 8]`.
- [x] Run the rule tests and existing `board.test.ts`; both pass with unchanged Classic units/peer ordering. Review pure-engine import boundaries with `pnpm test:unit tooling/module-boundaries.test.ts`.

### Task 2: Sound Candidates, Conflicts, and Completion

**Files:** Create `src/core/sudoku/budget.ts`, `budget.test.ts`, `constraints.ts`, and `constraints.test.ts`. Modify `src/core/sudoku/board.ts` and `board.test.ts` for optional rule context while retaining Classic behavior.

**Interfaces:**

- Consume Task 1's `RuleContext` and `RuleConstraint`.
- Produce `WorkBudget = { limit: number; used: number }`, `createWorkBudget(limit: number): WorkBudget`, and `consumeWork(budget: WorkBudget, units?: number): boolean`. Validate nonnegative integer limits; a zero budget exhausts before the first charged operation.
- Produce `CandidateResult = { status: 'complete'; candidates: readonly NoteMask[] } | { status: 'budget-exhausted' }`, and `evaluateCandidates(board: Board, context: RuleContext, budget: WorkBudget): CandidateResult`.
- Produce `RuleViolation = { constraintId: string; cells: readonly number[]; message: string }` and `ConflictResult = { status: 'complete' | 'budget-exhausted'; violations: readonly RuleViolation[] }`; `evaluateConflicts(board: Board, context: RuleContext, budget: WorkBudget): ConflictResult` retains only proven violations when exhausted.
- Extend `isComplete(board: Board, context?: RuleContext): boolean`; the default remains `CLASSIC_CONTEXT` during staged migration. Keep `calculateCandidates(board)` and `findConflicts(board)` as Classic compatibility functions, with no arithmetic fallback disguised as success.

- [x] Write tests `bounds a nine-cell thermo to digits one through nine`, `retains supported repeated arrow digits`, `rejects an impossible partial cage total`, and `reports direct violations without using a stored solution`. Assert `maskOf(1)` at cell 0 and `maskOf(9)` at cell 8 for the empty full-length Thermo; the Arrow repeat fixture remains legal. A fully filled Classic board violating an active extra rule is incomplete.
- [x] Write `returns inconclusive when support enumeration exhausts` and `charges repeated propagation against the same budget`. With limit 0, arithmetic evaluation returns `budget-exhausted`; with a small explicit limit, `used <= limit` and no empty-domain or uniqueness result is fabricated.

  ```ts
  it('returns inconclusive when support enumeration exhausts', () => {
    const context = compileRules(ARROW_REPEAT_RULES)
    const result = evaluateCandidates(Array(81).fill(0), context, createWorkBudget(0))
    expect(result).toEqual({ status: 'budget-exhausted' })
  })
  ```

- [x] Run `pnpm test:unit src/core/sudoku/constraints.test.ts src/core/sudoku/budget.test.ts`; witness RED before implementing support evaluation.
- [x] Implement baseline unit/peer exclusion, finite local assignment support, and fixed-point propagation. Arithmetic assignments respect actual duplicate peers; do not impose all-different on an Arrow shaft. Enumerate only needed domains and stop explicitly on budget exhaustion. Evaluate complete filled clues directly for `isComplete`, without a search or the stored solution.
- [x] Run Task 2 tests and `board.test.ts`; verify direct conflicts include a stable constraint ID, affected cells, and a Chinese explanation. Preserve Classic candidate and conflict fixtures.

### Task 3: Bounded Rule-Aware Search and Independent Oracle

**Files:** Modify `src/core/sudoku/search.ts`, `search.test.ts`, and `types.ts`. Create `tests/support/referenceVariants.ts`; reuse `tests/support/referenceSudoku.ts` only for its independent Classic predicates.

**Interfaces:**

- Extend `countSolutions(board: Board, options: { maxSolutions: 2; nodeBudget: number; context?: RuleContext; workBudget?: WorkBudget }): SearchResult`. A supplied budget is shared, never reset by recursive nodes or candidate propagation. Preserve existing `nodesVisited`; add `workUsed: number` to both result branches.
- Produce `referenceCountSolutions(board: Board, rules: PuzzleRules, maxSolutions: 2): { count: 0 | 1 | 2; solution: Board | null }` in test support. It uses independent row/column/region membership and direct arithmetic/order checks, without production candidates, compilation, or search imports.

- [x] Write table-driven search tests across all five `VARIANT_FIXTURES`: production and independent counts match explicit fixture expectations; the known solution satisfies every clue. Add contradiction and multiple-solution boards, including an Arrow with legal repeated shaft values.
- [x] Write `cannot claim uniqueness after arithmetic exhaustion`. A sufficient node budget with an exhausted shared work budget must return `budget-exhausted`, even after one solution was found.

  ```ts
  it('cannot claim uniqueness after arithmetic exhaustion', () => {
    const fixture = VARIANT_FIXTURES.arrow
    const result = countSolutions(fixture.givens, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context: compileRules(fixture.rules),
      workBudget: createWorkBudget(0),
    })
    expect(result.status).toBe('budget-exhausted')
  })
  ```

- [x] Run `pnpm test:unit src/core/sudoku/search.test.ts`; witness the new rule-sensitive assertions fail.
- [x] Extend the existing deterministic MRV search to consume Task 2's candidate result and charge each visited node. Keep Classic tie-breaking, traversal, and node-budget behavior. Implement the deliberately simple reference solver separately; comparisons must not share constraint evaluation code.
- [x] Run the search, constraint, and existing generation tests; Classic search counts and deterministic fixtures remain unchanged. Confirm the test oracle rejects the malformed known-solution fixture before accepting authored variant fixtures.

### Task 4: Explained Variant Deductions and Difficulty Policies

**Files:** Create `src/core/sudoku/variantTechniques.ts` and `variantTechniques.test.ts`. Modify `techniques.ts`, `logic.ts`, `hint.ts`, their tests, `src/features/learning/model/examples.ts`, and the Classic evidence decoder in `src/worker/protocol.ts`; extend fixed facts in `tests/fixtures/variants.ts`.

**Interfaces:**

- Extend `Technique` with `cage-distinct`, `cage-remainder`, `cage-combination`, `thermo-bound`, `arrow-equation`, and `arrow-combination`. Keep the existing five-entry `TECHNIQUES` array and Classic ordering intact.
- Produce `RuleEvidence`, sharing `constraintId: string`, `cells: readonly number[]`, and `digits: readonly Digit[]`. Cage evidence adds `kind: 'cage'; sum: number; domains: readonly { cell: number; mask: NoteMask }[]`; Thermo adds `kind: 'thermo'; path: readonly number[]; bounds: readonly { cell: number; min: Digit; max: Digit }[]`; Arrow adds `kind: 'arrow'; circle: number; shaft: readonly number[]; domains: readonly { cell: number; mask: NoteMask }[]`. Evidence records the premises before the deduction, including singleton domains for filled values.
- Extend `LogicalStep.evidence` to `RuleEvidence | { kind: 'unit'; unit: Unit; cells: readonly number[]; digits: readonly Digit[]; premises: readonly RuleEvidence[] }`. Unit singles carry the prior rule premises responsible for their reductions. Existing placement/elimination payloads remain intact; Classic examples use empty `premises`.
- Produce `findVariantStep(state: LogicalState, context: RuleContext, techniques: readonly Technique[], budget: WorkBudget): { status: 'complete'; step: LogicalStep | null } | { status: 'budget-exhausted' }` and `VARIANT_TECHNIQUE_POLICIES: Record<Difficulty, readonly Technique[]>`.
- Extend `LogicalWorkspace` with `context: RuleContext`. Extend `createLogicalWorkspace(board: Board, context?: RuleContext): LogicalWorkspace`, `findLogicalStep(state: LogicalWorkspace, techniques: readonly Technique[], budget?: WorkBudget)`, and `applyLogicalStep(state: LogicalWorkspace, step: LogicalStep): void` coherently; `findLogicalStep` returns the same explicit step outcome as `findVariantStep`.
- Produce `LogicalOptions = { context: RuleContext; workBudget: WorkBudget }` and `LogicResult = { status: 'solved' | 'stalled' | 'budget-exhausted'; board: Board; steps: readonly LogicalStep[] }`. Extend `analyzeLogic(board: Board, allowed: readonly Technique[], stepBudget: number, options?: LogicalOptions): LogicResult` and `analyzeHint(board: Board, solution: Board, stepBudget: number, options?: LogicalOptions): HintResult`. Add `rateVariantDifficulty(board: Board, context: RuleContext, stepBudget: number, workBudget: WorkBudget): { status: 'rated'; difficulty: Difficulty | null } | { status: 'budget-exhausted' }`; retain Classic `rateDifficulty(board, stepBudget)`.

- [x] Write fixed-proof tests named `explains the cage premise before its resulting single`, `explains thermo positional bounds`, `solves a one-unknown arrow equation`, `uses jigsaw regions and diagonals as units`, and `does not remove a permitted repeated shaft digit`. Assert specific placements/removals and Chinese rule-specific terms from manually derived examples.
- [x] Write difficulty tests asserting Easy permits singles, cage distinct/remainder, Thermo bounds, and one-unknown Arrow equations; Medium adds unit intersections and cage/Arrow combinations; Hard adds naked/hidden pairs. For each policy, a fixture requiring the next tier must not be accepted by the easier policy.

  ```ts
  it('keeps combination deductions outside the easy policy', () => {
    expect(VARIANT_TECHNIQUE_POLICIES.easy).not.toContain('arrow-combination')
    expect(VARIANT_TECHNIQUE_POLICIES.medium).toContain('arrow-combination')
    expect(VARIANT_TECHNIQUE_POLICIES.hard).toContain('hidden-pair')
  })
  ```

- [x] Run the new technique, logic, and hint tests; witness RED for new evidence/policies.
- [x] Implement explainable steps over a workspace initialized with full-unit exclusions. Placement cleanup inside the logical workspace excludes full-unit peers only; cage distinctness and all arithmetic/order reductions remain explicit evidence-bearing steps. Generalize locked candidates to real intersecting units while preserving Classic ordering. Carry rule premises through subsequent single explanations. Keep wrong-entry review, manual-note independence, and undoable placement behavior.
- [x] Update `explainStep(step: LogicalStep): string`, Classic example evidence, and the Classic worker decoder to the unit discriminator with empty premises. Run `pnpm test:unit src/core/sudoku/variantTechniques.test.ts src/core/sudoku/logic.test.ts src/core/sudoku/hint.test.ts src/features/learning/model/lessons.test.ts` and `pnpm typecheck`; all pass. Arithmetic exhaustion produces a budget outcome, not an unsupported proof or claimed rating. Full variant worker validation remains in Task 7.

### Task 5: Original Fallback Catalogue and Safe Transforms

**Files:** Create `src/core/sudoku/variantTemplates.ts`, `variantTemplates.test.ts`, `variantGeneration.ts`, and `variantGeneration.test.ts`. Extend `tests/fixtures/variants.ts` with exact independently verified deductions.

**Interfaces:**

- Produce `VariantTemplate = { rules: PuzzleRules; givens: Board; solution: Board; difficulty: Difficulty }` and `VARIANT_TEMPLATES: Record<NewSudokuVariant, Record<Difficulty, readonly VariantTemplate[]>>`, with at least one authored template in every slot.
- Produce `transformVariantTemplate(template: VariantTemplate, transform: { symmetry: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; digitMap?: readonly Digit[]; complement?: boolean }): VariantTemplate` and `variantRulesMatter(template: VariantTemplate, budget: WorkBudget): { status: 'complete'; matters: boolean } | { status: 'budget-exhausted' }`.

- [x] Write `verifies all fifteen original fallback slots independently`: assert five types × three difficulties, independent count 1, exact known solution, requested logical tier, and a recorded rule-dependent proof. Add `rejects decorative variant clues`: removing extra rules cannot leave a uniquely solved Classic puzzle; for Jigsaw the Classic interpretation must change validity or remove uniqueness.

  ```ts
  it('provides at least fifteen original fallback slots', () => {
    expect(Object.keys(VARIANT_TEMPLATES)).toHaveLength(5)
    for (const tiers of Object.values(VARIANT_TEMPLATES)) {
      for (const tier of ['easy', 'medium', 'hard'] as const) {
        expect(tiers[tier].length).toBeGreaterThanOrEqual(1)
      }
    }
  })
  ```

- [x] Run the catalogue test with an empty catalogue; witness missing-slot failures. Author original fixtures and fixed deduction facts; use the independent solver to establish each solution. Do not copy puzzles from reference publications or relax a tier to fill a slot.
- [x] Write transform tests over all eight spatial symmetries. Assert all cell references, circles, regions, cage anchors, and ordered paths remap consistently. Killer complement transforms a sum to `10 * cageSize - oldSum`; Thermo complement reverses each path; reject digit maps/complement for Arrow and arbitrary digit maps for Killer/Thermo.
- [x] Run transform tests; witness RED before implementing safe transformations and the rule-necessity check.
- [x] Implement the two public functions and validate each transformed fixture. Digit bijections are permitted only for Diagonal/Jigsaw; all variants permit spatial transforms. Do not use Classic band/stack shuffles here.
- [x] Run `pnpm test:unit src/core/sudoku/variantTemplates.test.ts src/core/sudoku/variantGeneration.test.ts`. Every fallback has independent uniqueness, correct logical rating, and effective rules before generation integrates it.

### Task 6: Required Puzzle Rules and Deterministic Variant Generation

**Files:** Modify `src/core/sudoku/generation.ts`, `generation.test.ts`, `variantGeneration.ts`, and `variantGeneration.test.ts`; modify `src/storage/records.ts` for the isolated legacy puzzle adapter and `src/worker/protocol.ts` for the generation-input discriminator; update all existing puzzle/input constructors and mocks in game/learning views, the game store, worker/client tests, and `tests/{fixtures,support,e2e}` together.

**Interfaces:**

- Extend `Puzzle` with required `rules: PuzzleRules`. Produce `VARIANT_PUZZLE_VERSION = 'sudoku-variants-v1'`; retain `PUZZLE_VERSION = 'sudoku-v1'`. `parsePuzzle(value: unknown): ParseResult<Puzzle>` requires rules and validates the full solution, givens, supported version, and matching type/version.
- Make `GenerationInput` a discriminated union: Classic has `variant: 'classic'; puzzleVersion: 'sudoku-v1'`; new types have `variant: NewSudokuVariant; puzzleVersion: 'sudoku-variants-v1'`; both carry `seed: string` and `difficulty: Difficulty`.
- Retain `generatePuzzle(input: GenerationInput, limits?: GenerationLimits): GenerationResult` as the public dispatcher; produce `generateVariantPuzzle(input: Extract<GenerationInput, { puzzleVersion: 'sudoku-variants-v1' }>, limits: GenerationLimits): GenerationResult` in `variantGeneration.ts`.
- Add storage-private `parseLegacyPuzzle(value: unknown): ParseResult<Puzzle>`: validate version-1 Classic metadata/boards, insert `CLASSIC_RULES`, then use strict parsing. Only `formatVersion: 1` record parsers may call it; no generic or worker parser accepts missing rules.

- [x] Write fixed-seed generation tests for every type/difficulty, plus byte-for-byte Classic givens/solution/seed compatibility. Write `rejects missing rules outside a legacy record`, `rejects a solution that violates its clues`, and `uses distinct variant generation identities`.
- [x] Write generation/fallback budget tests: exactly 20 maximum layouts and 500 steps per analysis; generation uses one shared 1,000,000-unit budget and fallback validation uses a separate 1,000,000-unit budget. Force generated failure and successful fallback; force fallback exhaustion and assert `stage: 'fallback-validation'`, with no unverified puzzle.

  ```ts
  it('rejects missing rules outside a legacy record', () => {
    const classic = generatePuzzle({
      variant: 'classic',
      puzzleVersion: 'sudoku-v1',
      difficulty: 'easy',
      seed: 'compatibility',
    })
    expect(classic.status).toBe('ready')
    if (classic.status !== 'ready') throw new Error('Expected the fixed Classic fixture')
    const { rules: omittedRules, ...missingRules } = classic.puzzle
    expect(omittedRules.kind).toBe('classic')
    expect(parsePuzzle(missingRules).valid).toBe(false)
  })
  ```

- [x] Run generation tests; witness RED. Introduce required fields and migrate all Classic constructors/fixtures in the same change, keeping existing `sudoku-v1` random consumption unchanged. Do not silently normalize a new missing-rules payload.
- [x] Implement seeded valid solution/geometry creation for all five types. Build connected Jigsaw regions with a nonrectangular region; derive Killer totals; build increasing Thermo paths and valid Arrow equations from the solution. Choose/remove givens only after uniqueness, supported logical rating, and Task 5's rule-necessity check. Reject unsupported candidates, then validate the safely transformed fallback within its separate budget.
- [x] Run `pnpm test:unit src/core/sudoku src/storage/repository.test.ts src/features/learning/model/lessons.test.ts` and `pnpm typecheck`. All existing construction sites compile, legacy records still load, and strict new puzzle validation is active. Record deterministic fixture outcomes for later browser support.

### Task 7: Worker Rules and Evidence Boundaries

**Files:** Modify `src/worker/protocol.ts`, `client.ts`, `client.test.ts`, and `sudoku.worker.ts`; create `protocol.test.ts`. Modify game-store hint calls and `tests/support/runtime.ts` to the new client signature.

**Interfaces:**

- Extend hint requests to `{ kind: 'hint'; requestId: string; board: Board; solution: Board; rules: PuzzleRules }`. Generation requests carry Task 6's complete `GenerationInput`.
- Change `SudokuWorkerClient.hint(board: Board, solution: Board, rules: PuzzleRules, signal?: AbortSignal): Promise<WorkerOutcome<HintResult>>`. Preserve `generate(input, signal?)`, `dispose()`, existing request IDs, and `WorkerOutcome` branches.
- Extend existing `parseWorkerRequest(value: unknown): ParseResult<WorkerRequest>` and `parseWorkerResponse(value: unknown): ParseResult<WorkerResponse>`; produce `validateHintEvidence(hint: HintResult, rules: PuzzleRules): ParseResult<HintResult>`. The client validates decoded evidence against the original request's rules and rejects generated type/version mismatches before installation.

- [x] Write protocol tests for every rule/evidence kind and malformed request/result: unknown type/version, missing rules, contradictory solution, disconnected geometry, out-of-range cells, invalid sums, and evidence referencing a nonexistent clue. Assert a rejected response never installs a puzzle or hint.
- [x] Write client tests `retains cancellation and timeout outcomes for variants` and `ignores stale variant replies`. Keep timeout 15,000ms with fake timers and preserve budget-exhausted responses.

  ```ts
  it('rejects hint requests without complete rules', () => {
    const fixture = VARIANT_FIXTURES.arrow
    expect(
      parseWorkerRequest({
        kind: 'hint',
        requestId: 'arrow-request',
        board: fixture.givens,
        solution: fixture.solution,
      }).valid,
    ).toBe(false)
  })
  ```

- [x] Run `pnpm test:unit src/worker`; witness RED for the extended protocol before implementing it.
- [x] Implement request parsing, carry `compileRules(rules)` into hint evaluation with a bounded work budget, and parse all deduction evidence. Preserve the literal worker constructor `new Worker(new URL('./sudoku.worker.ts', import.meta.url), { type: 'module' })`.
- [x] Run worker tests and `pnpm typecheck`; review that worker failures/cancellations do not become success-shaped defaults.

### Task 8: Session Rules and Version-2 Persistence

**Files:** Modify `src/features/game/model/session.ts`, `session.test.ts`, `daily.ts`, `daily.test.ts`, `src/features/game/stores/useGameStore.ts` and its action tests, `src/storage/records.ts`, `repository.ts`, and `repository.test.ts`. Create `src/storage/records.test.ts`. Keep schema and save-queue/lease contracts unchanged.

**Interfaces:**

- Extend `applySessionAction(session: GameSession, action: GameAction, workBudget?: WorkBudget): SessionActionResult`. Produce `SessionActionResult = { status: 'complete'; session: GameSession; changed: boolean; boardComplete: boolean } | { status: 'budget-exhausted'; session: GameSession; changed: false; boardComplete: false }`. Derive context from the stored puzzle; candidate exhaustion retains notes and is reported by the store. The default candidate-help budget is 1,000,000 work units.
- Change normalized `SessionRecord` to `{ formatVersion: 2; revision: number; session: GameSession }` and `ResultRecord` to `{ formatVersion: 2; session: GameSession }`. `parseSessionRecord`/`parseResultRecord` accept validated v1/v2 and return normalized v2 values; `parseSession(value)` remains strict. Only the v1 record path uses Task 6's legacy adapter.
- Produce `getDailyIdentity(date: string, variant: SudokuVariant): { seed: string; formalId: string; input: GenerationInput }` in `daily.ts`. Use this helper in record formal-identity validation; it must not depend on a store or browser API.
- Preserve `GameRepository` public signatures. `replaceActiveSession` scopes free replacements by `session.puzzle.rules.kind`; learning replacements retain one mode-wide slot. Validate `previous` belongs to the target slot before deleting it.

- [x] Write session tests asserting Arrow entry at cell 16 preserves a `2` note at cell 40, while proven duplicate-peer notes are removed. Test variant-aware candidate help, completion, undo/redo, and irreversible assistance; exhaustion retains existing notes and reports failure.
- [x] Write legacy fixture tests with nonempty undo/redo, revision, assistance, completion, and daily identity. Assert normalization adds Classic rules without altering those values; the next write is v2. Reject unknown formats/types, v2 missing rules, malformed geometry, and mismatched formal IDs through quarantine. Assert schema remains 1 and existing lesson/settings records remain valid.
- [x] Write repository tests `replaces only the requested free variant slot`, `preserves the single learning practice slot`, and `rejects cross-slot or stale replacement ownership`. Assert two free types survive concurrent-tab writes; aborted replacement leaves both prior saves intact.

  ```ts
  it('uses distinct formal daily identities without rewriting Classic', () => {
    expect(getDailyIdentity('2026-10-11', 'classic').formalId).toBe('daily:2026-10-11:formal')
    expect(getDailyIdentity('2026-10-11', 'arrow').formalId).toBe('daily:arrow:2026-10-11:formal')
  })
  ```

- [x] Run session, daily, records, and repository tests; witness RED for the new slot/format requirements before implementing them.
- [x] Implement action integration, legacy record normalization, v2 writes, idempotent results, and scoped transactional replacement. Update normalized record constructors in `tests/support/gameFixtures.ts`, game-store tests, and records model/store tests to v2; keep explicit v1 migration inputs as raw unknown data. Keep foreign saved bytes in quarantine with reasons, and keep dataset epochs, revision checks, leases, and serialization intact.
- [x] Run `pnpm test:unit src/features/game/model src/storage src/infrastructure/ownership.test.ts` and `pnpm typecheck`; Classic v1 formal results cannot grant another formal attempt.

### Task 9: Safe Type Transitions, Daily Status, and Record Aggregation

**Files:** Create `src/features/game/model/variants.ts`, `variants.test.ts`, and `presentation.test.ts`. Modify `useGameStore.ts` and its three test files, existing action call sites in `GameView.vue`/`DailyView.vue`, `daily.ts`, `presentation.ts`, `src/features/records/model/records.ts`, its test, and records store/tests.

**Interfaces:**

- Produce `VARIANT_OPTIONS: readonly { label: string; value: SudokuVariant }[]`, `VARIANT_RULE_TEXT: Record<SudokuVariant, string>`, and `parseVariantQuery(value: unknown): ParseResult<SudokuVariant>`; absent query means Classic, unknown/array values reject explicitly.
- Produce `GameTransition = { status: 'ready' } | { status: 'blocked'; reason: 'save' | 'ownership' | 'load' | 'generation' } | { status: 'cancelled' }`.
- Change store `startGame(input: GenerationInput, metadata: SessionMetadata, replaceId?: string, id?: string): Promise<GameTransition>`, `startDaily(date: string, variant: SudokuVariant): Promise<GameTransition>`, and `restoreSession(id: string): Promise<GameTransition>`. Preserve operation epochs internally; update callers that previously inspected raw epoch values. Expose `activeVariant` derived from the actual session and `findFreeSession(variant: SudokuVariant): Promise<StorageOutcome<SessionRecord | null>>`.
- Daily status is `DailyVariantStatus = { variant: SudokuVariant; state: 'available' | 'in-progress' | 'completed' }`; produce `getDailyStatuses(sessions: readonly SessionRecord[], results: readonly ResultRecord[], date: string): readonly DailyVariantStatus[]` in `daily.ts`.
- Extend `summarizeRecords(results: readonly ResultRecord[], today: string, variant: SudokuVariant): RecordSummary`; statistics are for the selected type only. `sessionLink(session: GameSession): string` includes `variant` and the existing explicit session/lesson identity.
- Expose records-store `summaries: Readonly<Record<SudokuVariant, RecordSummary>>` as computed state; retain its Classic `summary` during caller migration. The records view keeps its filter local.

- [x] Write transition tests with deferred persistence/generation: `retains an unsaved session after a failed type switch`, `retries before installing the requested type`, and `ignores a late previous-type generation`. Assert session ID, entries, elapsed time, and ownership remain usable after failure. Success pauses/saves the old type before installation; replacing a target save requires its own revision/lease.
- [x] Write daily tests asserting Classic identity `daily:2026-10-11:formal` and seed `daily:sudoku-v1:2026-10-11`; Arrow identity `daily:arrow:2026-10-11:formal` and seed `daily:sudoku-variants-v1:arrow:2026-10-11`; all six inputs are Medium. Test Beijing midnight, independent formal eligibility/replays, restart assistance/time, and old-date completion.
- [x] Write records/query tests asserting absent query is Classic, `variant=unknown` and multiple values reject, explicit session restores its own type, six independent daily statuses, separate assisted bests, and separate per-type streaks when two types finish on one date.

  ```ts
  it('rejects unknown variant queries and defaults absent ones to Classic', () => {
    expect(parseVariantQuery(undefined)).toEqual({ valid: true, value: 'classic' })
    expect(parseVariantQuery('unknown').valid).toBe(false)
    expect(parseVariantQuery(['arrow', 'killer']).valid).toBe(false)
  })
  ```

- [x] Run game-store, daily, records, and query tests; witness RED before changing transitions and aggregation.
- [x] Implement a single save-before-install transition guard used by generation, restoration, and daily switching. A failed flush/write blocks installation and preserves the in-memory session for retry. Keep checks in existing session actions; derive conflicts via Task 2 and show proven violations on exhaustion without claiming a complete evaluation. Update store doubles/callers atomically.
- [x] Run `pnpm test:unit src/features/game src/features/records` and `pnpm typecheck`. Review operation epochs, aborted transactions, and lease release paths against existing lifecycle tests.

### Task 10: Clue Geometry, Board Focus, and Accessible Rule Context

**Files:** Create `src/shared/model/boardGeometry.ts`, `boardGeometry.test.ts`, `src/shared/components/SudokuClues.vue`, and `SudokuClues.test.ts`. Modify `SudokuBoard.vue`, `SudokuBoard.test.ts`, `src/styles/theme.css`, game/lesson board props, and `HintPanel.vue`.

**Interfaces:**

- Produce `BoardGeometry = { boundaries: readonly { cell: number; edge: 'top' | 'right' | 'bottom' | 'left' }[]; clues: readonly ({ kind: 'diagonal'; cells: readonly number[] } | { kind: 'cage'; id: string; cells: readonly number[]; anchor: number; sum: number } | { kind: 'thermo'; id: string; cells: readonly number[] } | { kind: 'arrow'; id: string; circle: number; shaft: readonly number[] })[] }`.
- Produce `getBoardGeometry(rules: PuzzleRules): BoardGeometry`, `getCellRuleContext(cell: number, rules: PuzzleRules): string`, and `getSelectedRuleDescriptions(cell: number, rules: PuzzleRules): readonly string[]`. These format geometry/rule context, never solve or import feature stores.
- Extend `SudokuBoard` typed props with `rules: PuzzleRules` and `relatedCells: readonly number[]`; preserve existing board/givens/notes/selection/conflict/hint/disabled/obscured props and input emits. `SudokuClues` receives `geometry: BoardGeometry` and `obscured: boolean`.

- [x] Write geometry tests asserting Jigsaw borders match its region map, no false 3×3 borders, each cage has one stable sum anchor, Thermo begins at its bulb, and Arrow retains its circle/shaft direction. Test shared-path cells and all spatial symmetries.
- [x] Write component tests `keeps overlay geometry out of the input and accessibility trees`, `obscures clues and accessible clue details while paused`, and `explains selected constraints as text`. Assert SVG `aria-hidden`, no pointer events, hidden pause clues, Chinese cell/selected-rule descriptions, and unchanged board button events.

  ```ts
  it('explains an arrow circle and shaft as text', () => {
    expect(getCellRuleContext(8, ARROW_REPEAT_RULES)).toContain('箭头')
    expect(getSelectedRuleDescriptions(16, ARROW_REPEAT_RULES).join(' ')).toContain('总和')
  })
  ```

- [x] Run shared geometry/component tests; witness RED for missing clue/rule props before implementing them.
- [x] Draw responsive SVG in board coordinates over the CSS Grid: diagonals, region boundaries, inset dashed cages/sum labels, Thermo bulb/tube, and Arrow circle/shaft/head. Keep cell buttons, digits, notes, markers, and focus above decorative geometry. Reserve cage-label space and use shared theme variables. Related highlights use `relatedCells`, while pruning remains in session rules.
- [x] Update game/lesson board props and HintPanel evidence rendering. Run shared tests, `pnpm typecheck`, and module-boundary tests. Confirm components import no persistence, worker, runtime, or feature-store modules.

### Task 11: Player Selection, Resume Cards, Records, and Rule Lessons

**Files:** Modify `src/features/game/views/GameView.vue`, `DailyView.vue`, `src/features/home/views/HomeView.vue`, `src/features/records/views/RecordsView.vue`, `src/features/learning/{model/lessonIds.ts,model/lessons.ts,views/LearningView.vue,views/LessonView.vue}` and learning tests. Create `model/variantExamples.ts` under learning and `tests/e2e/variants.spec.ts`; extend `tests/e2e/{support.ts,daily.spec.ts,storage.spec.ts,learning.spec.ts,ux.spec.ts}` as needed.

**Interfaces:**

- Consume Task 9's options, query parser, statuses, transition outcomes, statistics, and session links; consume Task 10's explicit board rules/context.
- Extend `Lesson` with `rules: PuzzleRules` and `practiceVariant: SudokuVariant`. Produce `VARIANT_EXAMPLES` with fixed rules, board, candidates, explanatory proof, and one expected exercise per new type. Add stable lesson IDs `diagonal-rules`, `jigsaw-rules`, `killer-rules`, `thermo-rules`, and `arrow-rules`; preserve the existing six IDs.
- Free selector/difficulty state remains local and configures the next game. Active heading comes from `activeVariant`; daily selection changes only after `GameTransition.status === 'ready'`. Failed transitions retain the previous selector/session and offer retry. No new routes are required.

- [x] Add player-oriented browser tests before exposing selectors: starting each variant displays its Chinese rule/heading/clues; selecting another free type keeps the current puzzle intact until starting; an unfinished target offers resume or confirmed replacement. Reject unknown query with actionable feedback and restore explicit saved sessions using their stored type.
- [x] Add tests that daily status has six entries, switching retains both progresses, refresh restores the selected saved type, and a simulated failed save retains the board and permits retry. Home cards include actual type/mode/difficulty; records filters separate type statistics.
- [x] Add learning tests: the existing six IDs/progress survive, five new fixed exercises have independently derived answers, and each new lesson starts Easy practice of its own type. Run targeted unit/e2e tests; witness RED for missing UI before implementation.

  ```ts
  it('keeps all six Classic lesson identities', () => {
    expect(LESSON_IDS.slice(0, 6)).toEqual([
      'rules',
      'naked-single',
      'hidden-single',
      'locked-candidate',
      'naked-pair',
      'hidden-pair',
    ])
    expect(LESSON_IDS).toHaveLength(11)
  })
  ```

- [x] Implement selectors with installed Naive UI components, validated route queries, explicit target-resume/replacement dialogs, save-failure feedback, selected-rule text, home progress out of six, and type-filtered statistics. Keep temporary choices local and meaningful session changes in store actions; use `storeToRefs` for reactive destructuring.
- [x] Implement the five rule introductions/exercises and practice links. Update Classic lesson board rules to `CLASSIC_RULES` without altering their content/order/progress identity.
- [x] Run learning tests, type checking, and the targeted `variants`, `daily`, `storage`, `learning`, and `ux` Playwright specs on `--project=desktop --project=mobile --project=webkit` after building. Expected: all tests pass; no new save-loss, focus, or ownership regression.

### Task 12: Complete Product Verification and Documentation

**Files:** Extend `tests/e2e/variants.spec.ts`, `visual.spec.ts`, and `worker.spec.ts`; update `README.md`, `docs/architecture.md`, and this plan's completion record. Change implementation files only for defects demonstrated by verification.

**Interfaces:** Consume the completed Task 1–11 contracts. No additional feature APIs or dependencies are introduced.

- [x] Add integrated checks for each new type: candidate help, rule-evidenced hint/application, undo/redo, pause concealment, persistence after refresh, and valid completion. Fixed fixtures isolate interaction tests from random generation. Add genuine worker smoke tests for all five types and retain root plus `/sudoku/` asset coverage.
- [x] Add dark-theme and 360px touch/focus checks, including sum-label/note readability, Jigsaw borders, Arrow heads, SVG alignment, selection markers, keyboard arrows, modal focus, and overlays not intercepting taps. Use screenshots for visual review where DOM assertions cannot establish alignment/readability.

  ```ts
  test('loads the Arrow daily rule through the real worker', async ({ page }) => {
    await page.goto('/#/play/daily?variant=arrow')
    await expect(page.getByRole('heading', { name: /箭头数独/ })).toBeVisible()
    await expect(page.getByText(/箭头.*总和/).first()).toBeVisible()
  })
  ```

- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, and `pnpm build:subpath`. Expected: every command exits 0, all fixed-seed/domain/persistence suites pass, and worker assets exist at both deployment roots.
- [x] Run `pnpm test:e2e --project=desktop --project=mobile --project=webkit`. Expected: all available browser tests pass. Report the known Firefox host launch limitation separately unless a fresh launch proves it resolved; do not claim emulation is physical-device testing or that the full default `pnpm check` passed when Firefox could not run.
- [x] Review every spec section against test evidence, especially fifteen fallback slots, rule necessity, bounded arithmetic, evidence chains, v1 migration, type-scoped formal identities, failed-save recovery, and stale responses. Fix demonstrated defects and rerun affected checks before declaring completion.
- [x] Document rules, hints/difficulty limits, deterministic versions/budgets, storage normalization, independent daily attempts, and verified platforms in English. Self-review the final diff, run `git diff --check`, record commands/results and any material limitations, and leave changes uncommitted for user review.

## Plan Review Record

Self-review maps design sections 3–6 to Tasks 1–7, section 7 to Tasks 9–11, section 8 to Tasks 6/8/9/11, and section 10 to Task 12 plus each task's targeted tests. All five Review Focus conditions have owning tests. Rule discriminators, versions, budgets, identity helpers, and transition outcomes are shared across their consumers. Implementation uses the preserved inline execution method after the user reviews this plan.

## Completion Record

Implemented Tasks 1–12 inline on the explicitly authorized current branch.

Verification on 2026-10-12:

- `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`: passed.
- `pnpm test:unit`: 345 tests in 40 files passed, including the independent fifteen-slot catalogue, rule necessity, proof conclusions, budgets, migration, ownership, transitions, explicit conflict recovery, and arithmetic hint presentation.
- `pnpm build` and `pnpm build:subpath`: passed; both emit the production module worker. The main bundle is about 598 kB before gzip and emits Vite's existing-size warning; deployment remains functional.
- `pnpm test:e2e --project=desktop --project=mobile --project=webkit`: 183 tests passed. Coverage includes all five real variant workers at both roots, numeric hint explanations and current-step highlighting, history, completion, independent daily/free saves, refresh after type selection/restart, confirmed save-conflict recovery, eleven lessons, and 360px light/dark geometry.
- Reviewed screenshots for all five types in both themes. Corrected Killer sum/note overlap, intrinsic candidate-grid overflow, and selected backgrounds concealing clues; the final visual checks pass in Chromium and WebKit.
- `git diff --check`: passed.
- Fresh Firefox smoke failed before page creation with `browserType.launch: spawn UNKNOWN`. Firefox compatibility and physical-device behavior remain unverified; no claim is made that the default `pnpm check` passed.

The execution ledger and original authoring scratch remain in the ignored plan workspace as local execution evidence. A fresh-context whole-change review found three Important issues: stale free-session URLs, blocked recovery from conflicted unsaved edits, and incomplete arithmetic hint presentation. All three were fixed in one pass with observed RED-to-GREEN regressions followed by the passing full unit and available browser suites. No Critical findings or deferred minors remain. The recorded Firefox, bundle-size, concurrent memory-only recovery, and authored-layout trade-offs remain explicit limitations.
