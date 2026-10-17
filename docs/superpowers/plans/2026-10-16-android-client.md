# Android Client Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent implementation units and superpowers:executing-plans for integration. Track steps with checkboxes. Commit only task-owned changes when explicitly authorized; do not push or discard existing work.

**Goal:** Deliver a native offline Android client with the existing Web feature set, shared Rust computation, and compatible backup files.

**Architecture:** Keep all Android-specific sources under `android/`, including the UniFFI adapter. Kotlin owns player workflows and Room persistence; generated bindings call the existing synchronous Rust core. The Web adapter remains independent.

**Tech Stack:** Kotlin, Compose Material 3, lifecycle ViewModels/StateFlow, coroutines, Navigation 3, Hilt, Room/KSP, Kotlin serialization, Rust, UniFFI/JNA, cargo-ndk, Gradle.

**Spec:** [Android Client Design](../specs/2026-10-16-android-client-design.md).

## Global constraints

- Preserve the existing uncommitted Rust/WASM changes; work on the current feature branch and exclude existing edits from task-owned commits.
- Put Android application, modules, scripts, generated build outputs, and FFI sources under `android/`; core remains `sudoku/core`.
- English documentation, identifiers, and comments; Chinese player copy.
- Six variants, 19 supported variant/difficulty combinations, 32 stable courses, and current v11 seed identities.
- Core remains synchronous and host-independent. Do not change successful random/work/result contracts or lower finite allowances.
- Minimum SDK 26; arm64-v8a device and x86_64 emulator libraries; inspect complete release packaging for 16 KB support.
- All FFI calls are main-safe. Cancellation, timeout, exhaustion, failure, and completion remain distinguishable.
- One Room transaction replaces sessions, results, lessons, and portable settings, with epoch and revision fencing.
- Backups retain version 1 and existing byte/record/history/depth/traversal limits and original player facts.
- Generated sources are ignored and regenerated; no Kotlin Sudoku algorithms, WebView, or handwritten pointer bridge.

## Review focus

- Rapid edits followed by an old candidate/hint result must preserve the latest board and assistance facts.
- Backgrounding or process recreation must stop running time and restore a paused committed session.
- Cancel or timeout during native arithmetic/search must release work promptly without unsafe thread termination.
- Import with pending saves must atomically replace the dataset and reject every stale write.
- Cross-platform JSON must retain legacy metadata, exact timestamps, both history stacks, and original daily results.

## File and interface map

`android/core/domain` owns plain Kotlin contracts in `dev.sudoku.app.model`: explicit `Variant`, `Difficulty`, `PuzzleRules`, `Puzzle`, session layers/history/assistance/metadata, engine outcomes, learning values, repository contracts, and portable codecs. `android/core/engine` implements the narrow engine contract and owns generated UniFFI objects. `android/core/data` implements the repository over Room. `android/core/ui` renders controlled model values. `android/app` composes these owners and typed navigation; `feature/game`, `feature/learning`, and `feature/records` own internal ViewModels/screens and public Route entry points. Generic themes live in `core/design`; common Android/Compose/Hilt/feature defaults live in `build-logic`.

Shared engine interfaces are `SudokuEngine`, `PreparedPuzzle`, `EngineOutcome<T>`, `BoardEdit`, `EditResult`, `HintResult`, and `BoardMetadata`. Engine methods prepare rules, generate from variant/difficulty/32-byte seed, derive seed material, validate saved mathematical content, and expose information. A prepared handle edits owned layers, computes candidates/conflicts/completion, reviews entries, and supplies structured logical hints. Generation returns a puzzle plus optional validated assessment. The model implementation publishes exact signatures before consumers are written.

`GameRepository` provides validated session/result/settings/progress reads, ordered revision/epoch checked saves, dataset snapshots, and replacement. Mathematical validation is injected; storage never imports app or engine implementation. `GameController` consumes engine and repository contracts and exposes immutable state with named player operations.

## Tasks

### Task 1: Buildable Android foundation

**Files:** Create `android/{settings.gradle.kts,build.gradle.kts,gradle.properties,gradlew,gradle/wrapper,gradle/libs.versions.toml}`, module build scripts, `android/AGENTS.md`, and `android/README.md`; update root ignore rules.

**Interfaces:** Produces the core and feature modules, pinned dependency aliases, Android SDK settings, JVM toolchain, generated Rust task locations, and `qualityCheck`.

- [x] Resolve compatible pinned versions against installed tools and official documentation; use AGP built-in Kotlin and KSP.
- [x] Configure model JVM tests, Android tests, formatting, and explicit module directions.
- [x] Run Gradle configuration and model compilation; record missing prerequisites explicitly.

### Task 2: Controlled Rust calls and typed UniFFI adapter

**Files:** Create `android/ffi/{Cargo.toml,src,tests,uniffi.toml}` and binding generator; modify workspace membership, controlled core call boundaries, and focused cancellation tests.

**Interfaces:** Produces typed UniFFI operations for all six rule shapes, prepared metadata and edits, candidates/conflicts, validation, hints/evidence, assessment, generation, seed derivation, and separately versioned engine information. Produces a cancellation token whose signal does not wait for the computing call.

- [x] Write and run failing native tests for bad board/seed/rule shapes, a literal Classic edit/candidate fixture, exhaustion, and cancelled generation/search restoration.
- [x] Implement checked DTO conversion and cooperative core cancellation without successful-path accounting/random changes.
- [x] Run adapter/native contracts, rustfmt, native/all-target Clippy and wasm32 Clippy with warnings denied; rebuild WASM and run relevant existing consumers.
- [x] Generate Kotlin from the built native library and compile it. Keep library and generator versions identical.

### Task 3: Portable models, durable repository, and session semantics

