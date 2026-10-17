# Android Data Loading Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task. Preserve the current checkout and leave commits for the user's explicit commit request.

**Goal:** Make Android startup and page reads independent of complete save/history decoding.

**Architecture:** Keep canonical portable records and atomically maintained Room summary tables. Bootstrap reads a small snapshot; features query selected summaries/details, and learning separates its static directory from lesson assets.

**Tech Stack:** Kotlin, Room 2.8.5, coroutines 1.10.2, Lifecycle 2.10.0, existing Compose UI.

**Spec:** [Approved design](../specs/2026-10-17-android-data-loading-design.md)

## Global constraints

- Preserve Chinese UI copy/style and portable backup v1/session v2.
- Preserve epochs, revisions, original results, editor fencing, and conclusive-only quarantine.
- No dependency upgrades, destructive migrations, or unrelated Web/Rust edits. Commit only after explicit user authorization.
- Execute inline in the current checkout as requested; use a final independent review.

## Review focus

- Legacy rows without projections must remain visible as pending and cannot authorize replacement.
- Restore/clear during a suspended query must reject stale deliveries.
- Original results cannot change on replay or projection repair.
- Daily eligibility must include legacy records and Beijing rollover.
- Slow/failed engine and lesson reads cannot gate Home.

## Tasks

### 1. Read contracts and transactional projections

Files: core/domain `ReadModels.kt`; core/data `SummaryStorage.kt`, `SudokuDatabase.kt`, `RoomGameRepository.kt`, `StorageModule.kt`; data instrumentation tests.

- [x] Add regressions proving summary reads do not invoke mathematical validation, original completion summaries remain immutable, selected detail reads ignore unrelated invalid payloads, and migration preserves pending rows.
- [x] Add typed summary/bootstrap/page/overview contracts and a separate `GameReadRepository` read interface. Keep transactional writes in `GameRepository`.
- [x] Add version 2 summary tables and schema-only automatic migration. Derive summaries from validated snapshots and write/delete/import them atomically with payloads.
- [x] Add targeted validated detail reads, bounded summary pagination, daily-ID reads, SQL overview facts, and resumable one-row-at-a-time backfill with epoch/revision fencing.
- [x] Run data/domain tests and inspect generated Room schema.

### 2. Minimal bootstrap and on-demand game entry

Files: app `AppViewModel.kt`, `SudokuApp.kt`; game `GameEntryLoader.kt`, `GameEntryViewModel.kt`, `HomeRoute.kt`, setup/continue sheets, `GameController.kt`; matching tests.

- [x] Prove Home becomes ready while native information and lesson content are suspended, and no full list reads occur.
- [x] Replace feature bootstrap dependencies with the small read contract; move maintenance after first frame and retain the existing feedback delay.
- [x] Make sheets read their own summary data; keep Home actions stable during sheet refreshes. Replace controller list scans with selected-ID/slot reads.
- [x] Test daily/replace conflict paths, unknown migration state, resume fallback, and failure isolation.

### 3. Demand-driven records

Files: records ViewModel, screen and tests.

- [x] Test selected-tab-only reads, 30-row pagination, filter/epoch fencing, and pending data without false totals.
- [x] Use summary rows and SQL aggregate facts. Keep backup full validation behind explicit actions; query quarantine count when tools open.
- [x] Preserve tab/filter/scroll behavior and verify original UI tests.

### 4. Static learning directory and selected lesson assets

Files: domain learning contracts/catalogue; data asset repository/build configuration; learning state/loader/screens; asset generation and tests.

- [x] Test directory availability without lesson decoding and selected asset loading independently of other lessons.
- [x] Generate compact directory and per-lesson assets from the authored catalogue during build; preserve structural validation and existing mathematical build validation.
- [x] Remove bootstrap preload; load personal progress separately and retain bounded per-lesson caching.
- [x] Verify durable cursor and lesson UI behavior with existing workflow tests.

### 5. Integration and verification

- [x] Run Android qualityCheck and assembleDebug, focused data migration instrumentation, and affected UI tests on a disposable emulator.
- [x] Verify startup independence and bounded summary reads at 0, 100, 1,000, and 10,000 history rows. Do not interpret these isolation tests as long-undo-history or end-to-end latency benchmarks.
- [x] Review all changed paths for epoch/ownership/pagination failure cases; update the approved Android design and record verification evidence.

## Execution ledger

- Planning: user explicitly authorized implementation of the written design; proceed without another approval round.
- Baseline: clean tracked checkout; only the proposed design document was untracked.

- Schema: Room v2 adds session/result projections and a persisted projection generation/coverage row. Automatic v1 migration only creates schema. Canonical portable payloads and backup versions remain unchanged.
- Review: independent review caught tab-transition rendering, stale cursors, full-history pending checks, epoch-delivery races, midnight refresh, and unknown-state presentation. Those findings were corrected; final focused review found no remaining important issue in epoch fencing or persisted coverage.
- Local checks: `qualityCheck`, debug APK assembly, 74 JVM tests, and instrumentation APK assembly passed. The final rebuild includes bootstrap reuse on first Home entry. One combined parallel lint/KSP run encountered a generated-file race; the serial verification rerun passed without suppressing checks.
- Disposable device: Android API 37.2 ARM64, Pixel 7 profile, 16 KB page image, headless software rendering, serial `emulator-5580`. The user's emulator was not used.
- Device suites: data/migration/assets 18 tests passed; Records UI 7 passed; learning/lesson UI 10 passed. Full app workflow suite: 33 passed, including native-blocked startup, Home frame stability, selected resume, multiple-save selection after activity reopening, native gameplay, predictive Back, and Web backup interoperability. Total: 68 device tests passed.
- Read isolation: fixtures with 0/100/1,000/10,000 original-result rows return at most 30 summaries, use no mathematical validator calls, and do not deserialize deliberately opaque payloads. This is not a valid-long-history allocation benchmark. Actual SQLite query-plan checks confirm the ready history ordering index and no temporary sort.
- Timing limit: exploratory launcher measurements were not comparable cold/warm runs and are not evidence of a startup speedup. No median/p95, allocation, or full legal undo-history benchmark is claimed. The startup instrumentation instead blocks native readiness/validation and verifies Home and daily actions remain available.
- Test environment: the disposable app database was cleared after interim v2 schema iterations. Formal v1-to-v2 migration is verified separately with preserved legacy payloads; no production destructive migration was added.

- Final cache-lifetime regression: Home loader is owned by its ViewModel, so a reopened activity consumes the latest bootstrap rather than a process-wide old save count. The full app suite passed after this fix. The user subsequently authorized grouped commits by responsibility.
