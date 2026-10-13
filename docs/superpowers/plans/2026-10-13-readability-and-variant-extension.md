# Readability and Variant Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Improve the readability and responsibility boundaries of the existing application and make additional Sudoku variants easier to integrate without changing current behavior.

**Architecture:** Preserve application composition, cohesive features, pure engine, workers, and persistence. Use statically assembled typed rule/generation/presentation definitions, internal game persistence and transition modules, and feature-owned route/exercise composables. Keep one public game store and the shared solver.

**Tech Stack:** Vue 3.5.43, TypeScript 6.0.3, Vite 8.3.4, Vue Router 5.4.0, Pinia 4.0.3, Naive UI 2.45.3, idb 8.0.4, native CSS, Web Workers, Vitest 5.0.3, Playwright 1.64.0, pnpm 12.11.2.

**Spec:** [Approved refactor design](../specs/2026-10-13-readability-and-variant-extension-design.md). Also read [AGENTS.md](../../../AGENTS.md), [Web Architecture](../../architecture.md), and the [existing variants design](../specs/2026-10-11-sudoku-variants-design.md).

**Status:** Complete with the browser limitations recorded below. Changes remain uncommitted in the current branch.

## Global Constraints

- Preserve Classic plus Diagonal, Jigsaw, Killer, Thermo, and Arrow; all boards have 81 cells and digits 1–9.
- Write documentation, identifiers, comments, and test descriptions in English. Preserve Chinese player-facing copy and current responsive layouts.
- Work in the current checkout and branch. Do not create a worktree, add dependencies, or commit without a subsequent explicit request.
- Preserve Classic `sudoku-v1` and variant `sudoku-variants-v1` seed outputs and fallback behavior. Do not bump versions to conceal accidental changes.
- Preserve worker envelopes, cancellation, timeouts, stale-result rejection, bounded work, and exact clue/evidence matching.
- Preserve storage record formats, legacy Classic normalization, quarantine behavior, revision/lease/dataset fencing, and transactional replacement scoped by mode/type.
- Failed writes and cancelled transitions retain the old in-memory game. Confirmed reload remains the only replacement of conflicted unsaved edits.
- Preserve irreversible assistance, daily formal eligibility and restart timing, six independent daily statuses, and variant-specific record aggregation.
- Preserve keyboard/touch input, modal focus, pauses, notes, undo/redo, lesson progress, router behavior, and current responsive layout.
- Apply logical paragraph breaks, individual declarations, explicit workflow branches, and invariant comments from AGENTS.md. Do not split by a line-count quota or add a dynamic plugin framework.

## Review Focus

1. Seed compatibility: calling the refactored generator twice proves current determinism, not compatibility with the old generator. Freeze pre-refactor results before moving generation code (Tasks 1 and 3).
2. Async lifetime: a response can finish after another session is installed, a route is unmounted, or the dataset is reset. It must not restore old state or retain a newly acquired lease (Tasks 6 and 7).
3. Unsaved completion: flushing/releasing/retrying must retain entries, history, time, assistance, and the completed result exactly once after a failed write (Task 6).
4. Variant typing and semantics: registry coverage must not erase discriminated data or confuse Arrow highlights with duplicate peers; an exhausted constraint budget remains inconclusive (Tasks 2–5).
5. Lesson interaction: a delayed correct-answer save must not steal board focus or publish feedback into another lesson; keyboard/touch must use the same answer action and yield to dialogs/full-board practice (Task 7).

## Baseline and Execution Order

At plan creation, `pnpm typecheck` passed and `pnpm test:unit` passed all 346 tests in 40 files. The unit run emitted the existing jsdom `Window.scrollTo()` notices. Product code remains at `aba296f`.

Implement Tasks 1–8 sequentially. A completed task must leave the application type-safe and its relevant contracts passing. Keep the existing independent rule/search oracles. Compatibility snapshots establish historical output identity; they do not replace correctness oracles.

