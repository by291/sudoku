# Repository Guidelines

These instructions apply to the entire repository.

## Language and project context

- Write repository documentation in English, including README files, design documents, implementation plans, and this file.
- Use English for identifiers, code comments, docstrings, and test descriptions.
- Write player-facing interface copy in Chinese, as specified in the product design.
- The selected stack uses a reusable synchronous Rust core, a separate wasm-bindgen adapter, Vue 3, TypeScript, Vite, Vue Router, Pinia, Naive UI for common controls, Web Workers, IndexedDB with idb, and native CSS. Use pnpm, ESLint, Prettier, Vitest, and Playwright for tooling.
- Read the applicable design document in `docs/superpowers/specs/` before changing product behavior.
- Read [Web Architecture](docs/architecture.md) before moving modules or changing their dependencies.

## Learn and follow the stack's conventions

Before implementing or materially changing code in an area, review the relevant official documentation and the repository's existing conventions. Apply the idioms of the technology being used; do not transfer assumptions from another framework without checking them.

- Check the installed dependency version before using an API or following a version-specific example.
- Prefer official documentation and maintained first-party examples to older tutorials or copied snippets.
- Resolve conflicts between older style-guide examples and current Vue 3 documentation in favor of guidance applicable to the installed version.
- Reuse guidance already reviewed during the same task; revisit it when the version, API, or area of work changes.
- When a convention is important to the implementation, make it visible through types, module boundaries, lint rules, or a short explanatory comment.

Primary references:

- [Vue Style Guide](https://vuejs.org/style-guide/)
- [Vue Composition API with TypeScript](https://vuejs.org/guide/typescript/composition-api.html)
- [Vue composables](https://vuejs.org/guide/reusability/composables.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript strict configuration](https://www.typescriptlang.org/tsconfig/strict.html)
- [Vite Guide](https://vite.dev/guide/)
- [Vue Router Guide](https://router.vuejs.org/guide/)
- [Pinia core concepts](https://pinia.vuejs.org/core-concepts/)
- [Naive UI documentation](https://www.naiveui.com/) and [first-party source and examples](https://github.com/tusen-ai/naive-ui)
- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [idb documentation](https://github.com/jakearchibald/idb)
- [Vitest Guide](https://vitest.dev/guide/)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [eslint-plugin-vue](https://eslint.vuejs.org/)
- [typescript-eslint](https://typescript-eslint.io/)
- [ESLint control-flow braces](https://eslint.org/docs/latest/rules/curly) and [individual declarations](https://eslint.org/docs/latest/rules/one-var)
- [Prettier configuration](https://prettier.io/docs/configuration)
- [Rust Style Guide](https://doc.rust-lang.org/style-guide/)
- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/), especially type safety, documentation, and private state invariants
- [Rustdoc](https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html) and [Clippy](https://doc.rust-lang.org/clippy/usage.html)

## Readability comes first

- Prefer straightforward control flow and explicit data flow to clever shortcuts.
- Use descriptive domain names. Avoid unexplained abbreviations, unrelated responsibilities in one function, and deeply nested branches.
- Keep functions and components focused on a coherent responsibility. Extract a unit when it improves understanding or reuse, rather than enforcing an arbitrary line count or splitting every small operation into its own file.
- Keep complete workflows under their feature. Place route views in `views/`, business components in `components/`, and logic in the applicable `model/`, `stores/`, or `composables/` directory; omit unused directories and colocate tests.
- Keep browser services under explicit owners: persistence and editing leases in `storage/`, computation in `worker/`, and application service composition in `src/runtime.ts`. Do not introduce an `infrastructure/` directory as a generic container.
- Keep compact summary queries in `storage/readRepository.ts`, coverage metadata in `summaryCoverage.ts`, legacy repair in `summaryMaintenance.ts`, and projection aggregation in `summaryStatistics.ts`. Records browsing and backup work belong to `recordsReader.ts` and `recordsBackup.ts` behind the public records coordinator; daily status reads belong to `useDailyStatuses`.
- Use `@/` for source imports. Keep worker asset URLs literal and relative, and allow relative imports for test fixtures outside `src/`.
- Keep templates easy to scan. Move substantial calculations and branching into named functions or computed values.
- Name domain constants instead of repeating magic values. Document the meaning of bit masks, seeded generation, timing rules, and other non-obvious invariants.
- Comments should explain reasoning, constraints, and trade-offs. Do not narrate obvious statements or leave misleading comments after a change.
- Handle errors explicitly. Do not hide failures with empty catch blocks or return success-shaped defaults after an operation fails.
- Introduce abstractions only when they clarify a current responsibility or remove meaningful duplication.

### Logical sections and whitespace

- Use one blank line to separate imports from declarations, adjacent function declarations, and distinct responsibilities in a component or module. Keep related declarations together.
- Within a function, separate meaningful stages with a blank line: input guards, preparation, computation, side effects, and the returned result. A reader should be able to identify these stages without tracing every statement. Do not add a blank line after every statement or inside a tightly related calculation.
- Declare each variable separately instead of comma-separated declarations. Keep a value and its immediate validation together, then separate the next operation.
- Keep each reactive workflow together: its local state, derived state, actions, and lifecycle effects. Do not scatter its watchers and cleanup across unrelated sections merely to group every `ref` or every `watch` together.
- Keep the existing single-file component order: `<script setup lang="ts">`, `<template>`, then scoped `<style>`. Use whitespace between major template regions when it clarifies the page hierarchy.
- Prettier handles mechanical formatting; it does not decide where business logic needs a paragraph break. Review logical grouping as well as running the formatter.

### Necessary comments

- Add a short English comment where correctness depends on an invariant that names and types cannot adequately express. Examples include operation generations, ownership and revision fencing, save-before-switch ordering, immutable snapshots across `await`, seeded random-call ordering, work budgets, and permitted rule transformations.
- Explain why a guard, ordering constraint, or unusual operation exists and what would break if it were removed. Place the comment immediately above the relevant code, rather than documenting a distant caller's implementation.
- Use concise JSDoc for exported contracts whose semantics are not obvious: mutation, resource ownership and disposal, incomplete outcomes, preconditions, and units of measurement. Do not require JSDoc for every function or duplicate parameter and return types already expressed in TypeScript.
- Add a brief responsibility comment at a complex module boundary when its ownership would otherwise be unclear. Prefer focused functions and descriptive names to large banner comments or numbered narration of obvious steps.
- When moving code, move or update its explanatory comments and remove stale ones. Document library workarounds with the affected behavior and installed version when the version matters.

### Control flow and responsibility boundaries

- Prefer named domain predicates and explicit branches to nested ternaries or long expressions that select unrelated outcomes. Simple two-way value selection may remain a ternary.
- Use braces for branching and loops in new or rewritten workflow code, including early-return guards. Short callbacks can remain expressions. Avoid several levels of indentation; extract a meaningful operation when its inputs and result are clear.
- Views should compose a workflow, render its state, and handle presentation-local decisions. Move route initialization, asynchronous loading, and a complete exercise workflow into a feature composable when they obscure that purpose.
- Keep a store's public actions aligned with player operations. Extract resource management or an independent persistence/transition responsibility behind a narrow typed contract; do not split one transaction across loosely coordinated stores.
- Extract pure transformations and validation into ordinary functions. Use a composable for reactive state or lifecycle effects, not as a naming convention for every helper.
- Pure feature models, including nested model directories and records models, must stay independent of Vue, browser services and application state. Import persisted types explicitly with `import type` from `storage/readModels` or `storage/records`; those exceptions do not permit runtime imports or arbitrary storage dependencies.
- Assess excessive responsibility by reasons to change, coupled state, and dependencies, not total line count. A component with substantial cohesive CSS or static teaching data does not require splitting solely because it is long.
- Do not hide dependency cycles with barrel exports, move business rules into generic `utils`, or introduce callback-heavy context objects just to make a file shorter. Keep dependencies explicit and preserve the enforced direction.

### Variant extension contracts

- Keep each variant's data shape explicit in the Rust rule enum and generated `PuzzleRules` discriminated union. Keep runtime validation of rules, generated puzzles, worker messages, and saved records.
- Use typed, statically assembled definition maps for common dispatch. Validate map completeness with `satisfies` or an equivalent mapped type; keep exhaustive narrowing at dispatch boundaries instead of unchecked casts or fallthrough to an unrelated variant.
- Keep pure engine definitions independent of presentation, Vue, storage, and workers. Player-facing names, rule text, and clue rendering belong to presentation definitions, with compile-time coverage of every supported variant.
- Compile variant rules into the shared rule model where possible. Distinguish full nine-digit units, duplicate-exclusion peers, related-cell highlights, and arithmetic/path constraints; these concepts are not interchangeable.
- State generation capabilities explicitly, including permitted transformations, fallback requirements, version/seed identity, and difficulty policy. Preserve existing random-call ordering and identity contracts during a refactor.
- A new variant using existing constraint primitives should add a focused implementation and registration, rather than new branches throughout the application. A genuinely new primitive must also implement and test candidate support, conflicts, completion, deductions/evidence, boundary validation, and accessible drawing.
- Never replace type safety or validation with a general-purpose plugin framework. Maintain an English extension checklist with the actual required registration, fixtures, and verification steps.

## TypeScript

- Enable strict type checking.
- Define clear types for domain data, public function contracts, worker messages, and persisted records; allow inference for obvious local values.
- Use discriminated unions where states or outcomes have different meanings, such as completed, cancelled, failed, and budget-exhausted worker results.
- Treat external and persisted data as untrusted at runtime. Validate and narrow it before using it as domain data.
- Prefer `unknown` and narrowing to `any`. Avoid unchecked casts, double assertions, non-null assertions, and diagnostic suppressions used merely to silence errors.
- Keep the Sudoku engine independent of Vue, Pinia, browser APIs, and persistence so its rules can be understood and tested directly.

## Vue and Pinia

- Use Vue single-file components with `<script setup lang="ts">` and Composition API.
- Use PascalCase for component filenames, a `View` suffix for route views, camelCase for functions and variables, and descriptive `use...` names for composables and `use...Store` names for Pinia stores.
- Declare typed props and emits. Do not mutate props.
- Use computed values for derived state; reserve watchers for necessary side effects.
- Keep temporary component-local state local. Put shared session state in Pinia, with named actions for meaningful game operations.
- Route keyboard input, touch input, and hint application through the same session actions.
- Preserve reactivity when reading stores; use `storeToRefs` when destructuring reactive state or getters.
- Clean up event listeners, timers, subscriptions, and worker resources when their owning scope is disposed.
- Keep Sudoku rules out of templates and components. Keep database writes behind the persistence module.
- Keep root providers and resource lifetime in App, visual navigation in AppLayout, and shared components independent of features, storage, workers, and the application runtime. Follow the enforced dependency rules described in Web Architecture.
- Shared presentation must not import `idb` directly. Application startup presentation describes route/service readiness; lazy engine readiness remains owned by the computation services.

## Styles and interaction

- Use semantic HTML, accessible labels, visible keyboard focus, and usable touch targets.
- Use CSS Grid for the board and responsive layouts; use shared CSS variables for theme values.
- Scope component styles where appropriate and keep global styles limited to theme, reset, and application-wide rules.
- Use Naive UI for common controls and the shared CSS palette for theme overrides. Keep the Sudoku board specialized. Verify keyboard ownership, modal focus, and touch operation when integrating library components.
- Communicate errors, selection, and hints with more than color alone.

## Verification

- Use the configured ESLint rules and Prettier settings consistently. Do not disable checks to make a change pass.
- Type-check Vue and TypeScript with `vue-tsc`; a successful Vite build alone does not establish type correctness.
- Test observable behavior and domain invariants, not private implementation details.
- Separate test arrangement, action, and assertions with blank lines. Name meaningful fixture values and explain independent expected facts where the oracle is not obvious; avoid comments that simply label every line.
- For behavior-preserving refactors, use existing contract tests and add regressions only for uncovered invariants or new extension contracts. Review the public API, persistence format, worker protocol, seeded outputs, and player flows for accidental changes.
- Use fixed seeds and explicit fixtures for algorithm tests. Validate hint conclusions against known facts rather than asking the implementation under test to confirm itself.
- Use player-oriented Playwright locators and assertions for keyboard input, touch controls, pauses, persistence, lessons, and completion.
- Run the relevant checks for the change. Documentation-only edits require content and formatting review, not unrelated application test runs.

## Sudoku core organization

### Rust readability and public contracts

- Use rustfmt for mechanical layout and review logical paragraph breaks separately. Separate adjacent functions and distinct validation, preparation, computation, mutation, and result-construction stages with one blank line; keep a tightly related calculation together.
- Group fields that become present or absent together into one optional record. Use enums for mutually exclusive outcomes and meaningful modes; do not make callers reconstruct an outcome from correlated booleans or a misleading success-named variant.
- Keep a variable's domain meaning stable. Distinguish digits, cell indices, masks, and counters through checked types or explicit private structures when the same underlying integer could mean different things.
- Keep orchestration with its domain owner and extract coherent private operations. Judge a split by coupled state, dependencies, and reasons to change, not a function/file line limit. Simple transformations may use iterators; search and accounting workflows should remain straightforward to trace.
- Prefer private or `pub(crate)` implementation details. Public fields are appropriate for passive data; a workspace that maintains coupled board, candidate, premise, or cache invariants needs read-only access and explicit validated mutation/construction operations. Review native callers before tightening an existing public API.
- Rustdoc must explain non-obvious ownership, borrowing, mutation, preconditions, identity comparisons, units, cancellation lifetime, and incomplete outcomes. Document relevant `Errors` and `Panics`; link closely related contracts instead of repeating them on every accessor.
- Internal assertions must follow an established invariant. Untrusted values require fallible validation before mutation; an error must not leave a partially applied action. A structurally checked deduction is not automatically a mathematical proof.
- Name version-owned exploration limits and explain deterministic ordering, budget charges, abandoned work, queue priority, and restoration beside the relevant operation. Preserve explanatory comments when moving code and remove misleading copied documentation.
- Keep platform conversions explicit and exhaustive. Derive collection completeness from the owning catalogue instead of duplicating its count. Preserve boundary validation order and owned outputs; do not move ABI workarounds into the portable core.
- Preserve independent proof validators and sealed fixtures. Public-boundary regressions should exercise malformed input and observable atomicity; private helper extraction and formatting alone do not require new tests.

### Computation and compatibility boundaries

- Keep reusable computation in `sudoku/core`, typed browser conversion in `sudoku/wasm`, and browser ownership/dispatch in `src/sudoku` and `src/worker`. Core must not depend on Vue, JS/WASM bindings, browser APIs, storage, clocks, OS entropy or an async runtime.
- Import native contracts from their explicit owner (`types.rs` or subsystem `types.rs`); import frontend DTO contracts from `src/sudoku/contracts.ts`. Do not reintroduce a production TypeScript solver or a facade hiding dependency cycles.
- Keep rule definitions under `rules/definitions/`, arithmetic support in `constraints/`, exact counting in `search/`, human deductions/evidence in `logic/`, assessment in `rating/` and geometry/frontier/scheduling in `generation/`. Lower layers must not import generation. Keep Chinese technique/violation presentation in game models.
- Use checked board/digit/cell/mask values and forbid unsafe application code. Keep immutable prepared layout data separate from mutable workspaces and owned returned evidence. Document borrowing, mutation, incomplete outcomes and units. Read-only TypeScript types do not establish runtime ownership.
- Seeds contain exactly 32 bytes. New metadata uses strict lowercase 64-character hex and v11 identities. Do not add legacy string-generator adapters. Preserve historical saved text in JS and send only mathematical content to Rust.
- Preserve random-call order, work charges, failed/abandoned work, finite limits, exact-search restoration and rating-prefix semantics. Do not lower allowances to pass performance tests. Measure hard arithmetic and near-exhaustion cases before choosing synchronous UI dispatch.
- Run rustfmt, native tests, native/all-targets and wasm32 Clippy with warnings denied; inspect the normal core dependency tree. Rebuild generated WASM before type checking or testing frontend consumers. Do not edit generated bindings.
- The sealed TypeScript engine exists only under `tests/reference` as an independent oracle. Test callers use `@reference`; normal builds cannot resolve it. Never update expected outputs from Rust, and identify equality-based reuse of independent evidence explicitly.
