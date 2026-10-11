# Web Architecture

The [product design](superpowers/specs/2026-10-11-sudoku-design.md) defines behavior, [AGENTS.md](../AGENTS.md) defines development conventions, and [README](../README.md) lists setup and verification commands. This document describes current module ownership.

## Organization

The frontend adopts the explicit application composition and cohesive feature organization reviewed in the local `sctv-dl` project. Sudoku retains its pure engine, computation workers, transactional persistence, and editing ownership as independent layers. Create responsibility directories only for code that exists; free play, daily challenges, and full-board practice stay in the game workflow.

```text
src/
  main.ts
  App.vue
  layouts/AppLayout.vue
  router/index.ts
  theme/useTheme.ts
  shared/components/
  features/
    home/views/
    game/{views,components,composables,model,stores}/
    learning/{views,model,stores}/
    records/{views,model,stores}/
    settings/{model,stores}/
  core/sudoku/
  storage/
  worker/
  infrastructure/
    runtime.ts
    ownership.ts
  styles/
```

| Owner                         | Responsibility                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `main.ts`                     | Install Pinia, hash router, and one injected runtime, then mount App                                                     |
| `App.vue`                     | Root Naive UI configuration, effective theme, preference loading, and resource disposal                                  |
| `layouts/AppLayout.vue`       | Header, theme choices, preference failures, skip link, main landmark, and footer                                         |
| `router/`                     | Existing routes and their views; static-host hash navigation                                                             |
| `theme/useTheme.ts`           | One composable for light/dark/system synchronization and Naive UI configuration from the shared CSS palette              |
| `shared/components/`          | Controlled SudokuBoard, NumberPad, and ConfirmationDialog; emit actions without choosing a store or persistence strategy |
| `features/home/views/`        | Resume links and workflow entry points                                                                                   |
| `features/game/views/`        | GameView for free play/full-board practice, DailyView for challenges                                                     |
| `features/game/components/`   | Session controls and logical hint presentation                                                                           |
| `features/game/composables/`  | Keyboard ownership, lifecycle listeners, save triggers, and route-leave behavior                                         |
| `features/game/model/`        | Pure session transitions, clock calculations, daily policy, and display helpers                                          |
| `features/game/stores/`       | Session actions, worker requests, ownership, and saves                                                                   |
| `features/learning/`          | Lesson models/examples, progress store, and lesson/list views; full-board practice composes GameView                     |
| `features/records/`           | Aggregation, records store, history view, and confirmed local-data controls                                              |
| `features/settings/`          | Pure preference types/defaults and the preferences store; no separate settings page is needed                            |
| `core/sudoku/`                | Framework-independent rules, search, logical deductions, generation, and types                                           |
| `infrastructure/runtime.ts`   | Construct and inject shared worker/repository/ownership/clock services                                                   |
| `worker/`                     | Validated messages, cancellation, budgets, and engine execution                                                          |
| `storage/`                    | Database schema, record validation, transactions, and ordered saves                                                      |
| `infrastructure/ownership.ts` | Editing leases and dataset-reset coordination                                                                            |
| `styles/`                     | CSS palette, reset, focus, reduced-motion rules, and shared presentation utilities                                       |

## Dependency Direction

- Application composition connects layouts, themes, features, storage, workers, and infrastructure. Business and browser-service modules never import App, main, router, layouts, or theme implementation.
- Shared components depend on Vue, Naive UI, shared components, and pure engine types/helpers. They never import features, storage, workers, or infrastructure. Shared means reusable across Sudoku workflows, not generic to every application.
- Views render store state and call actions; they never open the database or call the repository directly. Learning may compose the game view, and home may read game/records models and stores.
- Game, learning, and settings models remain pure and consume engine or other pure model exports. Records aggregation consumes game models and a persisted result type; that type-only storage dependency performs no I/O.
- Storage, workers, and runtime/ownership infrastructure may consume pure feature models, never feature stores, components, or views. Storage owns persisted-data validation. Runtime injection is a Vue browser adapter outside the pure engine.
- The engine imports only engine modules and has no framework, UI, database, or browser-global dependencies.

ESLint enforces these boundaries for static imports and dynamic `import()` using the same policy. Dynamic imports use string-literal module paths so their dependencies can be checked. `tooling/module-boundaries.test.ts` exercises rejected and permitted imports with the real lint configuration. Tests may import composition and cross-feature fixtures to verify complete behavior.

## Imports and Naming

Use `@/` for imports into `src/`, including local modules. Vite resolves an absolute source directory; the shared TypeScript configuration supplies the same mapping for application, worker, and test checking. Fixtures outside `src/` retain relative imports.

The worker deliberately keeps `new Worker(new URL('./sudoku.worker.ts', import.meta.url), { type: 'module' })`. Source aliases do not replace asset URLs. See the [Vite alias reference](https://vite.dev/config/shared-options.html#resolve-alias), [Vite worker guidance](https://vite.dev/guide/features.html#web-workers), and [TypeScript paths reference](https://www.typescriptlang.org/tsconfig/paths.html).

Views use PascalCase `*View.vue` names; components use descriptive PascalCase names, composables `use...`, and stores `use...Store`. Tests stay beside their owners. The board test lives beside SudokuBoard even though fixtures use session data. Avoid barrel exports or empty directories solely for symmetry.

## Runtime Contracts

The entry provides one runtime. App settles/leaves the game before runtime disposal. Route-owned listeners, timers, and worker jobs retain existing cleanup. Layout extraction adds no KeepAlive or route transitions.

Keyboard, touch, and hints reach the same game actions. Routes, persisted versions, defaults, session IDs, clock calculations, and Chinese copy remain unchanged. Root and `/sudoku/` builds must load real worker assets; existing browser tests exercise both paths.
