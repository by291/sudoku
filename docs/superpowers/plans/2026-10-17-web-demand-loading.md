# Web Demand-Driven Loading Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Independent file owners may execute concurrently under dispatching-parallel-agents after shared contracts are fixed.

**Goal:** Keep browsing proportional to visible data and load computation/content only when needed.

**Architecture:** Canonical payloads retain validation and portable formats. Indexed summaries, generated lesson assets and a lazy computation owner supply narrow feature workflows.

**Tech Stack:** Vue 3.5.43, Pinia 4.0.3, idb 8.0.4, Vite 8.3.4, TypeScript 6.0.3, existing Rust/WASM.

**Spec:** `docs/superpowers/specs/2026-10-17-web-demand-loading-design.md`

## Global Constraints

- English source/docs, Chinese player copy; preserve current styling and accessibility.
- No Android/Rust edits, no generated binding edits, no portable format changes.
- The initial implementation stayed uncommitted. The follow-up request authorizes grouped local commits on the current feature branch; pushing remains a separate action.
- Native validation remains synchronous; async readiness precedes validation transactions. Maintenance validates owned records between its read and fenced write transactions.
- Pages: 30 rows; views retain one page with previous/next navigation, below the 120-row ceiling; lesson cache: 3.

## Review Focus

- Legacy records without summaries remain visible as pending and cannot authorize replacement.
- Cross-tab writes/imports cannot append pages from different generations.
- Failed engine startup preserves data and retries without leaking late initialized resources.
- Switching lessons during a slow content/progress read cannot reveal or submit the wrong stage.
- First load, refresh and failure preserve useful structure without reporting fictitious zero counts.

## Task 1: Storage read contracts and projections

**Files:** `src/storage/{database,repository,backup,readModels,readRepository}.ts` and colocated tests.

**Interfaces:** New repository reads return `StorageOutcome`; `readSession(id)`, `readResult(id)`, `readSlot(mode, variant?)`, `readHome()`, `readDailyStatuses(date)`, `readSummaryPage(query)`, `readOverview(variant,today)`, `maintainSummaries(signal?)`. Publish exact DTO types in `readModels.ts` before consumers change. Repository options gain `prepareValidation?: () => Promise<void>`; only full-payload methods await it.

- [x] Add and run failing migration, targeted-read, pagination and atomicity regressions.
- [x] Implement schema, typed validated summaries, transactional writes, targeted reads and fenced maintenance.
- [x] Run storage tests; report exact contracts and migration behavior to consumers.

## Task 2: Generated learning content and stable progress

**Files:** `scripts/validate-lesson-catalogue.ts`, learning models/store/views/composables and their tests, Vite config as needed.

**Interfaces:** Directory independent of full `Lesson`; async selected lesson loader with bounded cache. Existing exercise operations retain durable cursor semantics. No runtime engine access for directory/guide content.

- [x] Add and run failing lazy-asset, unknown-progress and route-race regressions.
- [x] Generate directory/per-lesson modules from the proved source; update store and page loading ownership.
- [x] Verify lesson tests and build validation tests, including exact verified snapshot bundling.

## Task 3: Home and records query consumers

**Files:** Home view/composable, records store/views/model/components/tests, game setup dialog if needed.

**Interfaces:** Consume Task 1 DTOs; load active tab/filter only, selected result by ID; summary-only Home and sheet queries. Backup preview awaits `runtime.ensureEngine()`.

- [x] Add and run failing query-scope, stale-page, delayed-load and false-zero regressions.
- [x] Wire purpose-specific queries and bounded pagination; retain stale compatible data on refresh.
- [x] Render reserved record/loading structure and handle pending migration/retry explicitly.
- [x] Run focused Home/records tests and player flows.

## Task 4: Lazy computation and game entry

**Files:** `src/runtime.ts`, `src/sudoku/lazyComputation.ts`, `src/App.vue`, `src/ReadyApplication.vue`, game transitions and bootstrap/runtime tests.

**Interfaces:** `GameRuntime.ensureEngine(): Promise<void>` initializes shared computation. Existing engine methods stay synchronous after readiness; the worker proxy starts lazily. Repository `prepareValidation` uses the same initializer.

- [x] Add and run failing startup/no-engine, failure-retry and disposal regressions.
- [x] Mount browsing immediately; await readiness at game/detail validation boundaries.
- [x] Replace full-list game lookups with targeted Task 1 reads while preserving lease/revision checks.
- [x] Verify game, daily, ownership, async lifecycle and bootstrap suites.

## Task 5: Integration and review

- [x] Run typecheck, lint, formatting, full unit suite and root/subpath builds.
- [x] Run Chromium/mobile/WebKit player flows with delayed loading and page queries; inspect resulting UI.
- [x] Review independent implementations and whole diff; fix material findings with regressions.
- [x] Update architecture and verification documentation with actual results and limitations.

## Execution ledger

- Baseline: clean working tree at `1c0b657`; feature branch created; 674 unit tests passed.
- Shared boundary: storage owns read DTOs; runtime owns initialization; learning owns assets; Home/records own presentation queries.
- Implemented all four workstreams. Final unit suite: 69 files, 741 tests. TypeScript, ESLint, Prettier and both production build roots pass.
- Independent review corrected error-state ownership, reset/pagination races, lesson geometry, malformed legacy cursor keys and missing/corrupt summary repair. Daily entry also uses summary-only reads and explicit cancellable maintenance.
- Browser results and environment limitations are recorded in the [verification report](../verification/2026-10-17-web-demand-loading.md).
