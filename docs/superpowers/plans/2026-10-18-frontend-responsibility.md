# Frontend Responsibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the complete approved frontend responsibility and readability audit.

**Architecture:** Preserve feature ownership and one public store per workflow. Extract cohesive internal owners and pure transformations; make asynchronous ownership and outcomes explicit.

**Tech Stack:** Vue 3.5.43, TypeScript 6.0.3, Pinia 4.0.3, idb 8.0.4, Vitest 5.0.3, Playwright 1.64.0.

**Spec:** `docs/superpowers/specs/2026-10-18-frontend-responsibility-design.md`

## Global Constraints

- Preserve Chinese interface copy, visual layout, keyboard/modal ownership and player workflows.
- Preserve storage schema 2, portable record/backup formats, 32 stable lesson IDs and authored content.
- Preserve `sudoku-v11`, `sudoku-variants-v11`, `sudoku-rating-v2`, bridge version 3, seed bytes, random-call order and work budgets. Do not change Rust or generated bindings.
- Preserve lazy WASM loading, summary-only browsing, page size 30, stable ordering, and unknown-versus-zero semantics.
- Keep canonical/projection writes atomic. Await engine readiness before opening validation transactions; never introduce unrelated awaits inside IndexedDB transactions.
- Keep one public game store and one public records coordinator. Preserve save-before-switch, dataset epoch/revision fencing, and explicit resource ownership.
- Keep pure models independent of browser services and reactive state; permit explicit type-only persisted contracts where needed.
- Continue in the current checkout. Do not commit or push without a new explicit request.
- Read AGENTS.md, docs/architecture.md and the spec above. Review relevant existing demand-loading and readability designs before altering ownership. Use English comments/docs/tests. No nested agents.

## Review Focus

- A cancelled denied replacement must release only its newly acquired previous-session lease (Task 3 regression).
- Summary statistics must retain assistance, variant/mode isolation and Beijing daily streak rules (Task 1 production-path tests).
- A committed lesson completion remains successful if subsequent cursor cleanup fails (Task 2 contract coverage).
- Old record readers and backup jobs must not publish after replacement/reset or release a newer owner (Task 4 existing behavioral tests).
- Nested models and dynamic imports must obey the same boundaries, while valid type-only contracts remain legal (Task 5 red/green lint tests).

### Task 1: Storage summary ownership and production statistics

**Files:** `src/storage/readRepository.ts`, `repository.ts`, `readModels.ts`, their tests; new focused storage summary maintenance/statistics modules; `src/features/records/model/records.ts` and tests.

**Interfaces:** Preserve public repository methods and result contracts. `RecordSummary` has one explicit type owner in storage/readModels. New internal pure statistics and maintenance owners may use narrow typed contracts; do not create a general context framework.

- [x] Move independent expectations from retired full-record aggregation tests onto the actual compact-summary repository path. Cover variant/mode/assistance isolation, formal Beijing eligibility, year-boundary consecutive dates and duplicate IDs where supported by the production contract. Keep display grouping tests with live helpers. Verify tests before extraction.
- [x] Remove production-unused `summarizeSave`, `sortSavedSessions`, `groupCompletedRecords`, `variantSaves`, `summarizeRecords` and duplicate `RecordSummary` after checking callers. Preserve live `sessionLink`, `modeName`, `summarizeProjection`, `groupCompletedSummaries`.
- [x] Extract pure summary aggregation from `readOverview` and the cancellable summary repair workflow from `readRepository`. Keep shared snapshot/coverage helpers under an explicit storage owner without import cycles. Preserve capture/validate/write fencing, one owned payload, unavailable-not-quarantined behavior, atomic writes and yields outside transactions.
- [x] Replace `repository.access(operation, write, validate)` positional flags with named semantic options. The write flag currently controls failure classification, not IndexedDB transaction mode; preserve error precedence exactly.
- [x] Add logical paragraph breaks and reasoning comments in touched workflows. Run focused storage/readRepository, repository and records-model tests plus relevant lint/format. Report exact commands/results and changed file list; do not commit.

