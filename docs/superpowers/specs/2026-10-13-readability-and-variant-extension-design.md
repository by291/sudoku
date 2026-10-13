# Readability and Variant Extension Refactor

Date: 2026-10-13

Status: Approved by the user on 2026-10-13. Implementation planning follows this design. Approval does not authorize a commit.

## Intent

The user accepts the overall architecture but wants clearer responsibilities, readable implementation, and easier integration of additional Sudoku variants. The two explicit readability requirements are blank lines between logical stages and necessary explanatory comments. Update `AGENTS.md` in English, then apply those conventions to existing code.

The application has Classic plus five variants: Diagonal, Jigsaw, Killer, Thermo, and Arrow. Retain the selected stack, current page layouts and Chinese copy, six independent daily puzzles, persistence compatibility, and the existing application/feature/engine boundaries. Work in the current checkout and branch. Commit only on a subsequent explicit request.

## Evidence from the current code

The audit used the committed `aba296f` checkout and installed package versions. File length is a review signal, not a splitting rule.

| Area                                                                   | Current responsibilities                                                                                                                                                               | Recommended action                                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `features/game/stores/useGameStore.ts` (847 lines)                     | Reactive session state, clock, moves/completion, hints, worker cancellation, leases, revision fencing, ordered saves, restoration/replacement, and daily eligibility                   | Separate persistence/resource ownership and session transition workflows; retain one public game store                               |
| `features/game/views/GameView.vue` (765 lines, about 358 script lines) | Route interpretation, initialization/restoration, target-save lookup, setup and replacement decisions, confirmation state, settings, hint highlights, board controls, and presentation | Extract cohesive entry/route coordination and presentation components for settings/session feedback where they improve comprehension |
| `core/sudoku/rules.ts` (220 lines)                                     | All rule data types, every variant decoder, topology helpers, unit compilation, relationships, and full-clue satisfaction                                                              | Separate shared rule contracts/topology from per-variant decoding and compilation                                                    |
| `core/sudoku/variantGeneration.ts` (338 lines)                         | Spatial and digit transformations, five geometry generators, seeded strategy selection, uniqueness/rating orchestration, and fallback verification                                     | Move per-variant geometry and permitted transformations into focused generation strategies; retain shared verification/orchestration |
| `worker/protocol.ts` (368 lines)                                       | Transport contracts and envelopes plus detailed logical-step decoding, evidence shape checks, and matching evidence to actual clues                                                    | Separate hint evidence decoding/validation from transport envelopes without weakening either check                                   |
| `features/learning/views/LessonView.vue`                               | Exercise state/reset, answer and elimination validation, completion persistence, keyboard ownership, board and lesson presentation                                                     | Encapsulate the exercise workflow in a feature composable while retaining one answer action for keyboard/touch                       |
| Other views, storage, workers, engine helpers, and tests               | Dense declarations and contiguous logical stages; some important async and algorithm invariants are undocumented                                                                       | Apply the readability rules and remove ambiguous naming/redundant conditions where behavior can be preserved                         |

`LearningView.vue` has 538 lines but only about 85 script lines and 325 style lines. `RecordsView.vue` similarly has a short script and substantial presentation. These do not justify replacing the existing feature organization with many small files. Keep cohesive styles and static authored puzzle/lesson data together.

## Approaches considered

1. **Focused responsibility extraction plus typed static definitions — recommended.** Preserve the existing workflow and compiled constraint model, separate stateful responsibilities where ownership is clear, and provide complete engine/presentation definition maps. This improves readability and makes the extension points explicit without creating a runtime plugin system.
2. **Formatting and comments only.** Lowest structural risk, but the store and page remain hard to reason about and new variants still require editing several central branching functions. Use this treatment for already cohesive modules, not as the entire solution.
3. **A separate engine/game/store per variant or a universal plugin framework.** Either duplicates application behavior or obscures it behind dynamic registration and generic hooks. Neither is justified by five existing variants on one board size.

## Readability policy

Use the expanded `AGENTS.md` as the normative checklist. The changes derive technology idioms from current official documentation; paragraph breaks and required invariant comments are explicit repository rules rather than claims that Vue imposes them.

