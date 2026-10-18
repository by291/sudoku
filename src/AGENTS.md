# Web Guidelines

These rules supplement the [repository guidelines](../AGENTS.md) for `src/`. The root guide also directs Web test and tooling work here. Read [Web architecture](../docs/architecture.md) before moving modules or changing dependencies.

## Ownership and dependencies

- Keep complete workflows under their feature: route views in `views/`, business components in `components/`, and logic in `model/`, `stores/` or `composables/`. Omit unused directories and colocate tests.
- Views compose and render a workflow. Extract route initialization, asynchronous loading or a complete exercise workflow into a feature composable when it obscures that purpose. Use ordinary functions for pure transformations; composables own reactive state or lifecycle effects.
- Keep public store actions aligned with player operations. Extract independent resource, persistence or transition responsibilities behind narrow typed contracts; do not split one transaction across loosely coordinated stores.
- `src/runtime.ts` composes application services. App owns root providers and resource lifetime; AppLayout owns visual navigation. Shared presentation must not import features, storage, workers, runtime or `idb` directly.
- `storage/` owns persistence and editing leases; `worker/` owns background computation and dispatch. Do not introduce a generic `infrastructure/` container or hide cycles behind barrels.
- Pure feature models, including nested model directories and records models, stay independent of Vue, browser services and application state. Persisted types may be imported explicitly with `import type` from `@/storage/readModels` or `@/storage/records`; this does not permit runtime imports or arbitrary storage dependencies.
- Use `@/` for source imports. Keep worker asset URLs literal and relative; tests may use relative paths to fixtures outside `src/`. Import frontend DTOs from `@/sudoku/contracts` and WASM through `@sudoku/wasm`, not generated filesystem paths.
- Keep summary queries in `storage/readRepository.ts`, coverage in `summaryCoverage.ts`, legacy repair in `summaryMaintenance.ts` and aggregation in `summaryStatistics.ts`. Records browsing/backup belong to `recordsReader.ts`/`recordsBackup.ts` behind the public coordinator; reactive daily reads belong to `useDailyStatuses`.

## TypeScript and boundary contracts

- Keep strict type checking and explicit types for domain data, public contracts, worker messages and persisted records. Infer obvious local types. Prefer `unknown` with narrowing to `any`, unchecked casts, double assertions, non-null assertions or diagnostic suppressions.
- Use discriminated unions for meaningfully different outcomes, including completed, cancelled, failed, unavailable and budget-exhausted results. Validate and narrow rules, generated puzzles, worker messages and persisted data at runtime.
- Use typed, statically assembled definition maps with `satisfies` or equivalent completeness checks. Keep exhaustive narrowing at dispatch boundaries; never fall through to an unrelated variant.
- Pure engine definitions stay independent of presentation, Vue, storage and workers. Chinese names, rule text, technique/violation explanations and clue rendering belong to presentation definitions with coverage for every variant.
- Preserve immutable snapshots across `await`, operation generations, ownership/revision/dataset fences and save-before-switch ordering. Read-only TypeScript types do not establish runtime ownership.
- Keep startup service readiness separate from lazy engine readiness. Summary browsing must not initialize WASM. Keep heavy computation in workers and measure hard arithmetic/near-exhaustion cases before moving work to synchronous UI dispatch.

## Vue and Pinia

- Use Composition API SFCs in this order: `<script setup lang="ts">`, `<template>`, scoped `<style>`. Name components in PascalCase, route views with a `View` suffix, functions/variables in camelCase, composables `use...` and stores `use...Store`.
- Declare typed props and emits; do not mutate props. Move substantial template calculations and branching into named functions or computed values. Separate major template regions when it clarifies hierarchy.
- Use computed values for derived state and watchers for necessary effects. Keep temporary state local; use Pinia for shared sessions and named player actions. Use `storeToRefs` when destructuring reactive store state/getters.
- Route keyboard, touch and hint application through the same session actions. Keep Sudoku rules out of components/templates and database writes behind storage.
- Dispose listeners, timers, subscriptions and workers with their owner. Keep each workflow's state, derived values, actions and lifecycle cleanup together.
- Use braces for branching and loops in new or rewritten workflow code, including early-return guards. Short expression callbacks and simple two-way ternaries are fine.

## Presentation and interaction

- Use Naive UI for common controls and shared CSS variables for theme overrides; keep the Sudoku board specialized. Use CSS Grid for board/responsive layouts, scoped component styles and narrowly scoped global reset/theme rules.
- Use semantic HTML, accessible labels, visible keyboard focus and usable touch targets. Errors, selection and hints need cues beyond color.
- Verify keyboard ownership, modal focus and touch behavior when integrating controls. Prefer player-oriented Playwright locators and assertions.

## Checks and references

Use the root verification table and [testing guide](../docs/testing.md). Add focused regressions for uncovered contracts or behavior changes; preserve API, persistence, worker protocol, seeded outputs and player flows during refactors. Keep independent expected facts separate from Rust-backed fixture construction.

For the affected API, consult current [Vue TypeScript guidance](https://vuejs.org/guide/typescript/composition-api.html), [composables](https://vuejs.org/guide/reusability/composables.html), [Pinia](https://pinia.vuejs.org/core-concepts/), [Naive UI source/examples](https://github.com/tusen-ai/naive-ui), or the owning library's official docs. Prefer current Vue 3 guidance over older style-guide examples. ESLint/Prettier configuration already owns mechanical rules; retain the root guide's logical paragraph breaks and explanatory comments.
