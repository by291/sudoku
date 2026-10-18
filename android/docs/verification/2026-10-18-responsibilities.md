# Android responsibility and readability verification

Date: 2026-10-18. This report records the verified Android responsibility/readability audit implementation. It supplements the [2026-10-17 historical report](../verification.md); historical release checks, measurements, screenshots and physical-device limitations remain attached to their original date.

## Implemented boundaries

The audit preserves Rust-only computation, backup v1/session v2, v11 identities, seeded outputs, finite budgets and original completion facts. App remains the composition/navigation owner; features retain complete player workflows behind domain/presentation contracts.

- Storage separates compact reads, coverage, projection validation, legacy maintenance, selected-detail repair and schema migration. Invalid projections cannot establish completion facts, and inconclusive native execution cannot authorize quarantine.
- Native execution distinguishes conclusive invalid input from unavailability. Prepared-handle ownership survives cancellation until execution actually returns.
- Game entry queries are separate from the session coordinator. A disposed session owner cannot retain a late installed handle/editor token. Shared settings updates preserve unrelated fields.
- Records query/filter state and document backup state have independent owners. Learning distinguishes unknown progress from zero and publishes advancement only after durable persistence.
- Controlled game/lesson presentation owns keyboard dispatch and layout, with feature owners handling business operations. Cohesive board geometry, teaching data and layout remain together.

Local Room schema 3 and projection marker 3 make the tightened summary contract explicit. The registered 2-to-3 migration adds versioned coverage metadata and the daily ordering index with narrow DDL; it preserves canonical payloads and backup v1/session v2. Index creation walks compact result rows once. Old coverage becomes pending and triggers a versioned, one-time cancellable projection backfill outside schema migration; selected validation can repair records before that maintenance finishes. These costs do not add a global startup JSON decode or native-validation scan.

Daily statistics iterate indexed compact rows in bounded batches of 128 and reuse the shared `Asia/Shanghai` calendar policy, including accepted historical daylight saving. This avoids a second fixed-offset SQL timezone policy. Daily work scales with relevant summary rows while memory stays bounded; free-play bests remain SQL aggregates. Canonical payloads and native computation are outside these statistics reads.

Authored Kotlin was checked for declaration spacing, workflow paragraphs, visibility, unnecessary wrapping and public ownership comments. Remaining focused edits simplify board evidence drawing, short conditions, session history expressions and document decoding; existing contract suites cover these behavior-preserving edits. No mathematical fixture was regenerated.

## Quality gates and generator configuration

`qualityCheck` checks every registered Android module's debug lint: app, engine, data, design, UI, game, learning and records. Domain is a plain JVM module. The module gate rejects unregistered projects, forbidden dependencies and structural container projects promoted into implemented Android/JVM modules. The included build-logic project remains separately owned.

The Android-local `.editorconfig` explicitly enables `standard:blank-line-before-declaration` in installed ktlint 1.7.1. A temporary source probe with adjacent functions passed under the previous configuration, then failed with the enabled rule: the proposed diff inserted one blank line between properties and functions and between functions, while preserving adjacent properties. The probe was removed. Logical stages still require human review.

Expanded lint first exposed generated `java.lang.ref.Cleaner` NewApi errors for minSdk 26. Installed UniFFI 0.31.2 supports `android = true` and `android_cleaner = true`; generated code now selects guarded API 34+ SystemCleaner and JNA on lower APIs. AndroidX annotations 1.10.0, already resolved in this build environment, is declared explicitly for generated `RequiresApi`. JNA stays pinned at 5.18.1 and uses the catalog with explicit AAR artifact selection. Generated bindings were regenerated normally; no generated code, lint suppression or native algorithm changed.