- Separate meaningful stages and sibling functions with one blank line, keeping tightly related declarations/calculations together.
- Declare variables individually; use descriptive operation/ownership/revision names rather than ambiguous counters.
- Replace nested state-selection ternaries and compressed workflow branching with named predicates and explicit branches. Use braces in rewritten branching/loop code.
- Keep each reactive concern's state, derived values, actions, and effects discoverable together.
- Comment correctness constraints: stale response fencing after `await`, lease acquisition before reading a save, flush-before-switch, failure retention, assistance monotonicity, budget exhaustion, clue semantics, and transformation legality.
- Document the narrow public contracts and resource lifetimes that are not evident from types. Avoid routine narration or mandatory comments on every function.
- Review production source and test readability; do not apply a blind rewrite that modifies Vue templates, puzzle fixtures, seeds, or UI behavior merely to achieve a numeric style score.

Prettier preserves intentional paragraph breaks but does not invent business grouping. Logical grouping and comment relevance therefore require review. Do not add a deprecated ESLint formatting rule or a new formatting dependency solely for this refactor.

## Browser service ownership

The user's follow-up on 2026-10-13 removes the generic `infrastructure/` directory. Keep application service composition and injection in `src/runtime.ts`. Move the editing-lease coordinator and its colocated tests to `src/storage/ownership.ts` and `src/storage/ownership.test.ts`, alongside the transactions it fences. Keep worker modules in `src/worker/`.

Preserve the injected runtime contract, transactional lease behavior, resource disposal, and existing player flows. Both storage owners share the connection-provider type from `storage/database.ts`, avoiding a repository/coordinator dependency cycle. Enforce runtime isolation from feature UI/stores, and prevent shared presentation, storage, and workers from importing the application runtime. Update current documentation and `AGENTS.md` to retain these explicit owners.

## Game workflow boundaries

Retain `useGameStore` and its player-oriented public actions so components, keyboard controls, lifecycle adapters, and existing tests have one session owner.

Create focused internal modules beside the game store for persistence and session transitions. Persistence owns the lease token, save queue, committed revision, dirty state, and release/retry lifecycle. Transitions coordinate save-before-switch, restoration, generated-puzzle installation, replacement transactions, and daily start/resume decisions. The store owns observable session/phase state and routes input, clock, completion, and hint actions through the same domain model.

Use narrow typed inputs/results and explicit state ownership. An internal module must not import the store that composes it. Keep the operation generation and cancellation authority coordinated across all async paths; avoid splitting a transaction between new independent Pinia stores or copying stale guards into unrelated services.

Move the game's route/entry workflow to a feature composable. It owns initialization generations, disposal, validated route intent, save lookup, route synchronization, and start/resume requests. The view continues composing the board, controls, and hint presentation. Keep settings and confirmations presentation-local, extracting a component only when its contract remains understandable without a large context object.

For learning, extract the complete exercise workflow rather than separate helpers for each `ref`. Preserve lesson reset behavior, asynchronous completion saving, retry feedback, board focus, shared keyboard ownership, and yielding to full-board practice.

## Variant definition boundaries

The existing `RuleContext` is the common engine contract. Preserve its distinctions:

- Full units contain all nine digits exactly once.
- Duplicate peers prove where a digit cannot repeat and drive note cleanup.
- Related cells describe useful highlights; they do not imply all-different behavior.
- Arithmetic/path constraints express cage sums, increasing paths, and arrow sums.

Separate rule data types and shared topology helpers from the individual definitions. Each variant definition owns decoding its raw rule payload and compiling its units, constraints, and duplicate groups. Assemble them statically in a typed registry whose keys cover `SudokuVariant` and whose outputs retain the corresponding `PuzzleRules` discriminator.

Keep type correlation explicit. Use exhaustive narrowing in a central dispatcher where TypeScript cannot preserve a discriminated map lookup; do not force a heterogeneous union of functions through `any`, a double assertion, or an unchecked cast. A small checked dispatch boundary is acceptable and clearer than hiding a type mismatch.

Generation uses a separate typed strategy map in the engine. Each variant strategy owns geometry construction and its legal spatial/digit transformations. The shared generator continues to own budgets, seeded selection, givens reduction, uniqueness, logical rating, necessity checks, and fallback validation. Preserve the order and number of random calls for existing versioned generation paths, including Classic's original transformation stream.