The specification and AGENTS.md changes are complete preparation. Run relevant tests during implementation; do not add implementation-mirroring tests to cosmetic paragraph/comment changes or manufacture a failing test for a mechanical extraction already covered by contract tests.

## File Ownership

| Owner                         | Create                                                                                                                                                                               | Modify                                                                                       | Responsibility                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Compatibility verification    | `tests/fixtures/generationCompatibility.json`, `src/core/sudoku/generationCompatibility.test.ts`                                                                                     | Existing generation/rule tests only where coverage is missing                                | Frozen pre-refactor outputs and independent domain expectations                                     |
| Rule definitions              | `src/core/sudoku/ruleTypes.ts`, `ruleTopology.ts`, `variantRegistry.ts`, `variants/{classic,diagonal,jigsaw,killer,thermo,arrow}.ts`, `variantRegistry.test.ts`                      | `rules.ts` and existing rule/constraint tests                                                | Rule contracts, shared topology, typed static definitions, decoding/compilation                     |
| Generation strategies         | `src/core/sudoku/generationStrategies.ts`                                                                                                                                            | Five non-Classic definition modules, `variantGeneration.ts`, generation tests                | Variant-specific geometry and legal transformations; common generation orchestration remains shared |
| Presentation definitions      | No extra UI component tree                                                                                                                                                           | `features/game/model/variants.ts`, `shared/model/boardGeometry.ts`, existing consumers/tests | Complete metadata and board-adapter maps, derived options, accessible descriptions                  |
| Worker evidence               | `src/worker/hintEvidence.ts`                                                                                                                                                         | `protocol.ts`, `protocol.test.ts`, `client.test.ts`                                          | Detailed hint/evidence parsing and identity checks, separate from transport envelopes               |
| Session workflow              | `src/features/game/stores/sessionPersistence.ts`, `sessionTransitions.ts` and focused tests where needed                                                                             | `useGameStore.ts`, game store/lifecycle/daily tests                                          | Resource ownership and guarded session transitions, one public store                                |
| Page/exercise coordination    | `src/features/game/composables/useGameEntry.ts`, `useDailyEntry.ts`, `src/features/learning/composables/useLessonExercise.ts`; `src/features/game/components/GameSettingsDialog.vue` | Game/daily/lesson views and existing relevant tests                                          | Route initialization, setup/resume intent, complete exercise lifetime, settings presentation        |
| Readability and documentation | `docs/variant-extension.md`                                                                                                                                                          | Remaining production source/tests where needed, `docs/architecture.md`, this plan            | Logical grouping, useful comments, actual ownership and extension checklist                         |

`rules.ts` remains a meaningful checked public entry point, not an empty barrel. Definition modules must not import it during registry construction. Do not move storage or worker directories or split large authored fixtures/CSS solely because they are long.

### Task 1: Freeze Existing Generation Contracts

**Interfaces:** Consume unchanged `createGenerationInput(variant, difficulty, seed): GenerationInput` and `generatePuzzle(input, limits?): GenerationResult`. Produce JSON cases with `input`, explicit `limits` when forced, and the complete captured `expected` outcome.

- [x] Capture current results for all six variants and all three difficulties with seed `readability-compatibility-2026-10-13`, using both default limits and forced fallback limits `{ maxLayouts: 0, searchNodes: 0, logicalSteps: 500, fallbackNodes: 1000000 }`. Capture before changing generator, rules, or fixtures.
- [x] Add `generationCompatibility.test.ts` test `preserves the frozen versioned generation outcome for $input.variant/$input.difficulty`. Assert `generatePuzzle(input, limits)` equals the full captured result, including source, geometry, givens, solution, version, and seed. Parse the fixture at runtime rather than casting imported JSON to a trusted domain type.
- [x] Review the captured results: every case is `ready`; no current puzzle data or policy is edited to make the baseline pass. State in a comment that historical snapshots are compatibility evidence, while the existing reference solvers prove correctness.
- [x] Run `pnpm test:unit src/core/sudoku/generationCompatibility.test.ts src/core/sudoku/generation.test.ts src/core/sudoku/variantPuzzle.test.ts`. Expected: all compatibility and independent-generation checks pass before the refactor.

