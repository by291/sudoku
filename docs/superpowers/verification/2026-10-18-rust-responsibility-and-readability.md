# Rust Responsibility and Readability Verification

Date: 2026-10-18. Baseline: `4cf692c`. Changes remain uncommitted.

Scope: the [approved design](../specs/2026-10-18-rust-responsibility-and-readability-design.md) and [implementation plan](../plans/2026-10-18-rust-responsibility-and-readability.md). This report records checks on the implementation, separately from the earlier read-only audit.

## Compatibility boundaries

- Preserve all generation/rating identities, 32-byte seeds, fixed allowances, random draw order, stable selection, complete evidence and work accounting.
- Tighten the native logical-workspace mutation API: read-only accessors, checked authored construction and fallible atomic action application. Action validity remains distinct from proof validity.
- Version the transient issue transport as WASM bridge 3 and native bridge 2. Keep historical string-shaped metadata decoding and persisted backup formats.
- Do not regenerate sealed expected fixtures, change the reference engine, add production dependencies or hand-edit generated bindings.

## Task evidence

Generation/rating refactoring passed 29 focused native tests, native/all-targets and wasm32 Clippy with warnings denied, scoped rustfmt and diff checks. Seven sealed native suites passed: generation 2,241; generation boundaries 152; layouts 190; screening 1,070; metadata 93; authored assessment 19; generated assessment 2,241. These 6,006 comparisons include overlapping coverage across suites and are not additional unique corpus inputs. An independent scoped review found no actionable issue.

Hint/logic refactoring passed all 84 core tests and 1,658 sealed native comparisons: advanced 72; logic 19; hints 19; hint chains 65; exact 144; prepared exact 1,320; assessment 19. The new workspace boundary tests first exposed accepted invalid authored state and a panic on malformed action input, then passed with atomic validation. Both core Clippy targets, rustfmt and diff checks passed. An independent review approved ownership, proof preconditions, action atomicity, detector order/work and exact-search priority/restoration.

Adapter extraction passed 8 native integration tests, native/all-targets and wasm32 Clippy, Rust formatting and focused browser-test TypeScript/lint/format checks. With freshly generated WASM, all 27 boundary tests passed across desktop/mobile Chromium and WebKit. Mask-before-length and historical metadata precedence regressions passed before and after extraction. An independent scoped review found no actionable issue.

Structured issue transport passed literal Message/duplicate/cage/thermo/arrow payload and presentation tests on both clients. Red-first tests exposed the old string transport, missing live parser, unsafe own `__proto__` key copying and an uncaught revoked-proxy array check; each now passes. The live parser catches reflective failures, preserves numeric/null distinctions and owns its result. Historical parsers remain unchanged. Independent review approved the complete cross-client delta without findings. `serde_json` was added only as a WASM test dependency.

Normal core dependency inspection found only BLAKE3 and ChaCha8/RandCore with their portable transitive dependencies; no browser, binding, async-runtime or OS-entropy dependency was introduced.

## Integration evidence

| Gate                                                                             | Result                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `cargo fmt --all --check`                                                        | Passed                                                           |
| `cargo test --workspace --locked`                                                | 94 passed, zero ignored                                          |
| Workspace native/all-targets Clippy and WASM/all-targets Clippy, warnings denied | Passed                                                           |
| `RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --locked`            | Passed                                                           |
| Complete sealed native migration                                                 | 5,742 comparisons passed                                         |
| Complete Chromium WASM migration                                                 | 4,262 comparisons passed                                         |
| Complete WebKit WASM migration                                                   | 4,262 comparisons passed                                         |
| Web type/lint/format checks                                                      | Passed                                                           |
| Web actual-WASM unit suite                                                       | 71 files, 817 tests passed                                       |
| Root and `/sudoku/` production builds                                            | Passed, including lesson validation                              |
| Android quality checks, debug app and engine instrumentation APK assembly        | Passed with serial Gradle execution                              |
| Android JVM tests included in the quality gate                                   | 82 passed, zero failures/errors/skips                            |
| Packaged `NativeAndroidContractTest`                                             | 4 passed on a task-owned API 37 arm64 emulator with 16 KiB pages |
| Web/Android backup interoperability                                              | Export passed; final reimport run passed both tests              |
| Full desktop/mobile Chromium and WebKit end-to-end suite                         | 485 passed, 40 existing device-condition skips, zero failures    |

Android instrumentation exercised native bridge identity, all six prepared variants and disposal, literal deterministic givens/work, independent cancellation and structured duplicate facts. It used only the temporary emulator, not the connected physical device. Host JVM checks are recorded separately from packaged Android runtime checks. The task-owned emulator was stopped and its temporary AVD removed afterward.

The final independent whole-change source review approved the implementation after correcting two stale bridge-version literals in the shared E2E Worker harness. The first full E2E run exposed those stale literals as Worker initialization failures and was stopped. Both handshake directions now use bridge 3; intentional old-version rejection tests remain intact. Three focused production Worker tests then passed, followed by the complete available-browser rerun recorded above. Its 40 skips are existing desktop-only layout/viewport/records checks in mobile projects; no additional check was skipped to obtain the pass.

The full E2E command was `PLAYWRIGHT_USE_PREBUILT=1 pnpm exec playwright test --project=desktop --project=mobile --project=webkit --reporter=line`; it completed with exit 0 in 5.6 minutes against fresh root and subpath production builds. The final core/WASM all-targets wasm32 Clippy command, documentation formatting/link review and `git diff --check` also passed. The independent final review has no unresolved actionable source findings.

The first Android parallel quality invocation failed while Spotless read a lint-generated `debug-artifact-dependencies.xml` concurrently with that lint task. The file subsequently existed. The complete gate passed with `--no-parallel --max-workers=1`; no check was disabled and no build configuration changed. Generated UniFFI/JNA/Gradle warnings remain outside the warning-free Rust Clippy/rustdoc gates.

Firefox boundary tests could not execute: browser startup reported `Could not find profile folder.` A scoped retry with `TMPDIR=/private/tmp` failed the same way. This environment limitation is not counted as passing browser coverage.

Sealed fixtures and the independent reference remain unchanged. Browser presentation projection preserves the historical string-shaped comparison contract; separate literal structured-field and rendering tests establish the new transport contract. No performance improvement or physical-device coverage is claimed from these correctness checks.
