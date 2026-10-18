# Android implementation verification

For current responsibility/readability audit evidence, see the separate [2026-10-18 report](verification/2026-10-18-responsibilities.md). The results below are historical and do not establish verification of later working-tree changes.

Date: 2026-10-17. Verification used the shared feature checkout before task-owned changes were committed in groups. Pre-existing changes from other work remain uncommitted.

## Delivered boundaries

The native client lives under `android/`, including the UniFFI adapter. It uses Compose, Navigation 3, Hilt, Room, and generated Kotlin bindings over `sudoku/core`. Features depend on domain and presentation contracts; app composes implementations. Gradle checks project dependency directions. This follows the broad app/core/feature structure of the reference Android project while keeping Sudoku's engine, session, teaching, and atomic backup responsibilities explicit.

| Player area          | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variants             | Six explicit rule shapes and all 19 supported variant/difficulty combinations. Native corpus tests compare complete generation results and work with sealed independent fixtures; packaged Android measurements check all 19 puzzles and work charges.                                                                                                                                    |
| Free play            | Confirmed setup, per-variant saves, explicit continuation, native edits, notes, undo/redo, assistance, hints, restart, and completed results. Controller tests cover stale ownership, ordered saves, and cancellation during committed replacement. App tests exercise paused continuation, protected setup, native entry and completion.                                                 |
| Daily play           | Beijing-date formal identities, shared Rust byte-seed derivation, six variant entries, formal/replay separation, original results, and cumulative unfinished-attempt facts. Model tests cover date boundaries and identity semantics; record tests cover streak and assisted/unassisted summaries.                                                                                        |
| Learning             | One authored catalogue shared with Web: 32 stable courses and 84 stages. Independent answer/proof fixtures remain test-only. Kotlin tests cover cursor restoration, explicit progression, retries, wrong answers, and original completion facts. Android exercise and real release-guide checks pass; seven Web browser tests include every course/stage and full-board practice handoff. |
| Records and recovery | Variant filtering, retained primary navigation state, bests/streaks, save retry, confirmed clear, and bounded document import/export. Compose tests check safe modal focus and backup preview; actual Room tests check rollback and stale writer/epoch fences.                                                                                                                            |
| Portable data        | Existing version-1 backup envelope and supported legacy records; exact millisecond timestamps, surrogate metadata, histories, assessments, assistance, cursors, and original daily results. Actual Web export goes through Android Room/native validation and Android export goes through the actual Web decoder/replacement transaction.                                                 |
| Presentation         | Paper/teal/blue-gray light theme, dark/system themes, semantic cells and six clue overlays, keyboard entry, three-by-three number input, reflowing tools, explicit zoom, and adaptive game/navigation layouts. Screenshots below are emulator evidence.                                                                                                                                   |

## Repeatable checks and observed results

Run Android commands from `android/` with JDK 21 and `ANDROID_HOME` configured. Run release assembly separately from the debug/lint invocation so lint and KSP do not race over generated release caches.

```sh
./gradlew :app:assembleDebugAndroidTest
./gradlew qualityCheck :app:assembleDebug
./gradlew :app:assembleRelease
for abi in arm64-v8a x86_64; do
  python3 scripts/check-native-alignment.py "app/build/outputs/apk/debug/app-${abi}-debug.apk" --abi "$abi"
  python3 scripts/check-native-alignment.py "app/build/outputs/apk/release/app-${abi}-release-unsigned.apk" --abi "$abi"
done
```

`qualityCheck` passed: dependency directions, Spotless, Android lint, and 50 JVM tests (domain 20, engine 5, game 14, learning 6, records 5), with no failures or skips. Native-host tests use the actual generated bridge. Coroutine tests include pausing or leaving while a replacement commit is suspended, so a completed commit cannot silently restart the timer.

These results describe the full verified working tree. The FFI adapter uses the pre-existing Rust `PreparedRules::metadata_ref` interface, which belongs to separate uncommitted Rust work and is deliberately excluded from the Android commits. A clean checkout of only the Android commits therefore requires that prerequisite from its owner; standalone verification of that reduced tree is not claimed.

Instrumented suites ran on the task-owned `sudoku-room-verification` AVD: Android 17 / API 37.2, arm64-v8a, measured 16,384-byte pages. A private ADB server and an explicit device serial avoided unrelated emulators. Results were checked from test XML or the actual instrumentation `OK (N tests)` output, rather than inferred from Gradle's process exit alone.

| Instrumented boundary                             | Passing tests |
| ------------------------------------------------- | ------------: |
| Actual Room repository                            |             7 |
| Packaged native contracts                         |             3 |
| Native measurements, run alone in a fresh process |             1 |
| Controlled board and number input                 |             4 |
| Learning guide/exercise                           |             1 |
| Records preview and safe modal focus              |             2 |
| Application workflow and actual backup transfer   |             6 |

Board and number-pad tests also passed at 1.5 system font scale. The expanded-board regression was reproduced against the prior layout before its fix. The same observable viewport test runs on both compact and expanded windows.

From the repository root:

```sh
cargo test --workspace --release --offline
cargo clippy -p sudoku-core -p sudoku-ffi --all-targets --offline -- -D warnings
cargo clippy -p sudoku-core -p sudoku-wasm --target wasm32-unknown-unknown --offline -- -D warnings
pnpm test:unit
pnpm exec vue-tsc --noEmit -p tsconfig.app.json
pnpm exec vue-tsc --noEmit -p tsconfig.test.json
pnpm exec tsc --noEmit -p tsconfig.e2e.json
pnpm exec eslint .
```