### Task 2: Introduce Typed Rule Definitions

**Interfaces:** Move the existing `SudokuVariant`, `PuzzleRules`, `RuleConstraint`, `SudokuUnit`, and `RuleContext` contracts unchanged to `ruleTypes.ts`. Define `RulesFor<K extends SudokuVariant> = Extract<PuzzleRules, { kind: K }>` and `CompiledVariantRules = { units: readonly SudokuUnit[]; constraints: readonly RuleConstraint[]; duplicateGroups: readonly (readonly number[])[] }`.

Each `VariantRuleDefinition<K>` exposes `parse(value: unknown): ParseResult<RulesFor<K>>` and `compile(rules: RulesFor<K>): CompiledVariantRules`. `VARIANT_RULE_DEFINITIONS` must satisfy `{ [K in SudokuVariant]: VariantRuleDefinition<K> }`. Keep `parseRules(value: unknown): ParseResult<PuzzleRules>`, `compileRules(rules: PuzzleRules): RuleContext`, `CLASSIC_RULES`, `CLASSIC_CONTEXT`, `constraintCells`, and `satisfiesConstraint` compatible at their existing public import path.

- [x] Add registry tests `covers every supported variant with its own decoded kind`, `rejects a payload whose kind does not match its definition`, and `does not mutate rules while compiling`. Use `VARIANT_FIXTURES` plus `{ kind: 'classic' }` and assert returned discriminators and unchanged serialized payloads. Run the new tests to witness absent definition exports before implementation.
- [x] Move shared cell parsing, adjacency/connectivity/partition helpers, and Classic unit construction to `ruleTopology.ts`. Export descriptive helpers, replacing the existing nested row/column/box ternary with explicit unit construction. Preserve unit/peer ordering.
- [x] Move each decoder and its topology contribution into its own `variants/*.ts` definition. Preserve validation issues, cage sum bounds/partition, ordered-path adjacency, directed paths, and stable clue IDs.
- [x] Assemble the typed static registry. Narrow heterogeneous rule values with an exhaustive checked dispatcher where necessary. Use no unchecked map-function casts, silent default-to-Arrow branch, or engine imports from features/UI.
- [x] Keep relationships assembled centrally from full units, explicit duplicate groups, and clue-related groups. Annotate why Arrow shafts are related without becoming duplicate peers and why Killer cages are not nine-digit units.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test:unit src/core/sudoku/rules.test.ts src/core/sudoku/variantRegistry.test.ts src/core/sudoku/constraints.test.ts src/core/sudoku/board.test.ts src/core/sudoku/variantSearch.test.ts tooling/module-boundaries.test.ts`. Expected: exact Classic topology, Arrow repeat fixture, zero-budget inconclusive outcomes, and all boundaries pass.

### Task 3: Move Variant Geometry and Transformation Strategies

**Interfaces:** Preserve `SpatialSymmetry`, `transformVariantTemplate(template, transform): VariantTemplate`, `variantRulesMatter(template, budget)`, and `generateVariantPuzzle(input, limits): GenerationResult` at their current import path. Define `VariantGenerationStrategy<K extends NewSudokuVariant>` with readonly `allowsDigitMap`/`allowsComplement`, `createGeometry(rules: RulesFor<K>, solution: Board, random: () => number, budget: WorkBudget): RulesFor<K> | null`, and `transformRules(rules: RulesFor<K>, cellMap: (cell: number) => number, complement: boolean): RulesFor<K>`.

`VARIANT_GENERATION_STRATEGIES` satisfies a mapped definition for every `NewSudokuVariant`. Export strategies from the corresponding rule-definition modules; keep common board/spatial transforms and generator orchestration in `variantGeneration.ts`.

- [x] Preserve the Task 1 baseline and run existing transformation tests before moving code. Add `advertises only rule-preserving digit transformations` asserting digit maps for Diagonal/Jigsaw, complement for Diagonal/Jigsaw/Killer/Thermo, and neither digit mapping nor complement for Arrow.
- [x] Move Jigsaw swaps/connectivity, Killer cage construction, Thermo path creation, and Arrow shaft enumeration to their strategies. Diagonal retains its existing geometry. Preserve branch order, work charges, loop bounds, template selection, and every random call; document this versioned contract near dispatch.
- [x] Move clue remapping to `transformRules`. Cage complement remains `10 * cageSize - oldSum`; Thermo complement reverses each path; Arrow never applies digit renaming/complement. Keep malformed-transform rejection explicit.
- [x] Keep necessity, uniqueness, logical rating, givens removal, and fallback validation shared. Remove repeated type-name selection from the orchestration without changing exhaustion/failure outcomes.
- [x] Run `pnpm test:unit src/core/sudoku/generationCompatibility.test.ts src/core/sudoku/generation.test.ts src/core/sudoku/variantGeneration.test.ts src/core/sudoku/variantPuzzle.test.ts src/core/sudoku/variantTemplates.test.ts`. Expected: all 36 frozen cases and independent solver checks pass. A compatibility difference blocks completion; fix the changed stream instead of regenerating snapshots.

### Task 4: Centralize Variant Presentation Without Crossing Engine Boundaries

**Interfaces:** Add `VariantPresentation = { label: string; ruleText: string }`, complete `VARIANT_PRESENTATION`, and `getVariantPresentation(variant: SudokuVariant): VariantPresentation` in the game model. Derive `VARIANT_OPTIONS` from the stable engine variant order. Preserve `parseVariantQuery(value: unknown): ParseResult<SudokuVariant>` and `GameTransition`.

In `boardGeometry.ts`, define `VariantBoardAdapter<K>` with `geometry(rules: RulesFor<K>): BoardGeometry` and `describeCell(cell: number, rules: RulesFor<K>): readonly string[]`, plus a complete typed adapter map. Preserve `getBoardGeometry`, `getSelectedRuleDescriptions`, `getCellRuleContext`, and `getCageOutline` signatures and outputs.

- [x] Extend `variants.test.ts` to assert all six ordered options and their existing Chinese labels/rules. Extend `boardGeometry.test.ts` to assert every definition's empty/nonempty clue behavior and unchanged accessible text for known cells, including overlapping Arrow/Thermo clues.
- [x] Replace independently maintained metadata/options with the complete presentation map and derived options. Migrate existing `VARIANT_NAMES`/`VARIANT_RULE_TEXT` consumers to `getVariantPresentation` where this avoids constructing duplicate lookup maps; do not introduce a generic mapping helper just for these six entries.
- [x] Replace the two variant-selection switches in board presentation with typed adapters. Keep narrow exhaustive dispatch where required for type correlation. Leave the specialized SVG renderer and board input behavior intact.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test:unit src/features/game/model/variants.test.ts src/shared/model/boardGeometry.test.ts src/shared/components/SudokuBoard.test.ts src/features/learning/model/lessons.test.ts src/features/game/model/daily.test.ts src/features/records/model/records.test.ts`. Expected: unchanged labels, course IDs, six daily statuses, scoped records, and rendered clue facts.