Names, rule summaries, and options use one complete presentation catalogue in the game model; derive options rather than manually maintaining a second list. Shared board presentation keeps a complete typed adapter map for clue geometry and accessible descriptions. Presentation adapters may consume pure rule types/helpers, but engine definitions must never import presentation or features.

Do not place every subsystem's configuration in one registry. Authored learning content and fallback puzzles retain their existing owners and stable identifiers. Compile-time completeness checks and an extension checklist connect these owners without reversing dependencies.

## Extending a variant

The delivered extension guide must list the actual code locations and checks required:

1. Add the stable variant ID and explicit rule data shape.
2. Implement runtime decoding and compilation using existing primitives where applicable.
3. Add a generation strategy, allowed transformations, supported version, and verified fallback fixtures for every supported difficulty.
4. Add presentation metadata, clue geometry, accessible descriptions, and rule teaching content.
5. Confirm worker decoding, storage validation/migration, daily identity, save scoping, and record aggregation use the common contracts. Extend a boundary decoder only when introducing a new data/evidence shape.
6. Add independent rule, candidate/conflict/completion, hint-evidence, deterministic generation, and browser fixtures.

A variant expressible with existing units/cages/paths/sums should reuse the common solver and game workflow. A genuinely new constraint primitive requires candidate support, conflict and completion logic, explainable deductions, evidence validation, and accessible rendering. Registration alone cannot make an unsupported rule correct.

## Compatibility requirements

- Preserve Classic `sudoku-v1` and variant `sudoku-variants-v1` seed outputs and fallback behavior. Do not bump versions to conceal accidental changes.
- Preserve worker envelopes, cancellation, timeouts, stale-result rejection, bounded work, and exact clue/evidence matching.
- Preserve storage record formats, legacy Classic normalization, quarantine behavior, revision/lease/dataset fencing, and transactional replacement scoped by mode/type.
- Failed writes and cancelled transitions retain the old in-memory game. Confirmed reload remains the only replacement of conflicted unsaved edits.
- Preserve irreversible assistance, daily formal eligibility and restart timing, six independent daily statuses, and variant-specific record aggregation.
- Preserve keyboard/touch input, modal focus, pauses, notes, undo/redo, lesson progress, router behavior, and current responsive layout.

## Verification and delivery

After design approval, create an English implementation plan that identifies coherent tasks and their checks before product-code changes.

Establish existing unit/build checks as a baseline, then add contract coverage for typed definitions and independent variant facts where absent. Run relevant suites after each extraction. Before declaring the refactor complete, run type checking, ESLint, Prettier, the full unit suite, root/subpath builds, and browser regressions for games, variants, learning, saves/ownership, daily challenges, records, and keyboard/modal/touch behavior.

Keep browser projects in one Playwright process to avoid shared server/results conflicts. Report unavailable host projects separately from passing checks. Review the final diff for accidental changes to persisted data, authored puzzle content, random streams, UI copy, and layouts. Update `docs/architecture.md` to describe the actual resulting module ownership, and add the variant extension guide.

## References reviewed

Installed versions: Vue 3.5.43, TypeScript 6.0.3, Pinia 4.0.3, Vue Router 5.4.0, Naive UI 2.45.3, ESLint 10.12.0, Prettier 3.9.10, Vitest 5.0.3, and Playwright 1.64.0.

- [Vue recommended style rules](https://vuejs.org/style-guide/rules-recommended.html): consistent component organization and separation; use current Composition API documentation when older examples differ.
- [Vue composables](https://vuejs.org/guide/reusability/composables.html): encapsulating stateful workflows, ordinary functions for stateless logic, reactive inputs, and lifecycle cleanup.
- [Vue Composition API with TypeScript](https://vuejs.org/guide/typescript/composition-api.html): explicit component contracts, refs/computed values, and typed event handlers.
- [Pinia core concepts](https://pinia.vuejs.org/core-concepts/): setup-store state, derived state, actions, and preserving reactivity through `storeToRefs`.
- [TypeScript narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) and [object types](https://www.typescriptlang.org/docs/handbook/2/objects.html): discriminated contracts, exhaustive checks, and readonly inputs.
- [Prettier rationale](https://prettier.io/docs/rationale): intentional empty lines are preserved rather than generated from semantic analysis.
- [ESLint padding-line-between-statements](https://eslint.org/docs/latest/rules/padding-line-between-statements): the old core formatting rule is deprecated; do not introduce it as the readability solution.