### Task 2: Learning contracts and explicit outcomes

**Files:** `src/features/learning/model/lessons.ts`, catalogue/answer/exercise-stage helpers and callers, `stores/useLearningStore.ts`, `composables/useLessonExercise.ts`, `views/LearningView.vue`, affected tests; `src/features/settings/stores/usePreferencesStore.ts`.

**Interfaces:** Lesson owns metadata, guided stage and exercises without duplicate flattened guided board/candidates/rules/exercise fields. Answer matching accepts only the answer/explanation contract it needs. Exercise presentation carries the stage it renders instead of cloning an entire Lesson. `submitExercise` returns a discriminated union for incorrect, unavailable/cancelled, save-failed, advance and completed outcomes; choose precise states matching actual existing feedback and update all consumers atomically.

- [x] Preserve authored content, 32 IDs, stage ordering, three-entry decoded lesson cache and progress storage shape. Migrate existing tests with the new contracts, keeping literal independent expectations.
- [x] Narrow Lesson and answer matcher contracts; remove synthetic complete Lesson copies. Extract coherent private submission stages while retaining one store orchestration action and all generation/save fences.
- [x] Replace boolean outcome combinations with exhaustive discriminated outcomes and clear consumer branches. Cover durable final completion despite optional cursor cleanup failure if existing tests do not already pin it. Preserve current save-failure feedback and do not advance before durable save.
- [x] Derive LearningView recommendation kind/label/caption from domain state, never Chinese text equality. Name exercise transformation constants for symmetry values 2 and 7 without changing transformations.
- [x] Rename preference operation `epoch` to `operationGeneration`, keeping datasetEpoch distinct; explain queue/latest-operation/initial-patch semantics. Improve meaningful whitespace in these workflows.
- [x] Run learning/settings unit tests and relevant type/lint/format checks. Report exact commands/results and changed file list; do not commit.

### Task 3: Game transitions and daily status ownership

**Files:** `src/features/game/stores/sessionTransitions.ts`, affected game store callers/tests; `components/GameSetupDialog.vue`; `composables/useDailyEntry.ts`, new `useDailyStatuses.ts`; `components/HintPanel.vue`, `model/techniquePresentation.ts`, `stores/sessionPersistence.ts`.

**Interfaces:** Preserve public player actions. Replace correlated previous-token/ownership booleans with a discriminated ownership contract distinguishing none, borrowed attached session and independently acquired lease. New lease ownership transfers only on successful install. `useDailyStatuses` owns status summary loading/maintenance/date/reset/disposal; entry retains route/start operations.

- [x] Add a deferred cancellation regression: independently acquire a previous inactive slot lease; proposed ID acquisition returns no token; pause epoch reread, cancel/supersede operation, resolve epoch; assert previous owned lease released and no stale install/write. Observe failure before fixing. Preserve attached borrowed lease semantics in existing tests.
- [x] Refactor replacement into named coherent validation/preparation, previous-session preparation, acquisition, commit and installation stages with centralized ownership cleanup. Every asynchronous return must respect operation generation, dataset epoch and transfer/disposal. Avoid callback-heavy context abstractions.
- [x] Remove unused `_replaceId` parameter; give any explicit ID argument a clear supported position/option and update callers. Remove GameSetupDialog full-session fallback and test summary-only input.
- [x] Extract daily status lifecycle as one composable without making route startup wait for summary lookup. Preserve unknown counts, maintenance, error isolation and stale/dispose behavior.
- [x] Explain persistence attachment identity versus revision and operation-generation lifecycle. Replace hint nested outcome ternaries and technique cage/thermometer/arrow branching with named computed values or explicit branches. Improve logical whitespace without changing rendered whitespace/copy.
- [x] Run transition, async lifecycle, daily, setup/hint/presentation/persistence tests and relevant lint/type/format. Report red/green evidence and changed file list; do not commit.

