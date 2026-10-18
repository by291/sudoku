# Android architecture

Android is a native offline client using Kotlin, Compose, Navigation 3, Hilt, Room and generated UniFFI bindings over the shared synchronous Rust core. Read [product behavior](../product.md), [native interface](interface.md), [data loading](data-loading.md) and [build instructions](build.md) for their respective contracts.

## Modules and dependencies

| Module             | Responsibility                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `app`              | Application bootstrap, typed Navigation 3 navigation, global preferences and composition    |
| `core/domain`      | Plain Kotlin player facts, portable schemas, engine/repository interfaces and course values |
| `core/data`        | Validated Room records, ordered saves, epoch/revision fencing, course assets and backups    |
| `core/engine`      | Main-safe generated FFI calls, typed conversion, cancellation and native ownership          |
| `core/design`      | Generic theme and stateless primitives, independent of player models                        |
| `core/ui`          | Controlled accessible board, clues, evidence, labels and theme adapter                      |
| `feature/game`     | Setup/home, daily entry and the common full-board session workflow                          |
| `feature/learning` | Course paths, guides, interactive exercises and practice handoff                            |
| `feature/records`  | Statistics, history, backup/restore and confirmed local-data controls                       |
| `build-logic`      | Shared Android/Compose/Hilt/feature convention plugins                                      |
| `ffi`              | Typed UniFFI adapter over the existing Rust core                                            |

Features expose Route entry points and immutable navigation intents; screens, ViewModels and implementation collaborators stay internal. Features depend on domain/design/UI, never sibling features, app, database classes or generated bindings. Core modules cannot import app/features. Generic design has no player-model dependency. `checkModuleDependencies` rejects unknown modules and forbidden edges, including test dependencies.

## Application and feature ownership

App owns bootstrap, composition, typed navigation and global preferences. ViewModels expose immutable StateFlow and named actions; they do not own Context, Activity, Room or generated native objects. Routes connect lifecycle, navigation and platform document pickers to controlled screens. Touch, keyboard and hint application call the same player operations.

`GameController` coordinates the complete session transaction; `SessionWriter` serializes and coalesces persistence. Disposal waits under the session mutex for any non-cancellable commit and identity adoption, then releases the final editor token and prepared handle. Save-before-switch and save-before-leave remain ordered. Restoration is paused and never resumes automatically.

`GameEntryController` separately owns entry jobs, generations, dataset observations and mutually exclusive setup/daily/continue sheets. Dismissal cancels the pending request; stale completions cannot reopen or replace a newer sheet. Saved choices use `SavedStateHandle`; bootstrap data is reused for the first Home render.

`RecordsViewModel` coordinates `RecordsQueryController` and `RecordsBackupController`. Query filters/pagination and backup/document operations retain separate busy states, failures and retry identities. A count refresh or successful query cannot erase a failed import/export retry. Document I/O remains in the platform adapter; export succeeds only after flush and close.

`LearningDirectoryViewModel` owns directory selection and personal progress. The lesson ViewModel owns interaction; `LearningProgressWriter` serializes durable completion/cursor updates before advancement. Unknown progress is distinct from not started. The latest observed dataset epoch is retained independently of nullable visible state and fences late results even during the first load. See [learning content](../learning.md).

## Domain and persistence contracts

`core/domain` contains plain Kotlin player facts, typed outcomes and narrow repository/engine interfaces. `SettingsUpdate` represents field-specific intents; `updateSettings` reads, merges and validates the latest settings in the write transaction under the expected epoch. Only backup replacement replaces the complete settings object.

`SummaryQuery` explicitly separates saves from history and carries filters into the cursor. Summaries authorize presentation only; selected records still require full validation. Cancellation, timeout, work exhaustion and engine failure are inconclusive and cannot authorize quarantine. Room write consistency and migration belong to [data loading](data-loading.md).

## Native execution and lifetime

Rust owns Sudoku rules, edits, counting, hints, rating, generation and teaching evidence. `android/ffi` exposes named typed operations and exhaustive checked DTO conversions. Bridge version 2 transports live issues as structured violations or diagnostic messages; game presentation formats Chinese explanations. Historical saved issue strings and backup formats stay unchanged.

`core/engine` snapshots mutable input before suspension, separates interactive and analysis execution lanes and respects finite deadlines. `OwnedPreparedPuzzle` owns a prepared native handle and its in-flight leases. A timeout may return to the caller before the native call drains; native memory is released only after actual execution ends. Rejected prepared results are closed exactly once. Cancellation tokens are sticky and must not be reused for another operation.

Keep immutable prepared metadata separate from mutable per-call workspaces and owned returned evidence. No generated native object escapes into UI or persisted domain data. UniFFI generation and cleaner configuration are documented in [build instructions](build.md); generated sources are never edited by hand.
