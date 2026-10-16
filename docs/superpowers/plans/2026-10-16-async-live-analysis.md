# Implementation Plan: Worker Dispatch for Expensive Live Analysis

Approved behavior: the user selected the focused Worker option on 2026-10-16 and authorized continued inline implementation. Follow the [approved design](../specs/2026-10-16-async-live-analysis-design.md). This closes the failed interactive gate in Task 15 of the [portable engine plan](2026-10-16-rust-core-and-wasm.md); it does not replace its remaining release verification. Ordinary immediate workflows, original work allowances, saved formats and byte-seed identities remain unchanged.

## Task 1: Define cost classification and typed live-result boundaries

**Owners:** `crates/sudoku-core/src/constraints/{types,computation}.rs`, core tests, `crates/sudoku-wasm/src/{prepared,lib}.rs`, DTO/conversion owners, `src/sudoku/{contracts,mainEngine,guards}.ts`.

- [ ] Add native tests for all six rule families, conservative heavy-cage classification, cheap duplicate preview, complete/partial result parsing and invalid cells/boards/masks.
- [ ] Expose a pure native live-computation cost class, with cages larger than four cells conservatively classified as enumeration-heavy. The WASM adapter maps it to immediate/Worker execution; no browser dependency enters core.
- [ ] Expose explicit fallible conflict/edit work-result parsing for the transport boundary. Preserve complete versus exhausted outcomes, sound partial violations, owned arrays and numeric limits.
- [ ] Main prepared resources expose cheap preview and prevent synchronous heavy conflicts/generated notes. Entry/erase/toggle, completion/review, metadata and storage validators stay synchronous.
- [ ] Run native/WASM/type-focused tests; commit `feat(core): classify expensive live computations`.

## Task 2: Execute focused live jobs through the existing Worker client

**Owners:** `src/sudoku/workerEngine.ts`, `src/worker/{protocol,client,sudoku.worker}.ts`, readiness/protocol/client tests and runtime fixtures.

- [ ] Add typed `conflicts` and `generate-notes` requests using owned board/rule/layer snapshots. Copy before any readiness await; never transfer a persisted session.
- [ ] Keep mathematical action work at 1,000,000 and report separately bounded layout preparation. Return exact Rust work/result DTOs; do not add fallback, refund, retry or generation allowances.
- [ ] Reuse version readiness, per-job Worker ownership, 15-second live-job timeout, abort/termination and late-reply fencing. Parse unknown results through Rust and validate the small transport envelope.
- [ ] Test delayed startup, mutable callers, partial/exhausted outcomes, malformed responses, cancellation, timeout and disposal. Commit `feat(worker): run expensive live analysis off thread`.

## Task 3: Fence reactive conflicts and asynchronous note commits

**Owners:** a focused game conflict-analysis composable, `useGameStore.ts`, session model contracts and their tests.

- [ ] Keep ordinary layouts on the current immediate path. For heavy layouts, publish only sound cheap duplicate preview while full conflicts run, with an explicit pending/failed state.
- [ ] Own the current conflict generation/controller separately from hints/generation. Watch puzzle owner and board identity rather than clock or assistance-only changes; terminate stale work.
- [ ] Generate heavy notes asynchronously with captured session/puzzle/layer revision. Commit only if still editable and current, using `commitBoardEdit` and latest assistance facts.
- [ ] Test input, note changes, undo/redo, pause, switch, lease loss, reset/import and disposal during pending jobs. Exhaustion/failure/staleness must preserve layers/history/assistance; a current successful no-change result keeps the original assistance policy.
- [ ] Preserve save-before-switch, immutable snapshots, revisions, leases and epochs. Commit `feat(game): fence asynchronous live analysis`.

## Task 4: Present pending states and verify real player behavior

**Owners:** `GameView.vue`, controls, relevant component/unit tests and actual browser flows.

- [ ] Add accessible Chinese checking/note-loading feedback without implying full validity from preview or stale results. Prevent duplicate note requests while permitting ordinary input.
- [ ] Verify the valid nine-cell-cage regression using emitted Workers at both roots. Exercise cancellation/staleness through player actions and preserve ordinary keyboard/touch/save/completion behavior.
- [ ] Run affected unit/type/lint and desktop/touch/WebKit tests; attempt Firefox and report runtime availability honestly. Commit `test(game): cover heavy-layout live analysis`.

## Task 5: Re-run the interactive gate and resume the release audit

**Owners:** release harness, migration verification report, architecture/contributor/CI documents.

- [ ] Retain raw heavy-kernel timings as evidence. Measure actual main-thread preview/post/commit blocking for Worker-dispatched operations and verify full Worker computation keeps the original budget/result.
- [ ] Require p95 below 16.67 ms and no representative synchronous operation above 50 ms, with independent stale-result and notes-atomicity tests.
- [ ] Resume original Task 15: full native/browser contracts, 171 kernels, all 2,241 generation outputs, 19 combinations, budgets/deadlines, startup/memory and one fresh whole-change review. Do not call an unavailable browser passed or claim full release coverage without it.
- [ ] Update the original plan/report with the discovered failure, approved correction and final evidence. No push/PR/publication without user authorization.