### Task 4: Records reader and backup workflow owners

**Files:** `src/features/records/stores/useRecordsStore.ts`, new focused internal reader/backup modules, `components/LocalBackupPanel.vue`, affected records tests.

**Interfaces:** Keep one public records store and existing view API where practical. Internal reader owns pages/filters/maintenance/read ownership; backup owner owns preview/export/import operations. Store coordinates save-before-backup, commit-before-global-reset and refresh. Internal contracts must be explicit and narrow.

- [x] Extract the complete reader lifecycle (owner token, loading, cursors, reset and maintenance) and backup lifecycle (busy/error/preview/generation) from the store. Keep readBusy and backupBusy independent and prevent obsolete owners releasing current ones.
- [x] Preserve preview epoch, old-operation fences, cross-store reset ordering, save-before-export and atomic replacement. Use existing behavioral tests, adding only an uncovered invariant exposed by extraction.
- [x] Replace LocalBackupPanel direct `backupError` assignment with a named operation or appropriate local file-read error state, preserving UI channels and clearing semantics.
- [x] Improve workflow paragraph grouping and add short invariant comments at ownership boundaries. Run records store/panel/view/backup tests and relevant type/lint/format. Report exact commands/results and changed file list; do not commit.

### Task 5: Shared conventions, boundaries and integration documentation

**Files:** `eslint.config.js`, `tests/module-boundaries.test.ts`, `src/sudoku/{values,guards,catalogue}.ts` and callers; App/bootstrap components/tests; shared board/clues tests; Home composable, Worker client, `tsconfig.worker.json`, `AGENTS.md`, `docs/architecture.md`.

**Interfaces:** Canonical scalar guards belong to values; canonical variant membership belongs to catalogue with exhaustive coverage retained. Shared components remain controlled and independent of features/storage/runtime. Application loading names describe application readiness rather than engine readiness.

- [x] Add red/green lintText tests for records pure models, nested game/learning/settings/records model paths, static and dynamic restricted imports, shared direct `idb` imports, and permitted explicit type-only storage contracts. Make pure-model globs recursive and include records. Keep banned runtime imports banned and legal fixtures meaningful.
- [x] Consolidate duplicate `isRecord`/`isDifficulty` and variant checks; update all callers without a compatibility barrel or eager WASM import. Move catalogue imports to the top.
- [x] Rename EngineBootstrapState/EngineLoadingState to application startup names and update imports, tests, root lint patterns and docs. Preserve runtime lifecycle and retry behavior.
- [x] Extract the board accessible-label calculation into a focused local pure helper; group keyboard/focus work coherently. Name arrow circle radius 0.34 and explain edge offset. Preserve accessible labels, rendered geometry, focus and Naive UI 2.45.3 workarounds. Add useful blank lines between SFC sections/adjacent tests where touched.
- [x] Improve App bootstrap, Home read workflows and Worker client stages with logical paragraphs and short fencing/lifetime comments. Remove obsolete src/core worker tsconfig glob if unused. Avoid fragmenting cohesive CSS or worker ownership.
- [x] Update AGENTS/architecture with actual new owners and contract conventions. Run module-boundaries, shared/App/Home/Worker tests and relevant lint/type/format. Report changed file list; do not commit.

## Final integration (controller)

- [x] Run typecheck, lint, formatting, full Web unit suite, root and subpath builds.
- [x] Run available desktop/mobile Chromium and WebKit E2E against fresh build; attempt a scoped Firefox startup check and record any environment limitation separately.
- [x] Review the entire working-tree diff including untracked source using an independent final reviewer. Resolve findings with focused validation.
- [x] Write an English verification record with actual command outcomes and limitations, update this checklist, preserve review evidence outside ignored scratch, and leave changes uncommitted.