Rust formatting, workspace release tests, both Clippy targets, and the normal core dependency tree passed review. Core has no Android, UniFFI, browser, async runtime, clock, or entropy dependency. Rebuilt-WASM Web unit tests passed: 55 files / 598 tests. Following the Node JSON-import integration fix, all three TypeScript configurations and 47 focused course/proof tests passed again. A rebuilt production Web app passed all seven desktop learning/navigation Playwright tests. No sealed mathematical expected output was regenerated from Rust.

The interoperability Vitest configuration is independent of the normal Web test glob:

```sh
ANDROID_INTEROP_REIMPORT=1 pnpm exec vitest run --config android/interop/vitest.config.ts
```

Both tests passed using an actual Android-device export. The fixture carries 19 sessions and 20 results, with all modes, both history stacks, legacy text, optional assessments, lesson cursors and original result facts. Revision rebasing to 1 is the deliberate restore normalization. File-provider unit tests cover unknown lengths, byte limits, invalid UTF-8 and failed output; Room tests inject transaction failure and replacement races. These are different evidence from a real cloud document provider outage.

Full ESLint passed. Task-owned Markdown, JSON, TypeScript and YAML formatting passed. The whole-repository Prettier check still flags the pre-existing, unrelated `docs/superpowers/verification/2026-10-16-rust-idioms-and-performance.md`; that file was preserved.

## Native runtime observations

Raw observations, device fingerprint, work charges and interpretation are saved in [native-metrics.json](verification/2026-10-17/native-metrics.json). Production work allowances and deadlines were unchanged.

| Operation                                                        | Observed emulator result                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| First native information call in a fresh instrumentation process | 29.020 ms                                                                                  |
| Five warm information calls                                      | Median 1.488 ms; maximum 3.157 ms                                                          |
| First/warm generation across 19 combinations, 38 calls           | Median 3.091 ms; maximum 24.990 ms                                                         |
| Hard Killer arithmetic fixture                                   | 0.456 ms; 3,823 charged work units                                                         |
| Near-exhaustion exact-search fixture                             | 0.578 ms; 37,074 / 37,074 caller-budget units                                              |
| Independently signalled native cancellation, three valid samples | 0.269–0.340 ms from signal to native return; each sample had already charged positive work |
| Cancelled analysis queue to next prepared result                 | 2.515 ms                                                                                   |
| Fifty prepare/close cycles                                       | 66.106 ms; process-wide allocated native heap delta +140,240 bytes                         |

The heap delta includes every native allocation in the process; it is an observation, not proof of no leaks. Fast emulator samples are not physical-device performance acceptance. Exact fixture equality reuses independent evidence and establishes adapter agreement, not a new independent mathematical proof.

Both debug and minified release APKs passed ELF `LOAD` alignment and APK ZIP alignment for **every** packaged library: Rust, JNA, and AndroidX graphics path, each for arm64-v8a and x86_64. The minified release was locally signed with a temporary verification key and actually installed and cold-started on the 16 KB emulator. Native generation, candidates, keyboard input, save/leave, and shared lesson loading were exercised. Android reported a 389 ms cold activity start in that run; this is one emulator observation.

Current builds use ABI splits: `app-arm64-v8a-debug.apk` and `app-x86_64-debug.apk` are directly installable. The corresponding `app-<abi>-release-unsigned.apk` files require a release signing configuration. Historical filenames in the package manifest describe that earlier run. The temporary verification signature is not a production identity. CI is configured to run Android quality/build/alignment checks and upload APKs; a hosted CI execution has not been observed in this task.

Exact APK sizes and SHA-256 hashes are recorded in [packages.json](verification/2026-10-17/packages.json). The temporary signing key, private ADB server, and task-owned AVD were removed after verification; the APKs and evidence remain available.

## Visual evidence

Screenshots show the final locally signed minified release, rather than a mockup:

- [Compact home](verification/2026-10-17/phone-home.png), [Classic with candidates](verification/2026-10-17/phone-game.png), and [Killer clues](verification/2026-10-17/phone-killer.png): 360 × 800 dp.
- [Shared lesson guide](verification/2026-10-17/phone-lesson.png): a scrolling lesson with authored explanations and semantic evidence.
- [Expanded game](verification/2026-10-17/expanded-game.png) and [expanded navigation](verification/2026-10-17/expanded-home.png): 1280 × 800 dp.
- [Dark theme and enlarged text](verification/2026-10-17/dark-large-text.png): compact window with 1.5 font scale; tools reflow and [all nine digits remain reachable after scrolling](verification/2026-10-17/dark-large-text-controls.png). Board glyphs scale with cell geometry to preserve clue/value separation; zoom enlarges the board while surrounding copy follows the system font scale.

## Outstanding hardware and acceptance evidence

Implementation and available automated/runtime checks are delivered. The full hardware acceptance matrix in the design is not claimed complete: physical touch/TalkBack, predictive Back gesture animation, minimum-API-26 runtime, x86_64 runtime, physical-device cancellation/frame/memory measurements, long-running leak analysis, abrupt process-kill durability, and real cloud document-provider failures remain unverified. Semantic tests and emulator UI operation do not replace those checks. The task-owned emulator is removed after verification; personal AVDs and unrelated devices are left untouched.
