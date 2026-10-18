# Android Client

A native, offline Chinese Sudoku client using Compose and the shared synchronous Rust core. Android-specific application and FFI sources live here; the portable computation remains in `../sudoku/core`.

The Gradle project is named `sudoku-android`; the application ID and base Kotlin namespace are `dev.sudoku.app`. The player-facing Chinese name remains 一格一念. Builds with this application ID install separately from earlier package identities; transfer existing local progress through backup export and import.

Debug builds use application ID `dev.sudoku.app.debug` and launcher name 一格一念 Debug, allowing installation alongside release builds. Both variants keep the Kotlin namespace `dev.sudoku.app` and have separate local data.

## Build requirements

- JDK 21, the checked-in Gradle wrapper, Android SDK platform 37, and NDK `29.0.14206865`.
- The root `rust-toolchain.toml` toolchain and normal Cargo network/cache access.
- `ANDROID_HOME` set to the SDK, or a local `sdk.dir` in `android/local.properties`.

Run from this directory:

```sh
./gradlew :core:domain:test
./gradlew qualityCheck :app:assembleDebug
./gradlew :app:assembleRelease
./gradlew :app:connectedDebugAndroidTest :core:data:connectedDebugAndroidTest :core:engine:connectedDebugAndroidTest
./gradlew :core:ui:connectedDebugAndroidTest :feature:learning:connectedDebugAndroidTest :feature:records:connectedDebugAndroidTest
for abi in arm64-v8a x86_64; do
  python3 scripts/check-native-alignment.py "app/build/outputs/apk/release/app-${abi}-release-unsigned.apk" --abi "$abi"
done
```

The engine build installs pinned cargo-ndk `4.1.2` into the ignored `.native-tools` directory when necessary, installs the two Rust Android targets, builds the host library and matching UniFFI generator, generates Kotlin bindings, and produces arm64-v8a and x86_64 libraries. Normal builds need no manual copying of native binaries. The first build needs network access; subsequent builds reuse Gradle and Cargo caches. Generated sources and binaries are not committed.

UniFFI 0.31.2 is configured for Android: its generated cleaner uses guarded SystemCleaner on API 34+ and the JNA fallback on lower APIs. The engine declares AndroidX annotations for the generated API boundary. Keep generated files disposable and change `ffi/uniffi.toml` rather than patching or suppressing generated code.

Native bridge version 2 transports live assessment issues as diagnostic messages or structured rule violations. `core/domain` owns the live result contract, `core/engine` converts generated bindings, and `feature/game` renders Chinese explanations or explicitly produces persisted issue strings. Stored `PuzzleAssessment` values and backup formats retain their historical string representation. Generation and rating identities remain unchanged.

The Rust adapter keeps metadata and edit conversion separate from exported operation dispatch. Prepared handles own immutable layouts, and returned results own their data. Cancellation tokens are sticky: after cancellation, use a fresh token for another operation, and retain the native handle until its in-flight call returns. Budget exhaustion is inconclusive, not an invalid puzzle or an empty solution set.

The app uses Gradle ABI splits: each debug and release build produces one self-contained APK per supported ABI, with no universal APK. Each APK includes only its matching Rust, JNA, and other native libraries.

For an Android App Bundle, run `./gradlew :app:bundleRelease -PsplitApksByAbi=false` separately: AGP resource shrinking cannot build a bundle with ABI APK splits enabled. That mode retains ABI filtering to exclude dependency libraries for unsupported architectures.

`./gradlew spotlessApply` formats authored Kotlin and Gradle sources; generated bindings are excluded. `qualityCheck` rejects unregistered modules and forbidden project edges, checks authored-source formatting, runs applicable JVM suites, and runs debug lint separately for app, engine, data, design, UI and all three features. Domain is a plain JVM module. The Android-local ktlint configuration separates function/class declarations while keeping related properties together; logical workflow paragraphs still require review. Instrumented tests require a functioning Android emulator or device and are separate from JVM checks. Use a disposable emulator rather than modifying a personal emulator.

## Ownership

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

The client supports the same six variants and 19 variant/difficulty combinations as Web. Daily identities use Beijing calendar dates and the shared v11 byte-seed recipe. Both clients consume `../content/lessons/catalogue.json` for the 32-course catalogue. All Sudoku mathematics, including edits and teaching evidence, runs in Rust.

## Portable data

Room stores player collections locally. Import and export use the system document picker and the existing [Web backup contract](../docs/local-backup.md). Import replaces all portable collections after preview and confirmation; it does not merge results or regenerate puzzles. Backgrounding pauses play, and process restoration requires explicit resume.

The approved [design](../docs/superpowers/specs/2026-10-16-android-client-design.md) and [implementation plan](../docs/superpowers/plans/2026-10-16-android-client.md) describe parity and verification requirements. Release evidence belongs in `docs/` here, with unavailable device or ABI checks reported explicitly.

The [2026-10-18 responsibility and readability report](docs/verification/2026-10-18-responsibilities.md) records this audit's checks and limitations. The [2026-10-17 report](docs/verification.md) preserves historical release runtime checks, native timings and screenshots; those results are not a rerun of the current working tree. The directly installable debug APKs are `app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` and `app/build/outputs/apk/debug/app-x86_64-debug.apk`. Install the one matching the device ABI (`adb shell getprop ro.product.cpu.abi`). Release assembly produces `app/build/outputs/apk/release/app-arm64-v8a-release-unsigned.apk` and `app/build/outputs/apk/release/app-x86_64-release-unsigned.apk`; production distribution requires your own signing configuration. A temporary locally signed verification copy is not a production release identity.

The repository Android workflow runs quality checks, debug and release assembly, and complete native-library/APK alignment checks. Release assembly is a separate Gradle invocation from debug/lint checks. Instrumented device coverage remains a separate gate.

Game session transitions and entry reads have separate owners. Records keeps query/filter state independent of document backup state, while learning publishes advancement only after a durable save. Storage owns compact projections, coverage, migrations and detail repair; presentation never establishes mathematical validity. Unknown, unavailable and stale results remain explicit.

Features expose Route entry points and keep ViewModels/screens internal. They depend on contracts and shared presentation, never sibling features, app, Room, or generated native bindings. The module dependency check enforces this boundary. The structure follows the broad ownership principles of `sctv-dl/android`, with Sudoku-specific engine/session/content ownership.
