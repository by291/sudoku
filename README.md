# Sudoku · 一格一念

A browser-local Sudoku game with a Chinese interface, built with Vue 3, TypeScript, Vite, Vue Router, Pinia, Naive UI, Web Workers, IndexedDB (`idb`), and native CSS. Repository documentation and code identifiers are in English.

The product remains browser-local and statically hosted. Accounts, cloud and cross-device synchronization, friends, global leaderboards, and PWA/offline installation are outside the product scope.

The approved [Local Product Roadmap](docs/superpowers/plans/2026-10-14-sudoku-local-product-roadmap.md) is implemented and locally verified: LF consistency, advanced Classic play, 32 course units, broader variant generation, and local backup/restore. See the [delivery and verification report](docs/superpowers/verification/2026-10-14-sudoku-local-roadmap.md) for evidence and practical limits. Difficulty feedback, manual playtest calibration, and a separate release-acceptance project are outside this roadmap.

## Requirements and setup

Use Node.js 26 or later and the repository-pinned pnpm 12.11.2. Development was verified on Windows with Node.js 26.10.0. TypeScript is pinned to 6.0.3 for compatibility with the installed lint tooling.

Repository text uses LF line endings on every platform. Git attributes, EditorConfig, and Prettier enforce the same convention, including Windows checkouts with `core.autocrlf` enabled.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

Open the Local URL printed by Vite. No server account, API keys, or backend service is required.

## Commands

| Command                             | Purpose                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                          | Start the development server on loopback                          |
| `pnpm typecheck`                    | Check Vue, browser, worker, Node-config, and browser-test types   |
| `pnpm lint`                         | Check correctness, Vue conventions, and module boundaries         |
| `pnpm format:check` / `pnpm format` | Check or apply formatting                                         |
| `pnpm test:unit`                    | Run domain, store, component, and storage tests                   |
| `pnpm build`                        | Create the production `dist/` directory                           |
| `pnpm build:subpath`                | Create the `/sudoku/` verification build in `dist-subpath/`       |
| `pnpm preview`                      | Serve the production build locally                                |
| `pnpm test:e2e`                     | Test the production build in Chromium, Firefox, and mobile WebKit |
| `pnpm check`                        | Run all type, lint, formatting, unit, build, and browser checks   |

Build before running `test:e2e` directly. Playwright starts preview servers on ports 4173 and 4174; its second server builds and tests `/sudoku/` deployment in `dist-subpath/`. Test output, traces, and screenshots are ignored by Git. Tests use isolated browser contexts, fixture records for lengthy completion scenarios, and real production workers for generation and hints.

On the current Windows development host, Firefox 157.0 (Playwright revision 1555) fails from the default browser cache before opening a page. Windows reports error 14001 and cannot resolve the `mozglue` assembly; Playwright reports `spawn UNKNOWN`. An independent download contained the same 61 files with identical SHA-256 hashes, but launched successfully inside the repository. Recreating the default cache did not resolve the failure. The directory-specific Windows loading cause remains undetermined.