### Task 5: Separate Hint Evidence From Worker Transport

**Interfaces:** Move `parseHint(value: unknown): HintResult | null` and `validateHintEvidence(hint: HintResult, rules: PuzzleRules): ParseResult<HintResult>` plus their detailed helpers to `worker/hintEvidence.ts`. `protocol.ts` retains `WorkerOutcome`, `WorkerRequest`, `WorkerResponse`, `parseWorkerRequest`, and `parseWorkerResponse`; preserve the current `validateHintEvidence` import contract for the worker client through a meaningful public export.

- [x] Review existing malformed evidence, mismatched clue identity, cancelled/timed-out, and client stale-response tests. Add assertions only for an uncovered case, especially a valid-shaped evidence payload naming another actual clue.
- [x] Move evidence parsing/matching unchanged first, adding paragraph breaks between envelope guards, narrowed payload decoding, clue/unit matching, and outcomes. Document why shape validation alone does not establish evidence identity.
- [x] Keep runtime validation at both request/response boundaries and actual-rule matching in the client. Preserve 500-step limits, candidate mask bounds, placement consistency, budget outcomes, and no-silent-success failures.
- [x] Run `pnpm test:unit src/worker/protocol.test.ts src/worker/client.test.ts src/core/sudoku/hint.test.ts src/core/sudoku/variantTechniques.test.ts` and `pnpm typecheck`. Expected: malicious/mismatched evidence rejected and valid outcomes/stale cancellations unchanged.

