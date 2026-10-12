# Web Architecture

The [product design](superpowers/specs/2026-10-11-sudoku-design.md) and [variants design](superpowers/specs/2026-10-11-sudoku-variants-design.md) define behavior, [AGENTS.md](../AGENTS.md) defines development conventions, and [README](../README.md) lists setup and verification commands. This document describes current module ownership.

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
  shared/model/boardGeometry.ts
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
| `layouts/AppLayout.vue`       | Header, theme choices, consistent parent navigation, preference failures, skip link, main landmark, and footer           |
| `router/`                     | Existing routes and their views; static-host hash navigation                                                             |
| `theme/useTheme.ts`           | One composable for light/dark/system synchronization and Naive UI configuration from the shared CSS palette              |
| `shared/components/`          | Controlled SudokuBoard, NumberPad, and ConfirmationDialog; emit actions without choosing a store or persistence strategy |
| `features/home/views/`        | Workflow entry dialogs and a standalone resume action, with a saved-session chooser when needed                          |
| `features/game/views/`        | GameView for free play/full-board practice, DailyView for challenges                                                     |
| `features/game/components/`   | Controlled setup dialog, session controls, and logical hint presentation                                                 |
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

Keyboard, touch, and hints reach the same game actions. Existing routes accept a validated `variant` query; explicit saved-session links restore the stored type. Ordinary free/daily entry waits for the player to open a setup dialog. Home confirms choices before navigating, passing transient `start=1` intent and a validated free-play `difficulty`; successful transitions replace those parameters with the actual type/session identity so refreshing resumes instead of generating again. Dialog selections stay local and do not mutate a running puzzle. Home and game/daily views compose the same controlled `GameSetupDialog`, while each owner handles starting, saved-session lookup, and errors through existing stores. Successful free/practice transitions synchronize the actual type/session query without restoring the already active session. A save-before-install guard pauses and flushes the active session before generation, restoration, or daily switching; an ordinary write failure retains the current in-memory session and editing rights for retry. Revision or ownership conflicts make the session read-only. A separate, explicitly confirmed reload action replaces local edits only after reading the latest record; failed recovery leaves local edits intact.

AppLayout renders the common parent link: workflow pages return home, lessons return to their own type's course path, and full-board practice returns to its own lesson. Typed route metadata resolves lesson destinations at the composition boundary, following the [Vue Router route metadata convention](https://router.vuejs.org/guide/advanced/meta.html), so the layout does not import lesson data. These destinations are deterministic for direct links as well as in-app navigation. LearningView derives the selected course from the validated `variant` query, completion from the learning store, and its recommended unfinished lesson from the current-lesson preference. It keeps all lessons accessible without changing progress identifiers or persistence. The router scrolls to the top when entering a different page, choosing a different learning type, or switching a lesson between its exercise and full-board practice. Browser back/forward restores the saved position, following the [Vue Router scroll behavior contract](https://router.vuejs.org/guide/advanced/scroll-behavior.html). Session-query updates preserve the current board position. Modal body dimensions are passed to Naive UI directly because its teleported preset surface does not retain the calling component's scoped-style attribute.

`PuzzleRules` is a discriminated union under `core/sudoku/rules.ts`. Its compiled `RuleContext` distinguishes complete nine-digit units, duplicate peers, related highlights, and arithmetic/path constraints. Jigsaw replaces boxes; Killer cages and Arrow shafts are not nine-digit units. Framework-independent bounded evaluation drives candidates, conflicts, uniqueness, completion, and explainable deductions. Clue reductions appear as typed evidence rather than hidden candidate pruning. Exhaustion remains inconclusive.

`shared/model/boardGeometry.ts` formats actual regions and clues without solving. `SudokuClues` draws decorative SVG in board coordinates, while the CSS Grid retains buttons, notes, digits, and focus. Accessible cell labels and selected-rule text explain the geometry; pause removes clue presentation as well as values.

`GenerationInput` pairs each type with its supported generation version. Classic keeps `sudoku-v1`; variants use `sudoku-variants-v1`. Safe transformations preserve geometry and arithmetic, and fifteen independently verified original fallback slots cover five types and three policies. Worker decoders validate complete rules, proof shapes, and clue identity; the client rejects mismatched type/version/seed/difficulty and stale results.

Storage writes format-2 sessions/results and normalizes validated format-1 records to Classic without rewriting historical facts. The database schema stays at version 1. Free replacement is transactional and scoped by type, learning retains one practice slot, and leases/revisions/dataset epochs continue to fence stale writes. Formal daily identities and eligibility are independent by type/date; Classic IDs remain compatible. Pure aggregation produces six daily statuses and six separate record summaries.

Root and `/sudoku/` builds must load real worker assets. Browser tests exercise every new type at both roots, and independent test oracles validate returned puzzles without calling production compilation or search. Chromium desktop/mobile emulation and WebKit are configured alongside Firefox; host launch failures and physical-device verification are reported separately.