**Files:** Create Kotlin source/tests under `android/core/domain` and `android/core/data`, including explicit portable schema, validation, Room entities/DAOs/database, backups, clock/session helpers, and repository implementation.

**Interfaces:** Produces the exact model/engine/repository contracts used by Tasks 4–6 and serializable Web-compatible snapshots. Publish contracts early to other implementers.

- [x] Write failing tests for all 19 combinations, daily formal IDs, assistance permanence, undo/redo facts, millisecond instants, surrogate text, and invalid history chains.
- [x] Implement codecs against actual Web record shapes, including supported legacy normalization, strict current seeds, optional assessments, bounded traversal, and separate unavailable validation.
- [x] Write failing tests for stale revision/epoch saves, replacement rollback, original completion retention, and ordered writes; implement Room ownership and backup transactions.
- [x] Run JVM model/storage tests and Room instrumented tests when an emulator is available.

### Task 4: Main-safe native engine and session controller

**Files:** Create `android/core/engine/src`, native Gradle tasks and scripts, `android/feature/game/.../GameController.kt`, and focused coroutine/lifecycle tests.

**Interfaces:** Consumes Task 2 exports and Task 3 contracts; produces `RustSudokuEngine` and the state/action owner consumed by Compose.

- [x] Write failing actual-native binding tests for information, byte seeds, prepared ownership, six variants, invalid inputs, and explicit close.
- [x] Implement typed mapping, immutable snapshots, bounded execution lanes, native cancellation/deadlines, and independent handle lifetimes.
- [x] Write failing tests for rapid edits, stale notes/hints, save-before-switch, elapsed-time settlement, background pause, and dataset replacement; implement the controller without a second solver or optimistic board algorithm.
- [x] Run JVM/coroutine tests and actual native/Android contract checks.

### Task 5: Shared course catalogue

**Files:** Create schema-validated `content/lessons` data and Android learning contracts/loader; adapt existing Web learning construction and add extraction/equality checks without changing the sealed reference.

**Interfaces:** Produces all 32 stable course IDs and complete stage/example/evidence/answer/Chinese-copy data consumed by both clients. Rust continues to validate mathematical evidence.

- [x] Pin current course IDs, stage counts, authored answers, and evidence preconditions with existing independent course proofs before extraction.
- [x] Extract authored content and permitted transformation descriptors, preserving order and provenance; implement Android course loading and cursor behavior.
- [x] Run Web course tests and Kotlin course catalogue tests; report computed-content reuse as shared presentation evidence, never an independent mathematical oracle.

### Task 6: Complete native player interface

**Files:** Create application bootstrap/DI, typed navigation, home/game/daily/learning/records/settings screens, controlled board and clue drawing, number pad, hints, dialogs, and UI tests under `android/app` and `android/core/ui`.

**Interfaces:** Consumes the model contracts, repository, engine, controller, and course catalogue. Produces the complete Chinese player workflow.

- [x] Exercise observable start/resume/setup behavior, protected givens, selection, tools, pause, completion, daily status, lessons, records, and backup preview in Compose tests.
- [x] Implement semantic cells and all six clue overlays, keyboard ownership, modal focus, 3-by-3 compact number input, theme tokens, adaptive layout, and zoomed inspection.
- [x] Integrate document picker export/import and confirmed clear with real repository snapshots and persistent recovery feedback.
- [x] Run lint, formatting, unit tests, Compose instrumented flows, and assemble debug/release; inspect screenshots on phone and expanded windows.

### Task 7: Interoperability and release verification

**Files:** Add actual FFI/WASM corpus and Web/Android backup fixtures/checks, CI Android job, build documentation, and a verification report under `android/docs`.

**Interfaces:** Produces a packaged client, repeatable build/check commands, and evidence for every parity row in the approved spec.

- [x] Verify all 19 combinations and six daily identities across real FFI/WASM outputs while retaining independent literal oracles.
- [x] Round-trip actual Web backups through Android and back; exercise interrupted, oversized, malformed, legacy, and epoch-conflicting restoration.
- [x] Run native and Web gates after shared changes, Android quality/build gates, release FFI smoke tests, and complete `.so`/APK 16 KB alignment checks.
- [x] Measure cold/warm native calls, hard arithmetic, near-exhaustion, cancellation latency/queue drainage, and repeated handle memory on the available Android runtime.
- [x] Perform independent code review, fix material findings, and record exact outstanding device/ABI evidence. Do not mark unavailable hardware checks as passing.

## Architecture steering on 2026-10-17

The user requested the broad `sctv-dl/android` structure without copying its product-specific divisions. Application composition remains in app; models/data/native/design/UI are core owners; game, learning, and records are independent feature owners. Free/daily play share one game workflow, and portable player collections stay one atomic persistence owner. Public feature Route entry points use immutable `GameLaunch` values; internal screens/ViewModels do not import siblings or implementation modules. Preserve completed FFI/storage/course behavior while moving modules, and rerun module, native, JVM, and instrumented checks.

## Delivery evidence on 2026-10-17

All implementation tasks are delivered. See [Android verification](../../../android/docs/verification.md) for exact gate results, runtime measurements, screenshots, and the remaining hardware acceptance matrix. Checkmarks record implementation and available verification, not unobserved physical-device acceptance. Native, Room, Compose, backup interoperability, minified release, and 16 KB emulator checks ran. Physical touch/TalkBack, minimum-API and x86 runtime, physical-device frame/memory/cancellation measurements, and hosted CI remain outstanding evidence.

The expanded-window board clipping was reproduced in an observable instrumentation test, then fixed by reserving footer space from finite viewport height before entering the scroll container. The application suite passes on both compact and expanded windows. The user subsequently authorized grouped local commits of task-owned changes. Pre-existing Rust/Web work remains outside those commits; no push was authorized.
