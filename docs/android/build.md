# Android build and packaging

A native, offline Chinese Sudoku client using Compose and the shared synchronous Rust core. Android-specific application and FFI sources live under `android/`; portable computation remains in `sudoku/core`. Commands below run from `android/`.

The Gradle project is named `sudoku-android`; the application ID and base Kotlin namespace are `dev.sudoku.app`. The player-facing Chinese name remains 一格一念. Builds with this application ID install separately from earlier package identities; transfer existing local progress through backup export and import.

Debug builds use application ID `dev.sudoku.app.debug` and launcher name 一格一念 Debug, allowing installation alongside release builds. Both variants keep the Kotlin namespace `dev.sudoku.app` and have separate local data.

## Build requirements

- JDK 21, the checked-in Gradle wrapper, Android SDK platform 37, and NDK `29.0.14206865`.
- The root `rust-toolchain.toml` toolchain and normal Cargo network/cache access.
- `ANDROID_HOME` set to the SDK, or a local `sdk.dir` in `android/local.properties`.

Run from `android/`:

```sh
./gradlew :core:domain:test
./gradlew qualityCheck :app:assembleDebug
./gradlew :app:assembleRelease
./gradlew :app:connectedDebugAndroidTest :core:data:connectedDebugAndroidTest :core:engine:connectedDebugAndroidTest
./gradlew :core:ui:connectedDebugAndroidTest :feature:game:connectedDebugAndroidTest :feature:learning:connectedDebugAndroidTest :feature:records:connectedDebugAndroidTest
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

## Installable artifacts

Debug APKs are `app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` and `app/build/outputs/apk/debug/app-x86_64-debug.apk`. Release APKs use the corresponding `app/build/outputs/apk/release/app-<abi>-release-unsigned.apk` names. Install the ABI matching the selected device; production release requires your own signing configuration.

When assembling instrumentation APKs, run that invocation separately from `qualityCheck` so lint does not race Hilt/KSP test-source generation. Use a dedicated emulator and set `ANDROID_SERIAL` to its actual serial before connected-test commands; direct ADB commands must also select it explicitly. Do not operate a personal emulator or physical device without authorization.

## Shared data and checks

Both clients consume `resources/lessons/catalogue.json`. Android's packaging gate runs the native teaching-content validation, then generates a lightweight directory and individual lesson assets. Runtime decoding does not repeat all mathematical proofs.

Backup interoperability tests use independent Web fixtures. To check actual device export/reimport, run the app's `BackupInteroperabilityTest`, pull `files/android-roundtrip-v1.json` from the debug app into `android/core/domain/build/interop/android-backup-v1.json`, then run from the repository root:

```sh
ANDROID_INTEROP_REIMPORT=1 pnpm exec vitest run --config android/interop/vitest.config.ts
```

Host tests and real device exports are distinct checks. CI performs host interoperability checks but does not run instrumentation. Release assembly, device runtime, accessibility, native-library alignment and physical-device performance are separate gates; a successful Debug build does not establish them.

See [architecture](architecture.md), [data loading](data-loading.md), [interface](interface.md) and [Android guidelines](../../android/AGENTS.md) for maintained implementation contracts. Keep generated files and local test output out of documentation.