The API review used the [official UniFFI configuration documentation](https://mozilla.github.io/uniffi-rs/next/kotlin/configuration.html), checked against the installed 0.31.2 configuration structure and Android cleaner template. The [ktlint declaration-spacing documentation](https://ktlint.github.io/ktlint/latest/rules/standard/#blank-line-before-declarations) was checked against actual installed 1.7.1 behavior. Gradle artifact selection follows [official dependency documentation](https://docs.gradle.org/current/userguide/declaring_dependencies.html#sec:dependency-with-classifier).

## Current host and build results

Run Android commands from `android/`. Instrumentation APK generation is separate from the quality invocation:

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest :core:engine:assembleDebugAndroidTest :core:ui:assembleDebugAndroidTest
./gradlew qualityCheck :app:assembleDebug
```

Both invocations passed after the configuration change. After the cumulative learning-directory fixes, the final quality gate passed with 107 JVM tests, no failures, errors or skips:

| Module           | JVM tests |
| ---------------- | --------: |
| app              |         3 |
| core/domain      |        23 |
| core/engine      |        14 |
| feature/game     |        35 |
| feature/learning |        19 |
| feature/records  |        13 |

`core/data:testDebugUnitTest` has no JVM test sources; actual Room behavior is covered by instrumentation below. Engine JVM tests load the regenerated bridge and host native library; Android's mock SDK level exercises the generated JNA fallback.

All eight Android lint gates passed without errors. Remaining warnings concern pinned dependency updates and application icon/backup configuration. The audit also removed production defaults that called test-oriented `SavedStateHandle` constructors, reordered an optional Compose modifier and replaced a split Chinese label with one interpolation while preserving its exact text. No check was disabled and dependencies were not upgraded to silence warnings.

Negative verification used temporary Gradle init scripts, without changing registered source modules:

| Probe                                    | Observed result                                               |
| ---------------------------------------- | ------------------------------------------------------------- |
| Extra `:verificationProbe` project       | Failed: `Unregistered Android modules: :verificationProbe`    |
| `:core` container applies `java-library` | Failed: `Unregistered Android modules: :core`                 |
| game adds a project dependency on data   | Failed: `Forbidden dependencies: :feature:game -> :core:data` |
| Missing declaration blank lines          | Spotless failed with the expected spacing diff                |
| Normal final tree                        | All gates passed                                              |

The first combined invocation generated instrumentation APKs while app lint read Hilt/KSP test sources. Lint failed with a missing generated `HomeStartupTest` Java file. Separate APK generation completed, then the exact `qualityCheck :app:assembleDebug` invocation passed. This was a build-tool source-generation race; no production workaround or suppression was added.

From the repository root:

```sh
cargo test -p sudoku-core -p sudoku-ffi --release --offline
cargo clippy -p sudoku-core -p sudoku-ffi --all-targets --offline -- -D warnings
cargo fmt --all -- --check
cargo tree -p sudoku-core --edges normal --offline
```

The native release suites passed 93 tests with no failures. Clippy and formatting passed. The normal core dependency tree contains only mathematical/random/hash dependencies; no Android, UniFFI, browser or async-runtime dependency entered the portable core. Both debug ABI APKs also passed 16 KB ELF and ZIP alignment for every packaged native library: Rust, JNA and AndroidX graphics path. The binding configuration changed only Android Kotlin generation; Web/WASM runtime and release packaging checks were not rerun for this audit.

## Current device and interoperability evidence

The parent task owns device execution and records results from actual instrumentation counts. All current device runs use explicitly disposable AVDs under a temporary AVD home; personal emulators and physical devices are outside this audit.

Earlier stages of this audit verified these affected boundaries on disposable API 37.2 arm64-v8a emulator-5580:

| Boundary                 | Passing tests | Scope                                                             |
| ------------------------ | ------------: | ----------------------------------------------------------------- |
| Room data                |            27 | Settings isolation, summary repair, fences and typed pagination   |
| Game entry               |            16 | Sheet workflows and pending/error states                          |
| App player workflows     |            22 | Pause, ownership, navigation and shared operations                |
| Controlled game input    |             3 | Keyboard/touch ownership                                          |
| Learning                 |            11 | Unknown progress, durable advancement and layout                  |
| Records final review fix |            13 | Query and backup isolation, retry state                           |
| App final review fix     |             3 | Backup toolbar/Back, retained filters and actual interoperability |

A full app suite passed 33 tests before the focused records review fix, followed by the affected three-test app rerun above. Actual Web-to-Android import and Android-to-Web reimport passed two Vitest tests. The Android export was pulled into `android/core/domain/build/interop/android-backup-v1.json`; the original Web fixture remained unchanged:

```sh
ANDROID_INTEROP_REIMPORT=1 pnpm exec vitest run --config android/interop/vitest.config.ts
```

The parent verified the regenerated-cleaner APKs on the modern device and a separate API 29 arm64-v8a disposable emulator-5582:

| Final packaged boundary                      | Device                  | Result             |
| -------------------------------------------- | ----------------------- | ------------------ |
| Native contract                              | API 37.2, emulator-5580 | 4 passed, 0.171 s  |
| Native contract, JNA fallback                | API 29, emulator-5582   | 4 passed, 0.093 s  |
| Controlled board, notes and number input     | API 37.2, emulator-5580 | 7 passed, 10.431 s |
| App native/backup integration, final cleanup | API 37.2, emulator-5580 | 3 passed, 5.086 s  |

These results are from actual instrumentation output. After the final constructor and source-readability cleanup, the parent separately rebuilt the app test APK and reran the three app native/backup integration tests successfully in 5.086 seconds. Its actual export was pulled again into `android/core/domain/build/interop/android-backup-v1.json`; the two Web reimport tests passed again with the original Web fixture unchanged. This runtime evidence is distinct from native host tests and historical release evidence.

## Cumulative learning-directory regression fixes

The final cumulative review found two missing learning-directory boundaries. The owner now retains the latest observed dataset epoch independently of nullable presentation state, invalidates unknown-state requests on replacement, and checks that fence before publishing a successful read. A deterministic JVM regression holds delivery of an old final epoch read, emits a replacement while progress is unknown, then releases the old result. It verifies that old completion/cursor/recommendation facts never reappear, a failed replacement read stays unknown, and explicit retry loads the new dataset. The test was observed failing before the fix and passes in the final 19-test learning JVM suite, bringing the configured total to 107.

The unrelated fixed 156 dp suggestion placeholder was replaced with a shared measured reservation for the current course's authored cards at the actual width/font scale. Supported Compose `Layout` measurement bounds every permitted caption/stage/action presentation while sharing the real card body and typography. Sizing children use static authored content, have no controls or personal facts, have cleared semantics and are never placed. Only a known recommendation creates its actual Material Button; no hidden focusable action or fabricated personal recommendation is used for measurement.

Before the layout fix, two parent-owned device regressions failed: course-heading top shifted approximately 51.05 dp at normal font scale and 190.1 dp at scale 1.8 after delayed progress delivery. The tests keep both target rows composed so lazy scroll anchoring cannot hide movement, and compare heading position/height plus the entire first lesson container. They exclude the heading text's right edge because the separate progress-label copy legitimately changes that weighted text width. Unknown recommendation actions remain absent from semantics.

Final commands, from `android/`:

```sh
./gradlew spotlessApply :feature:learning:testDebugUnitTest :feature:learning:assembleDebugAndroidTest :app:assembleDebug :app:assembleDebugAndroidTest
./gradlew qualityCheck :app:assembleDebug
```

Both pass, including all eight Android debug lint gates. On disposable API 37.2 arm64-v8a `emulator-5580`, the rebuilt full Learning suite passes **13 tests in 25.669 seconds** and the two affected app flows pass **2 tests in 5.199 seconds**: `PlayerWorkflowTest#opensBundledLessonsWithoutRuntimeMathematicalValidation` and `PlayerWorkflowTest#opensEveryWorkflowFromHomeAndReturnsWithoutTabNavigation`. Device RED is recorded in `/tmp/sudoku-android-final-learning-red.log`; final GREEN output is in `/tmp/sudoku-android-final-learning-green.log` and `/tmp/sudoku-android-final-learning-app.log`. These affected-source checks supplement the earlier stage-specific results above; elapsed test-suite times are not a startup or rendering benchmark.

## Final review

Each implementation area received an independent review. The cumulative review identified the two learning-directory issues documented above; both were fixed with observed failing regressions and passed a scoped independent re-review. No review finding remains open. The two disposable AVDs were stopped and their task-owned temporary files removed after verification.

## Limits

No physical-device performance, TalkBack acceptance, release/minification rerun, new timing distribution, hosted CI execution or x86_64 runtime claim is made. The 2026-10-17 release/alignment observations remain historical. This report records focused behavior and ownership verification, not a new end-to-end startup performance comparison.
