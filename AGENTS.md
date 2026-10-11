# Repository Guidelines

These instructions apply to the entire repository.

## Language and project context

- Write repository documentation in English, including README files, design documents, implementation plans, and this file.
- Use English for identifiers, code comments, docstrings, and test descriptions.
- Write player-facing interface copy in Chinese, as specified in the product design.
- The selected stack is Vue 3, TypeScript, Vite, Vue Router, Pinia, Web Workers, IndexedDB with idb, and native CSS. Use pnpm, ESLint, Prettier, Vitest, and Playwright for tooling.
- Read the applicable design document in `docs/superpowers/specs/` before changing product behavior.

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
- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [idb documentation](https://github.com/jakearchibald/idb)
- [Vitest Guide](https://vitest.dev/guide/)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [eslint-plugin-vue](https://eslint.vuejs.org/)
- [typescript-eslint](https://typescript-eslint.io/)
- [Prettier configuration](https://prettier.io/docs/configuration)

## Readability comes first

- Prefer straightforward control flow and explicit data flow to clever shortcuts.
- Use descriptive domain names. Avoid unexplained abbreviations, unrelated responsibilities in one function, and deeply nested branches.
- Keep functions and components focused on a coherent responsibility. Extract a unit when it improves understanding or reuse, rather than enforcing an arbitrary line count or splitting every small operation into its own file.
- Keep templates easy to scan. Move substantial calculations and branching into named functions or computed values.
- Name domain constants instead of repeating magic values. Document the meaning of bit masks, seeded generation, timing rules, and other non-obvious invariants.
- Comments should explain reasoning, constraints, and trade-offs. Do not narrate obvious statements or leave misleading comments after a change.
- Handle errors explicitly. Do not hide failures with empty catch blocks or return success-shaped defaults after an operation fails.
- Introduce abstractions only when they clarify a current responsibility or remove meaningful duplication.

## TypeScript

- Enable strict type checking.
- Define clear types for domain data, public function contracts, worker messages, and persisted records; allow inference for obvious local values.
- Use discriminated unions where states or outcomes have different meanings, such as completed, cancelled, failed, and budget-exhausted worker results.
- Treat external and persisted data as untrusted at runtime. Validate and narrow it before using it as domain data.
- Prefer `unknown` and narrowing to `any`. Avoid unchecked casts, double assertions, non-null assertions, and diagnostic suppressions used merely to silence errors.
- Keep the Sudoku engine independent of Vue, Pinia, browser APIs, and persistence so its rules can be understood and tested directly.

## Vue and Pinia

- Use Vue single-file components with `<script setup lang="ts">` and Composition API.
- Use PascalCase for component filenames, camelCase for functions and variables, and descriptive `use...` names for composables and `use...Store` names for Pinia stores.
- Declare typed props and emits. Do not mutate props.
- Use computed values for derived state; reserve watchers for necessary side effects.
- Keep temporary component-local state local. Put shared session state in Pinia, with named actions for meaningful game operations.
- Route keyboard input, touch input, and hint application through the same session actions.
- Preserve reactivity when reading stores; use `storeToRefs` when destructuring reactive state or getters.
- Clean up event listeners, timers, subscriptions, and worker resources when their owning scope is disposed.
- Keep Sudoku rules out of templates and components. Keep database writes behind the persistence module.

## Styles and interaction

- Use semantic HTML, accessible labels, visible keyboard focus, and usable touch targets.
- Use CSS Grid for the board and responsive layouts; use shared CSS variables for theme values.
- Scope component styles where appropriate and keep global styles limited to theme, reset, and application-wide rules.
- Communicate errors, selection, and hints with more than color alone.

## Verification

- Use the configured ESLint rules and Prettier settings consistently. Do not disable checks to make a change pass.
- Type-check Vue and TypeScript with `vue-tsc`; a successful Vite build alone does not establish type correctness.
- Test observable behavior and domain invariants, not private implementation details.
- Use fixed seeds and explicit fixtures for algorithm tests. Validate hint conclusions against known facts rather than asking the implementation under test to confirm itself.
- Use player-oriented Playwright locators and assertions for keyboard input, touch controls, pauses, persistence, lessons, and completion.
- Run the relevant checks for the change. Documentation-only edits require content and formatting review, not unrelated application test runs.