Use Playwright's supported [browser-cache location](https://playwright.dev/docs/browsers#managing-browser-binaries) setting for a project-local installation. From the repository root in PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD '.superpowers/playwright-browsers'
pnpm exec playwright install --no-remove chromium firefox webkit
pnpm check
```

Set the variable in the same terminal for installation and subsequent test commands; it applies to that terminal session. The project cache is ignored by Git. This workaround retains every configured browser project and the pinned dependency versions. On 2026-10-13, all 94 Firefox end-to-end tests passed using the project-local installation. The [generation milestone verification report](docs/superpowers/verification/2026-10-13-sudoku-classic-terminal-diversity.md) records the historical checks and browser concurrency used on this host.

## Continuous integration and dependency updates

[CI](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatches. Ubuntu 24.04 jobs install Node.js 26 and the `packageManager`-pinned pnpm with a frozen lockfile. Type checking, lint, formatting, unit tests, and root/subpath builds run before browser jobs. Desktop Chromium, mobile Chromium, Firefox, and WebKit run as separate matrix jobs; WebKit uses one worker. Each job installs its browser with system dependencies and retains its HTML report, failure screenshots, and traces for seven days. Actions use release commit hashes, and superseded runs are cancelled.

[Dependabot](.github/dependabot.yml) checks pnpm/npm packages and GitHub Actions every Monday at 09:00 Asia/Shanghai. Minor and patch version updates are grouped per ecosystem; major updates remain separate. Updates use pull requests and the same CI checks. The current updater includes [pnpm 12 support](https://github.com/dependabot/dependabot-core/pull/16169), even though the published support table may lag behind its implementation. These configurations take effect after they reach the GitHub default branch.

## Internal assessment

Production workers call the pure TypeScript assessor directly, using `sudoku-rating-v2` and default limits of 500 steps per policy and four million shared work units. No external rater or runtime service is required. Browser tests verify actual emitted workers against authored fixture grades, explicit unavailable outcomes, and request budgets at both deployment roots.

Generation defaults for all types and tiers are `{ maxLayouts: 40, maxWork: 4000000, maxSteps: 500 }`. Construction, uniqueness, assessment, and variant necessity share `maxWork`. Exhaustion returns an explicit failure without substituting an authored puzzle. Ready generation includes its accepted compact assessment, which Worker delivery reuses.

Versioned summaries carry the type, difficulty, and workload: steps, placements, eliminations, explicit candidate removals, all technique counts, highest technique/tier, and steps using variant evidence. Placement propagation is excluded from candidate-removal counts. A higher policy reuses the easier policy's workspace and trace only when its actual technique priorities retain that prefix; changed priorities reset both. The complete successful trace contributes statistics, and prior deductions count toward the same per-policy step limit. Completed boards have zero counts and null highest fields. No weighted numeric score is assigned.

Difficulty is the first supported Easy/Medium/Hard policy that completes the puzzle, compared within its type. Rating does not prove uniqueness. Ungraded, exhausted, and invalid outcomes remain explicit. Sessions/results store compact assessment snapshots; restoring valid saved boards does not generate or regrade them. Missing, corrupt, unsupported, or mismatched metadata retains the existing explicit boundary behavior.

Current Classic generation (`sudoku-v7`) constructs complete grids with seeded randomized MRV search, then removes clues under independent uniqueness and shared difficulty checks. Variants use `sudoku-variants-v7`: Diagonal and Jigsaw construct compatible complete-unit terminals, while Killer, Thermo and Arrow build clues from broader Classic terminals. All six types share bounded finite-domain search with affected-unit and arithmetic-clue propagation; terminal construction maintains unit masks. Jigsaw seeds a shuffled complete unit and caps each terminal search at 6,561 nodes, retaining aggregate work for another layout. Killer cage construction prioritizes narrow spaces and neighbours at risk of isolation to reduce singleton cages. Killer Hard cheaply rejects Easy states before full logical screening and exact uniqueness checks. Only freshly generated puzzles with complete matching assessments can be delivered. New free and daily requests use current versions immediately; no historical generator or daily cutoff table is maintained. Historical seeds are not reproduction contracts. Stored attempts and completed facts still take precedence. See the [generation without fallback report](docs/superpowers/verification/2026-10-14-generation-without-fallback.md) for current results and limits; the [three-second generation report](docs/superpowers/verification/2026-10-14-three-second-generation.md), [guided Killer generation](docs/superpowers/verification/2026-10-14-killer-guided-generation.md) and [shared search](docs/superpowers/verification/2026-10-14-sudoku-search.md) document preceding comparisons.

## Play

- **Free play:** Start opens a dialog to choose one of six types and a supported difficulty. Classic offers Easy, Medium, Hard, and Expert; variants offer the first three tiers. New Game opens the same dialog; changing a choice does not edit the current puzzle. Each type retains its own unfinished save, with an explicit resume action and a replacement notice. New puzzles replace saves only after successful generation. Play supports manual notes, atomic undo/redo, pause, and restart. Restarting creates a new session with the same puzzle and resets its time and assistance counts.
- **Learning:** The 32-unit catalogue contains 12 Classic units and four units for each variant. Every unit has guided reasoning and two exercises; variant combined units require three ordered stages per exercise. Wrong answers retain their stage, committed stage cursors survive refresh, and course completion is recorded only after all stages succeed. The original 11 completion identities remain valid. Advanced Classic lessons open Expert practice; foundations and variants use a supported tier. Type navigation, resume/review, freely selectable units, and one active full-board practice save remain available.
- **Daily challenge:** Start opens a type-selection dialog showing each type's available, in-progress, or completed state. The confirmation starts or resumes the selected challenge; completed types explicitly offer practice. Each of the six types has a Medium puzzle that changes at midnight in `Asia/Shanghai`, with independent progress and one formal result per type/date. Restarting an unfinished daily puzzle retains accumulated time and assistance. Older unfinished dates remain resumable.
- **Records:** A type filter selects its own assisted/unassisted free-play bests, completed-game history, formal daily totals, and consecutive eligible challenge days. Learning and daily practice do not enter free-play bests. A late formal completion remains in history and totals, but does not enter that date's streak.

| Type     | Rules in addition to distinct digits in each row and column                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Classic  | Each 3×3 box contains 1–9                                                                                                             |
| Diagonal | Classic boxes plus distinct digits on both long diagonals                                                                             |
| Jigsaw   | Nine connected nine-cell regions replace the 3×3 boxes                                                                                |
| Killer   | Classic boxes plus connected cages with distinct digits and a target sum                                                              |
| Thermo   | Classic boxes plus strictly increasing digits from each bulb along its ordered tube                                                   |
| Arrow    | Classic boxes plus shaft digits summing to the circle digit; repeated shaft digits are allowed when ordinary Sudoku units permit them |

Clue overlays scale with the board and leave cell input available. Selected-cell text explains cage totals and ordered paths, and accessible cell labels include relevant rule context. Pausing conceals numbers, notes, and all clue details.

Use digits 1–9, arrow keys, Delete/Backspace, `N` for notes, and Ctrl/Cmd+Z or Ctrl/Cmd+Shift+Z for undo/redo. Desktop play uses the physical keyboard and hides the on-screen number pad. Phone and coarse-pointer play place six common tools in one row below the board and digits 1–9 in another row. More contains checks, candidate generation, new games, restart, and a settings dialog; open menus and modals own keyboard input. Lesson exercise pads retain their three-column layout. Select an editable cell to enable digit entry and erasing; the controls explain paused, protected, and read-only states. The difficulty choice applies to the next puzzle.

Showing a hint, checking entries, or generating candidates permanently classifies that session as assisted. Applying a hint is an ordinary undoable entry; undoing it does not remove the assistance classification. Hints explain supported logical deductions rather than revealing a search answer. Arithmetic steps name each removed candidate and its position, list the clue's numeric domains or ordered bounds, and show direct remainder equations. Board highlights follow the displayed hint step.

## Local data and timing

Sessions, results, lessons, and preferences belong to the current browser and origin. They do not sync across devices. Clearing browser storage or using the confirmed clear-data action deletes them. Invalid or incompatible records are isolated; valid records remain available, and the records page offers cleanup.

The records page can export a local JSON backup and preview a backup before confirmed replacement. Export settles current saves and reports quarantined/excluded records; a failed current save blocks downloading an incomplete snapshot. Restoration validates the whole file, replaces collections and advances the dataset epoch atomically, stops old editors across tabs, and loads imported games paused. Files retain old puzzle identities, difficulty, history, time, assistance, original results and lesson progress. Keep backup files separately before clearing browser data. See [Local Backup](docs/local-backup.md) for the format, 25 MiB limit and validation boundaries.

Every effective action queues a save, elapsed time is checkpointed every five seconds, and success is shown only after transaction commit. Abrupt termination can lose pending changes and up to the uncheckpointed five-second time interval. Storage failures remain visible; keep the page open and retry. An explicitly started first free/practice game can continue in memory when storage is unavailable, but is not durably saved until recovery succeeds. Switching away from an existing unsaved session is blocked until it can be saved.

New sessions and results use record format 2; the IndexedDB schema, name, and stores remain at version 1. Valid legacy format-1 records normalize to Classic rules without changing IDs, seeds, revisions, history, assistance, or completion facts; subsequent writes upgrade them. Malformed or unknown records are quarantined. Classic daily identities remain `daily:<date>:formal`; new types use `daily:<type>:<date>:formal`, so legacy results cannot grant another formal attempt.

Only one tab may edit a session. A transactional six-second lease, renewed every two seconds, fences stale writers; notices use BroadcastChannel when available. After an abrupt close or refresh, a surviving lease may take up to six seconds to expire before takeover. Following a revision or ownership conflict, the reload action requires confirmation before replacing unsaved local edits with the latest record. A failed reload retains local edits; a peer's active lease keeps the reloaded session read-only. Clearing data advances a dataset epoch so stale session/result writes cannot recreate old records.

Elapsed play time uses a monotonic clock. Leaving the game or hiding the page pauses play; returning or refreshing requires explicit resume. Successful free/practice starts, resumes, and restarts update the URL to the actual session and type without interrupting play. Pause removes numbers and notes from both visual and accessible presentation. Hiding the timer does not stop the clock.

## Static deployment

Upload the complete `dist/` directory to a static HTTPS host. The application uses hash routes, so refreshing a game route does not require server-side route rewriting. Preserve the emitted worker asset and its relative location; the host must allow same-origin module workers.

For a deployment under `/sudoku/`:

```sh
pnpm exec vite build --base /sudoku/
```

Serve that output at the matching path. Changing the host/origin creates a separate browser-local data area. There is no service worker; PWA/offline installation is outside the product scope.

## Architecture and development guidance

- `src/core/sudoku/`: Framework-independent board rules, bounded search, deterministic generation, logical techniques, and hints.
- `src/main.ts`, `src/runtime.ts`, `src/App.vue`, `src/layouts/`, `src/router/`, and `src/theme/`: Bootstrap, injected browser services, root providers, visual shell, hash routes, and theme synchronization.
- `src/features/game/`: Game/daily views, session controls, composables, pure models, and Pinia orchestration.
- `src/features/learning/` and `src/features/records/`: Lessons, progress, history, and statistics.
- `src/features/home/` and `src/features/settings/`: Resume entries, mode selection, preference types/defaults, and shared settings actions.
- `src/storage/`: Runtime-validated records, IndexedDB transactions, editing leases, and serialized saves.
- `src/worker/`: Validated worker messages, computation requests, and cancellation.
- `src/shared/components/` and `src/shared/model/`: Feature-independent Sudoku board, clue geometry, digit input, and confirmation dialog.

See [Web Architecture](docs/architecture.md) for module ownership, dependency direction, source aliases, and naming. See [Adding a Sudoku Variant](docs/variant-extension.md) for rule, generation, board, evidence, teaching, and compatibility registration. Tests remain beside their owners; features create only the responsibility directories they need.

Common controls use Naive UI 2.45.3 with local imports. The CSS palette in `src/styles/theme.css` supplies its theme overrides, including system-theme changes. The board remains a specialized accessible CSS Grid. Modal cancellation restores focus to its trigger, and the skip link preserves the current hash route. Browser tests are configured for Chromium, Firefox, and WebKit engines; mobile emulation is not a physical-device or Safari certification.

Game and lesson pages share `NumberPad`, while their owners handle session and exercise actions. Errors use `NAlert` directly; routine feedback uses `NCard` with `role="status"` or semantic status text. Confirmation dialogs use the library's dialog preset and retain explicit Cancel focus and trigger restoration.

Read [AGENTS.md](AGENTS.md), the [original product design](docs/superpowers/specs/2026-10-11-sudoku-design.md), and the [variants design](docs/superpowers/specs/2026-10-11-sudoku-variants-design.md) before changing behavior. The [variants implementation plan](docs/superpowers/plans/2026-10-11-sudoku-variants.md) records its contracts and verification. Prefer current official documentation for the installed stack and keep core logic independent of browser/framework APIs. Algorithm tests use fixed seeds, an independent exact-cover Classic oracle, and a separate rule-aware variant oracle that never calls production evaluation.

Current generation uses `sudoku-v7` for Classic and `sudoku-variants-v7` for variants, with type, difficulty, and seed in the construction identity. Daily seeds are `daily:sudoku-v7:<date>` for Classic and `daily:sudoku-variants-v7:<type>:<date>` for variants. Stored daily attempts remain snapshots and take precedence over new construction.

Variant generation allows 40 layout attempts and 500 logical steps per analysis, sharing four million work units across generation searches, arithmetic assignments, and repeated propagation. Construction-only exhaustion publishes no puzzle, preserves the current save, and asks the player to choose again. A new free/practice start can use a new seed; formal daily identity remains deterministic. Delivered clues must matter to solving; transformations remap the entire geometry and preserve sums/order. Exhaustion is explicit and never becomes a false proof, a different difficulty, or an unverified puzzle. Generation shows a cancellable loading notice. The client prepares one idle Worker ahead of interaction without computing a puzzle, and terminates active generation requests after three seconds. Runtime disposal releases idle and active Workers. Timeout retains the current save and offers retry with the same input; it does not publish a different puzzle. Assessment and hints retain a 15-second timeout.

Easy variant policies use singles and direct cage remainder, Thermo bounds, and Arrow equations. Medium adds intersections and cage/Arrow combinations; Hard adds pairs. Hints include the arithmetic or region premises leading to a placement. Difficulty compares puzzles within the selected type. Supported techniques deliberately limit generation and hints; advanced variant strategies are outside this release.

Classic uses seeded randomized MRV terminal construction followed by clue removal and validation. Variants construct fresh terminals under their applicable units, then compatible geometry and givens. Jigsaw also branches on missing unit digits with fewer positions; arithmetic paths are rebuilt for the new terminal. The sole delivery path constructs new puzzles under deterministic work limits; it does not claim uniform sampling of completed grids. Authored grading fixtures and teaching examples remain independent validation data, and Jigsaw retains regional layout presets. The versioned corpus contains 64 fixed seeds per supported type/tier (1,216 requests); the four-seed subset runs with regular unit tests.