### Task 6: Extract Session Persistence and Transition Ownership

**Interfaces:** `createSessionPersistence(runtime: Pick<GameRuntime, 'ownership' | 'repository' | 'createSaveQueue' | 'ownerId'>): SessionPersistence` owns attached session identity, lease token, queue, committed revision, dirty flag, and release lifetime. It exposes `attach(id, token, revision): void`, `capture(): PersistenceCheckpoint`, `markDirty(): void`, `save(snapshot: GameSession): Promise<StorageOutcome<SessionRecord>>`, `flush(): Promise<StorageOutcome<void>>`, `retry(snapshot: GameSession): Promise<StorageOutcome<void>>`, `release(): Promise<StorageOutcome<void>>`, `renew(): Promise<StorageOutcome<boolean>>`, and `reset(): void`. A checkpoint contains readonly `sessionId: string | null`, `token: OwnershipToken | null`, `revision: number`, and `dirty: boolean`.

`createSessionTransitions(runtime: GameRuntime, host: SessionTransitionHost, persistence: SessionPersistence): SessionTransitions` owns one operation-generation/cancellation authority. The host exposes the store's session/phase/readOnly/error refs plus three domain callbacks: `pause(): void`, `install(next, token, revision, paused): void`, and `retrySave(): Promise<void>`. It must not import `useGameStore`.

Transitions expose the existing prepare/restore/reload/start/resume/clear and catalogue/daily operations through named methods. Also expose `cancel(): void` and `beginOperation(): { signal: AbortSignal; isCurrent(): boolean }` so hints and game transitions share invalidation. `useGameStore` retains its existing returned player action names and their public argument/results; callers do not consume the internal factories.

- [x] Run `useGameStore.test.ts`, `asyncLifecycle.test.ts`, and `dailyStore.test.ts` unchanged as the starting contract. Review failures using the existing deterministic runtime doubles, not elapsed-time sleeps.
- [x] Extract persistence resources first. Preserve synchronous save snapshots, latest-write fencing, retained dirty state after failed flush, idempotent release, revision comparison before reacquisition, and exactly-once lease cleanup. Document where an `await` can outlive the attached session and guard its result accordingly.
- [x] Run `pnpm test:unit src/storage/saveQueue.test.ts src/features/game/stores/useGameStore.test.ts src/features/game/stores/asyncLifecycle.test.ts`. Expected: no public behavior changes before moving transitions.
- [x] Extract guarded transition coordination, including flush-before-generation/install, acquisition-before-read, transactional replacement, cancellation cleanup, explicit reload, and daily formal/replay handling. Keep store clock/input/completion/hint state local and route each of their actions through the same session model.
- [x] Rename ambiguous operation/save counters where they remain and annotate what each generation invalidates. Do not replace guards with a generic pending boolean or spread one transition across new independent stores.
- [x] Pin any missing contract with a focused factory or public store test: delayed lease acquisition after cancellation releases the acquired token exactly once; concurrent release calls share one flush/release; an old queued save cannot clear a new session's dirty state. Prefer existing public-action tests where they already prove these facts.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test:unit src/features/game/stores src/storage tooling/module-boundaries.test.ts`. Expected: failed switches retain old edits; unsaved completions retry once; peer revisions are never overwritten; reset/unmount/leave fence pending work; six formal daily identities remain independent.

### Task 7: Extract Page Entry and Lesson Exercise Workflows

