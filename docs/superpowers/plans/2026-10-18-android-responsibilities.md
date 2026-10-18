# Android Responsibility and Readability Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. The user approved the complete audit proposal. Execute continuously; do not commit or push.

**Goal:** Implement the accepted Android audit: repair behavioral boundaries, clarify ownership, and improve logical readability with regression evidence.

**Architecture:** Preserve existing Android modules and Rust-only computation. Keep one coordinator per complete transaction, with narrow internal collaborators for independent responsibilities. Keep controlled presentation separate from platform lifecycle and business operations.

**Tech Stack:** Kotlin 2.4.21, Compose BOM 2026.09.00, Lifecycle 2.10.0, Room 2.8.5, coroutines 1.10.2, ktlint 1.7.1.

**Spec:** `docs/superpowers/specs/2026-10-16-android-client-design.md` and `docs/superpowers/specs/2026-10-17-android-data-loading-design.md`.

## Global Constraints

- Work in the existing checkout; preserve unrelated changes. No commit, push, generated-binding edits, or unrelated Web/shared-Rust changes.
- English documentation, identifiers, comments and test descriptions; Chinese player-facing copy.
- Preserve backup v1/session v2, v11 identities, 32-byte seeds, seeded random ordering, finite work budgets, original results, first completion facts and save-before-switch.
- Unknown is distinct from empty; cancellation, timeout and exhaustion never establish invalidity or authorize quarantine.
- Snapshot mutable inputs before suspension; retain epoch/revision/editor fences; release native handles only after actual execution finishes.
- Fixes require observed failing regressions followed by passing tests. Behavior-preserving extraction uses existing contract tests; do not add mirror tests for trivial helpers.
- One implementation agent at a time. No nested agents. The parent coordinates Gradle and disposable emulator ownership; never use the user's physical device or everyday emulator.
- Reuse the official guidance reviewed during the audit: Kotlin conventions, Android Kotlin style, Android architecture recommendations, Compose state hoisting/effects, coroutine best practices. Review installed API documentation if introducing a new API.

## Review Focus

- Settings changed by different owners preserve unrelated fields, including cached game settings.
- A disposed game owner cannot retain a handle/token installed by a late non-cancellable commit.
- Invalid native input is distinguished from unavailable execution; stale or malformed projections never authorize completed/present UI facts.
- Records queries and backup/document handshakes have independent state and retry identity across navigation/lifecycle changes.
- Learning content may arrive early, but unknown personal progress never becomes zero and durable save remains the prerequisite for advancement.

### Task 1: Domain, storage and native ownership

**Files:** `android/core/domain`, `android/core/data`, `android/core/engine`; minimal contract call-site/test-fixture updates elsewhere are allowed to keep the tree compiling.

**Interfaces:** Produce atomic, epoch-fenced field-intent settings updates (typed `SettingsUpdate`, `updateSettings(update, expectedEpoch): StorageOutcome<Settings>`); callers must stop replacing unrelated cached fields. Retain full replacement only for backup replacement under its existing transaction. Record exact resulting contracts in the report for later tasks.

- [x] Add and run failing tests for invalid Jigsaw/range input classification, obsolete/malformed projections, and independent settings updates; cover unavailable outcomes preserving canonical records.
- [x] Preserve typed invalid input at validation boundaries. Separate current projection selection/validation from pending coverage; keep repair fenced against epoch and source revision and preserve canonical payloads on inconclusive work.
- [x] Refactor RoomReadRepository into a public coordinator and internal summary querying/projection/coverage, record-details, and maintenance responsibilities. Keep one write mutex/transaction owner. Remove unused production full-list APIs and migrate tests to explicit selected/page/DB checks. Share pure streak/statistics policy without self-oracle tests.
- [x] Separate PortableCodec normalization, limits, and session validation; unify lesson identity/stage contracts without domain-to-data dependencies. Preserve wire formats and resource limits.
- [x] Extract OwnedPreparedPuzzle; group native value/rule/evidence/assessment conversions; name execution lanes. Resolve deadline comment/implementation mismatch accurately. Preserve input snapshots and rejected-resource disposal.
- [x] Clarify domain contracts and remove string-shaped or impossible-state metadata where a focused sealed type is justified. Apply logical spacing, meaningful KDoc, explicit imports and internal visibility in touched areas.
- [x] Run domain/native JVM tests and compile data instrumentation tests. Add native ownership regressions for concurrent close/in-flight work, rejected prepare results and queued cancellation where missing. Coordinate a disposable-emulator data test run with the parent.
- [x] Report RED/GREEN commands, changed contracts, tests, and remaining concerns. Do not commit.

