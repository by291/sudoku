# Sudoku · 一格一念

A browser-local Sudoku game with a Chinese interface, built with Vue 3, TypeScript, Vite, Vue Router, Pinia, Web Workers, IndexedDB (`idb`), and native CSS. Repository documentation and code identifiers are in English.

## Requirements and setup

Use Node.js 26 or later and the repository-pinned pnpm 12.11.2. Development was verified on Windows with Node.js 26.10.0. TypeScript is pinned to 6.0.3 for compatibility with the installed lint tooling.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
```

Open the Local URL printed by Vite. No server account, API keys, or backend service is required.

## Commands

| Command                             | Purpose                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                          | Start the development server on loopback                          |
| `pnpm typecheck`                    | Check Vue, browser, worker, tooling, and browser-test types       |
| `pnpm lint`                         | Check correctness, Vue conventions, and module boundaries         |
| `pnpm format:check` / `pnpm format` | Check or apply formatting                                         |
| `pnpm test:unit`                    | Run domain, store, component, and storage tests                   |
| `pnpm build`                        | Create the production `dist/` directory                           |
| `pnpm preview`                      | Serve the production build locally                                |
| `pnpm test:e2e`                     | Test the existing production build in desktop and mobile Chromium |
| `pnpm check`                        | Run all type, lint, formatting, unit, build, and browser checks   |

Build before running `test:e2e` directly. Playwright starts preview servers on ports 4173 and 4174; its second server builds and tests `/sudoku/` deployment in `dist-subpath/`. Test output, traces, and screenshots are ignored by Git. Tests use isolated browser contexts, fixture records for lengthy completion scenarios, and real production workers for generation and hints.

## Play

- **Free play:** Easy, Medium, and Hard puzzles, manual notes, atomic undo/redo, pause, restart, and confirmed replacement. Restarting creates a new session with the same puzzle and resets its time and assistance counts.
- **Learning:** Six guided lessons cover rules, naked singles, hidden singles, locked candidates, naked pairs, and hidden pairs. Exercises allow retries and save progress. Full practice uses the same game actions and board as free play.
- **Daily challenge:** A Medium puzzle changes at midnight in `Asia/Shanghai`. Seeds include the puzzle version and Beijing date. One stable formal session ID is allowed per date; later replays are practice. Restarting an unfinished daily puzzle retains accumulated time and assistance. Older unfinished dates remain resumable.
- **Records:** Separate assisted and unassisted free-play bests, all completed-game history, formal daily totals, and consecutive eligible challenge days. Learning and daily practice do not enter free-play bests. A late formal completion remains in history and totals, but does not enter the date's streak.

Use digits 1–9, arrow keys, Delete/Backspace, `N` for notes, and Ctrl/Cmd+Z or Ctrl/Cmd+Shift+Z for undo/redo. On-screen controls support touch. Keyboard shortcuts leave form fields and dialogs alone.

Showing a hint, checking entries, or generating candidates permanently classifies that session as assisted. Applying a hint is an ordinary undoable entry; undoing it does not remove the assistance classification. Hints explain supported logical deductions rather than revealing a search answer.

## Local data and timing

Sessions, results, lessons, and preferences belong to the current browser and origin. They do not sync across devices. Clearing browser storage or using the confirmed clear-data action deletes them. Invalid or incompatible records are isolated; valid records remain available, and the records page offers cleanup.

Every effective action queues a save, elapsed time is checkpointed every five seconds, and success is shown only after transaction commit. Abrupt termination can lose pending changes and up to the uncheckpointed five-second time interval. Storage failures remain visible; keep the page open and retry. A game can continue in memory when storage is unavailable, but it is not durably saved until recovery succeeds.

Only one tab may edit a session. A transactional six-second lease, renewed every two seconds, fences stale writers; notices use BroadcastChannel when available. After an abrupt close or refresh, a surviving lease may take up to six seconds to expire before takeover. Clearing data advances a dataset epoch so stale session/result writes cannot recreate old records.

Elapsed play time uses a monotonic clock. Route changes and hidden pages pause play; returning or refreshing requires explicit resume. Pause removes numbers and notes from both visual and accessible presentation. Hiding the timer does not stop the clock.

## Static deployment

Upload the complete `dist/` directory to a static HTTPS host. The application uses hash routes, so refreshing a game route does not require server-side route rewriting. Preserve the emitted worker asset and its relative location; the host must allow same-origin module workers.

For a deployment under `/sudoku/`:

```sh
pnpm exec vite build --base /sudoku/
```

Serve that output at the matching path. Changing the host/origin creates a separate browser-local data area. There is no service worker or offline-installation promise in this release.

## Architecture and development guidance

- `src/core/sudoku/`: Framework-independent board rules, bounded search, deterministic generation, logical techniques, and hints.
- `src/features/game/`: Pure session transitions and timing, Pinia orchestration, shared board, controls, and daily policy.
- `src/features/learning/` and `src/features/records/`: Lessons, progress, history, and statistics.
- `src/infrastructure/`: Validated worker messages, ownership coordination, runtime-validated records, transactional storage, and serialized saves.
- `src/app/`: Bootstrap, hash routes, runtime injection, theme, preferences, and home.

Read [AGENTS.md](AGENTS.md), the [approved design](docs/superpowers/specs/2026-10-11-sudoku-design.md), and the [implementation plan](docs/superpowers/plans/2026-10-11-sudoku-implementation.md) before changing behavior. Prefer current official documentation for the installed stack and keep core logic independent of browser/framework APIs. Algorithm tests use fixed seeds and an independent exact-cover uniqueness oracle.

Generation has explicit search/logical/layout budgets and frozen fallback puzzles. Complete solution layouts currently use seeded Sudoku-preserving transformations of a known valid grid. This ensures reproducibility and bounded work, while providing less solution diversity than sampling all possible completed grids.