**Interfaces:** `useGameEntry(options)` accepts readonly getters for `metadata`, `autoRestore`, `practiceVariant`, `practiceDifficulty`, plus `chooseDaily(): void`. It composes the existing game/runtime/router internally and returns reactive entry state (`ready`, `initializationError`, `queryVariant`, `active`, `nextVariant`, `difficulty`, `setupOpen`, `targetSession`, `targetLoading`, `replacementAvailable`) and named initialization/start/resume/new/retry/route-sync actions. Keep confirmation choice and board highlighting in the view.

`useDailyEntry()` owns current date, validated variant query, statuses/loading, selected variant/setup state, pending route initialization, and start/switch actions. `DailyView` retains overview/policy presentation and composes GameView.

`useLessonExercise(lesson: MaybeRefOrGetter<Lesson | undefined>, practice: MaybeRefOrGetter<boolean>)` returns selection/removals/feedback/correct/busy/explanation state, derived exercise cells/prompt/notes, and `answer(digit)`, `submitEliminations()`, `resetExercise()`. It owns lesson reset/loading and keyboard registration/disposal. `GameSettingsDialog` is controlled by typed `show`, `showTimer`, `highlightConflicts` props and update events, with slots for the existing mode policy.

- [x] Run existing delayed-initializer tests in `asyncLifecycle.test.ts` and game/lesson keyboard tests before extraction. Record observable state and route behavior rather than testing private watcher placement.
- [x] Move the game entry flow, preserving transient `start=1` intent, explicit saved-session links, invalid query feedback, target lookup generation, and route synchronization that does not reload the active game. Invalidate every owned lookup on disposal.
- [x] Move daily entry with its date timer and cleanup; retain yesterday's stored session and explicit challenge selection. Keep display-local rules/settings modal state outside the data-loading composable.
- [x] Extract the controlled settings modal, preserving labels, policy content, focus restoration, and preference actions. Keep setup and destructive confirmations as existing Naive UI components.
- [x] Move the complete lesson exercise flow. Give asynchronous answers an owner generation so changing lesson, entering practice, or unmounting does not publish stale feedback. Keep the learning store's durable completion ownership and dataset fencing. Preserve board navigation while a correct-answer write is pending.
- [x] Add `does not publish a delayed answer into another lesson` and `yields digit input while full-board practice owns the route` if absent. Use deferred promises and player-visible feedback/state assertions; retain existing wrong-answer retry and post-save focus regressions.
- [x] Run `pnpm test:unit src/features/game/stores/asyncLifecycle.test.ts src/features/game/composables src/features/learning` and `pnpm typecheck`. After building, run one Playwright process for `game.spec.ts daily.spec.ts play-layout.spec.ts learning.spec.ts learning-navigation.spec.ts dialogs.spec.ts` on `desktop`, `mobile`, and `webkit`. Expected: preserved start/resume/pause, one-row touch controls, physical keys, modal focus, and lesson feedback/navigation.

### Task 8: Apply Readability Rules and Verify the Whole Refactor

**Interfaces:** No new runtime interface. Produce `docs/variant-extension.md` with actual registration locations and update `docs/architecture.md` to describe the implemented ownership. Maintain an explicit task-completion record with commands and results in this plan.