### Task 2: Game workflow and controlled presentation

**Files:** `android/feature/game`, relevant app player-flow tests.

**Interfaces:** Consume Task 1 atomic SettingsUpdate. Keep GameController as the session transaction coordinator and SessionWriter as the ordered/coalescing writer.

- [x] Add failing regressions using distinct prepared handles for dispose during replacement commit and saved-session adoption; assert final tokens released and every owned handle closed once, without auto-resume.
- [x] Coordinate terminal disposal with non-cancellable commit completion. Preserve committed identity adoption and save-before-switch; do not delete NonCancellable as a shortcut.
- [x] Extract controlled GameScreen from GameRoute. Route owns VM/lifecycle/navigation/back-save; screen owns layout and local presentation. GameInputPanel takes named operations, not a ViewModel. Extract keyboard mapping and cohesive modal responsibilities without a command bus.
- [x] Consolidate entry workflow state/jobs/generations under one feature owner; remove mutable loader state escape hatches. Use mutually exclusive entry-sheet selection, explicit dismissal cancellation and fenced success publishing.
- [x] Add entry tests for rapid switching, dismissal, late completion, stale cursor and epoch replacement. Preserve bootstrap reuse/failure retention and existing sheet animation contracts.
- [x] Replace semantic Pair with named persisted-session fields; name ticker/checkpoint constants; clean logical paragraphs/braces/imports, remove unused retry argument, tighten internal visibility, and improve fake action/resource identity fixtures.
- [x] Run game JVM tests and compile app/game instrumentation tests; preserve touch/keyboard/hint operation equivalence and modal keyboard ownership.
- [x] Report verification and exact behavior preserved. Do not commit.

### Task 3: App, learning and records workflow ownership

**Files:** `android/app`, `android/feature/learning`, `android/feature/records`, `android/core/ui` for actual shared presentation.

**Interfaces:** Consume atomic settings updates. Keep platform document I/O in the route/adapter and business state in feature owners. Use explicit typed operation results rather than generic retry/error slots.

- [x] Add failing tests for theme save retry preserving the requested theme, unknown course-row semantics, backup-busy query switching and separate retry ownership.
- [x] Separate bootstrap failures from theme operation/retry state; retain startup's small read footprint.
- [x] Keep RecordsViewModel as coordinator; extract query/pagination and backup/document handshake controllers with independent failures and retries. Preserve storage failure kinds. Use one tab source, with SavedStateHandle for persisted query choices and local scroll state. Scope observation/date refresh to STARTED and avoid duplicate refresh triggers.
- [x] Narrow LearningSnapshotLoader to progress/content contracts; separate directory state from lesson interaction and ordered progress writing. Use explicit submission outcomes, preserve first-completion and explicit Next semantics, and stop treating unknown progress as NotStarted.
- [x] Share actual duplicated variant labels/controlled selection in core/ui. Extract lesson keyboard/zoom only where they form clear independent responsibilities; preserve existing cohesive drawing and navigation implementations.
- [x] Apply logical grouping, necessary invariant comments/KDoc, imports, braces and internal visibility. Preserve cancellation/fencing and all known-good player flows.
- [x] Run app/learning/records JVM tests and compile relevant instrumentation tests; coordinate execution with parent.
- [x] Report RED/GREEN evidence and concerns. Do not commit.

### Task 4: Quality gates, documentation and complete verification

**Files:** `android/AGENTS.md`, `android/README.md`, `android/build.gradle.kts`, focused remaining Kotlin readability and contract gaps.

- [x] Document ownership, logical paragraphs, necessary comments, tests and verified API boundaries in English with concrete current examples.
- [x] Make module-edge checks reject unregistered Android modules and check actual feature lint coverage. Include appropriate lint tasks in qualityCheck without suppressing failures.
- [x] Review all authored Kotlin for remaining relevant readability issues, visibility, meaningless wrapping, magic values, duplicated state and public contract clarity; preserve cohesive CSS-equivalent/static layout and drawing code.
- [x] Run `./gradlew qualityCheck :app:assembleDebug` and targeted instrumentation suites on an explicitly disposable AVD. Run native checks if the FFI adapter changes; preserve independent backup interoperability tests.
- [x] Perform independent whole-diff review, fix material findings with regressions and re-run affected checks. Record exact coverage and limitations in an English verification report.
- [x] Leave changes uncommitted and provide a concise Chinese completion report.
