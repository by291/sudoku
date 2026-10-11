# Web Structure Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in the current session. Steps use checkbox syntax for tracking.

**Goal:** Apply the responsibility and workflow boundaries observed in `sctv-dl` to the Sudoku frontend, adapting them to its local engine and persistence.

**Architecture:** Keep application composition at the source root, separate the visual shell into a layout, and group feature views, components, models, stores, and composables under their owning workflow. Shared presentation must remain feature-independent. Retain the pure Sudoku engine and browser infrastructure as distinct layers.

**Tech Stack:** Vue 3.5.43, TypeScript 6.0.3, Vite 8.3.4, Vue Router 5.4.0, Pinia 4.0.3, Naive UI 2.45.3, idb 8.0.4, Vitest 5.0.3, Playwright 1.64.0.

**Spec:** `../specs/2026-10-11-sudoku-design.md`, especially section 9; the user's request is to learn from the reference project rather than copy it wholesale.

## Global Constraints

- Preserve Chinese UI copy, routes, saved-data formats, timing, worker cancellation, and editing ownership.
- Write documentation, identifiers, comments, and test descriptions in English.
- Continue on the current branch as previously authorized. Leave changes uncommitted until requested.
- Keep related workflows together; create responsibility directories only for code that exists.
- Keep tests beside their owners. Preserve the worker's literal relative `new URL` construction.
- Use `@/` for source imports, with matching Vite and TypeScript resolution. Test-fixture imports outside `src/` can remain relative.

## Review Focus

- Root and `/sudoku/` deployments must still load the application and real worker assets.
- Shared board/input/dialog components must not import feature stores or views.
- Extracting the layout must preserve theme synchronization, skip-link behavior, and modal focus.
- Moving runtime services must preserve one runtime instance and its disposal order.
- Existing saved sessions, preferences, lessons, and result records must remain readable.

## Target Ownership

| Location                                                           | Responsibility                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/main.ts`, `src/App.vue`                                       | Bootstrap, root providers, application resource lifetime                  |
| `src/layouts/AppLayout.vue`                                        | Header, theme choices, preference failure feedback, main landmark, footer |
| `src/router/index.ts`                                              | Existing hash routes and view composition                                 |
| `src/theme/`                                                       | Effective theme synchronization and Naive UI palette adapter              |
| `src/shared/components/`                                           | SudokuBoard, NumberPad, ConfirmationDialog                                |
| `src/features/home/views/`                                         | Resume entries and mode selection                                         |
| `src/features/game/{views,components,composables,model,stores}/`   | Free/daily/practice game workflow                                         |
| `src/features/learning/{views,model,stores}/`                      | Lesson content, exercises, progress                                       |
| `src/features/records/{views,model,stores}/`                       | History, statistics, local-data controls                                  |
| `src/features/settings/{model,stores}/`                            | Preference contract, defaults, persistence actions                        |
| `src/infrastructure/runtime.ts`                                    | Shared injected runtime and browser adapter construction                  |
| `src/storage/`, `src/worker/`                                      | Persistence and computation transport, promoted to source-root modules    |
| `src/core/sudoku/`, remaining `src/infrastructure/`, `src/styles/` | Existing engine, runtime/ownership, global palette and styles             |

## Task 1: Enforce and Migrate Module Ownership

**Files:** `tooling/module-boundaries.test.ts`, `eslint.config.js`, `vite.config.ts`, `tsconfig.json`, `index.html`, and moved source/test files listed above.

**Interfaces:** Existing game, repository, worker, and store exports retain their names and contracts. Route components use the `View` suffix. `gameRuntimeKey`, `useGameRuntime`, and `createGameRuntime` move together to infrastructure.

- [x] Extend boundary tests to exercise real ESLint rejection of shared-to-feature, feature-to-composition, core-to-UI, and view-to-database imports, plus valid cross-layer imports.
- [x] Run `pnpm test:unit tooling/module-boundaries.test.ts` and observe the new restrictions fail before implementation.
- [x] Relocate source files and colocated tests; update source/fixture imports and entry references. Keep the worker entry construction relative.
- [x] Configure matching `@/` aliases and dependency rules. Allow infrastructure to consume persisted feature models, while rejecting feature stores/views.
- [x] Run boundary tests and type checking; resolve every missing path and forbidden dependency.

## Task 2: Separate Application Providers and Layout

**Files:** `src/App.vue`, `src/App.test.ts`, `src/layouts/AppLayout.vue`, `src/theme/useTheme.ts`, `src/features/settings/model/preferences.ts`, and preference/storage imports.

**Interfaces:** AppLayout consumes typed `preference: ThemePreference` and emits `theme: [preference: ThemePreference]`. App owns effective theme and resource disposal. Preferences owns `ThemePreference`, `Settings`, and `DEFAULT_SETTINGS`; storage retains runtime validation.

- [x] Extract the existing shell and its scoped styles into AppLayout. Preserve the DOM, Chinese copy, Cancel focus, and skip-link action.
- [x] Move preference data contracts and defaults out of theme/storage implementation files. Preserve their exact values and validation behavior.
- [x] Run the existing App theme/lifecycle tests, storage tests, shared-board tests, and full unit suite.

## Task 3: Document and Verify the Complete Frontend

**Files:** `docs/architecture.md`, `README.md`, `AGENTS.md`, the design's ownership section, and this plan.

**Interfaces:** Architecture documentation is the current source of truth; the original completed implementation plan remains historical.

- [x] Document ownership and permitted dependency direction, including the shared Sudoku domain components and infrastructure/model relationship.
- [x] Update current path references and annotate historical planning paths.
- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, and `pnpm build`.
- [x] Run `pnpm exec playwright test --project desktop --project mobile --project webkit`, including root/subpath worker, persistence, themes, keyboard, lesson, and modal scenarios. Firefox remains pending because its installed runtime cannot launch on this Windows host.
- [x] Request a read-only review of the complete working-tree diff, address material findings, and run `git diff --check`.