- [x] Review every production `.ts`/`.vue` area, remaining tests, and tooling for logical stage breaks, grouped imports/contracts, individual declarations, nested outcome selection, ambiguous names, and missing invariant explanations. Change cohesive code in place; do not split home/records/course/CSS/fixture files by length alone.
- [x] Add or repair comments at algorithm budget, bit-mask, seeded identity, safe transform, evidence premise, assistance, lease/revision, stored history, and resource-lifetime boundaries where the rationale is not evident from names/types. Keep existing accurate comments and remove stale or redundant narration.
- [x] Add the extension checklist for a rule using existing primitives and a genuinely new primitive. Cover rule shape/registry, generation/version/fallbacks, presentation/accessibility, teaching, evidence validation, independent domain fixtures, daily/save/record integration, and browser/build checks. Explain that registration alone cannot implement new solver semantics.
- [x] Update architecture ownership and dependency examples. Cross-check new engine imports, internal store factories, composable disposal, public worker contracts, and presentation completeness. No empty directories/barrels or new dependency exceptions.
- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, and `pnpm build:subpath`. Expected: all commands pass, all frozen generation outputs remain identical, and current root/subpath worker assets build.
- [x] Run `pnpm exec playwright test --project desktop --project mobile --project webkit` in one process for the complete configured suite. Check the configured Firefox host with a worker smoke test separately; run its suite if available, otherwise report the actual host launch failure. Do not call emulation physical-device verification.
- [x] Inspect the final diff for API changes, unchecked assertions, copied callback-heavy contexts, unexplained branches, changed seeds/puzzle fixtures, weakened boundary validation, UI/layout drift, or modified record versions. Review readability against AGENTS.md as a separate acceptance criterion from green tests.
- [x] Record completion/limitations and leave changes uncommitted for the user's review. Commit only if the user subsequently asks.

## Plan Self-Review

- Every approved scope item has an owner: historical compatibility (1), engine definitions (2), generation (3), presentation (4), worker evidence (5), persistence/transitions (6), entry/exercise/settings (7), and repository-wide readability/documentation/final verification (8).
- New factories are internal, the public game/worker/rule entry points stay recognizable, and dependencies preserve current lint rules. Definitions do not import the registry that composes them.
- Frozen historical outputs supplement independent correctness facts. Existing lifecycle/ownership/storage tests are reused rather than replaced with implementation-level assertions.
- The five review-focus failure classes are assigned explicit checks. No task permits silently changing generation versions, discarding failed writes, relaxing runtime validation, or hiding environment failures.
- No new package, backend, variant, layout change, automatic commit, worktree, or wholesale CSS split is included.

## Execution Record

Tasks 1–8 are implemented in the current checkout on `main`, based on `aba296f`. No changes are staged or committed.

| Task | Completion evidence                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Captured 36 complete historical outcomes before changing generation; 67 compatibility and independent-generation tests passed                                                                     |
| 2    | Rule registry contracts witnessed missing-module failures, then typecheck/lint and 122 topology, decoding, search, and boundary tests passed                                                      |
| 3    | Capability contract witnessed missing-registry failure; 80 transformation/generation/template tests passed, including all frozen cases                                                            |
| 4    | Presentation/adapter contracts failed on absent exports, then 28 catalogue, geometry, board, lesson, daily, and records tests passed                                                              |
| 5    | Reused existing evidence-shape and actual-clue identity contracts; 27 worker/client/hint tests passed                                                                                             |
| 6    | 136 store/storage/ownership/boundary tests passed. Added deterministic lease cancellation, idempotent release, stale save, queued-save feedback, and exactly-once replacement cleanup regressions |
| 7    | 41 entry/lifecycle/learning tests passed. Delayed feedback into another lesson was reproduced and fixed; game/lesson keyboard and browser focus contracts passed                                  |
| 8    | Completed readability review, invariant comments, lint enforcement, actual architecture/extension documentation, final checks, and independent review                                             |

The fresh reviewer inspected the whole working-tree diff and new files. It independently replayed all 36 historical cases from the original engine via `git show`; every full result matched. One Important cleanup-cancellation race was reproduced with three public-store tests: failed acquisition, denied acquisition, and failed replacement. Each failed before the fix and passed after post-cleanup generation checks. No Critical or actionable Minor code findings remained.

### Final commands and results

| Command                                                                                                                                                                             | Result                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                                                                                    | Passed for app, worker, tooling, and browser-test configurations                                                           |
| `pnpm lint`                                                                                                                                                                         | Passed, including module boundaries, mandatory braces, and individual declarations                                         |
| `pnpm format:check`                                                                                                                                                                 | Passed                                                                                                                     |
| `pnpm test:unit`                                                                                                                                                                    | 398 tests passed in 44 files after the review fix; existing jsdom scroll notices remain                                    |
| `pnpm build`                                                                                                                                                                        | Passed with real worker assets; existing bundle-size warning remains                                                       |
| `pnpm build:subpath`                                                                                                                                                                | Passed for `/sudoku/` with real worker assets                                                                              |
| `pnpm exec playwright test --project desktop --project mobile --project webkit`                                                                                                     | First complete run: 262 passed, 2 device-specific skips. Final-build repeat: 259 passed, 3 WebKit timing failures, 2 skips |
| `pnpm exec playwright test tests/e2e/game.spec.ts tests/e2e/storage.spec.ts --project webkit --workers 1 --grep 'generates a real (easy\|medium) puzzle\|confirms explicit reload'` | All 3 affected cases passed with unchanged assertions and timeout settings                                                 |
| `pnpm exec playwright test tests/e2e/worker.spec.ts --project firefox --grep 'fixed production-worker seeds' --max-failures 1`                                                      | Host launch failed before opening a page: `browserType.launch: spawn UNKNOWN`                                              |

The final WebKit repeat had two generation timeouts and a conflict-test interaction waiting on a board already disabled by periodic-save conflict detection. Serial reproduction passed all three; parallel timing stability is not established. Firefox compatibility remains unverified. Available mobile projects are emulation, not physical-device certification. These limitations are reported separately from successful domain and static checks; the combined `pnpm check` is not claimed green.

### Recorded implementation decisions

- Use native Windows commands for the execution ledger instead of POSIX-only skill scripts. This changes bookkeeping, with no runtime behavior cost.
- Reuse existing behavioral contracts for mechanical extraction and whitespace. Add failing tests for new contracts and uncovered behavior instead of manufacturing cosmetic failures; missed coverage remains a review risk.
- Add `activateClock` and `dropSession` domain callbacks to the internal transition host. This preserves store-owned clock/reset lifetime; the cost is keeping these two internal callbacks aligned with the store.
- Review the uncommitted tree plus an explicit new-file inventory against `aba296f`, rather than a `HEAD..HEAD` commit range. This preserves the user's commit choice; omitted working-tree files would weaken the review, so the reviewer explicitly inspected the inventory.
- The reviewer does not certify rendering or browser hosts. The executor performs configured browser verification and reports its limits; physical-device behavior and the unavailable Firefox host remain outside demonstrated coverage.
- Accept the verified refactor with recorded WebKit timing sensitivity after unchanged serial checks pass. This does not relax product timeouts or lease rules; the cost is intermittent parallel browser-test failure, which remains a follow-up verification concern.

### Browser service ownership follow-up

The user's follow-up removes the generic `src/infrastructure/` directory. Application service composition and injection now live in `src/runtime.ts`; editing leases and their tests live in `src/storage/ownership.ts` and `src/storage/ownership.test.ts`. `storage/database.ts` owns the shared database-provider type, avoiding a dependency cycle between ownership coordination and repository transactions. Existing service contracts, disposal order, database schema, lease fencing, and player behavior are preserved.

AGENTS.md, README, the design, and architecture ownership now reflect these locations. ESLint and 85 dependency-boundary tests enforce that shared presentation, storage, and workers cannot import the runtime, while the runtime cannot import feature stores or application presentation. Type checking, lint, formatting, root and subpath production builds, and all 408 unit tests passed after the move.

The earlier Firefox host limitation was resolved by using the ignored repository-local Playwright browser cache documented in README. Its complete Firefox suite passed 88 tests, and the production-worker smoke passed across all four configured projects. The original global installation remains in place; the underlying Windows directory-related launch failure is not attributed to application code.

The ownership move's targeted browser run covered six game, lesson, and storage cases across all four projects: 23 passed, and the WebKit conflict-reload case timed out. Its retained trace shows periodic conflict detection disabling the digit button before the test's click, matching the previously recorded timing race. An isolated rerun passed with unchanged code, assertions, and timeouts. This confirms the targeted flows while retaining the existing timing-stability limitation; no fully green combined suite is claimed.
