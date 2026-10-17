# Bundled lesson validation and board rendering

Date: 2026-10-17

## Change

The Android catalogue is a fixed packaged asset. `core:data:preBuild` now depends on `core:engine:validateLearningContent`, which runs the host engine tests against the exact `content/lessons/catalogue.json` used by asset packaging. The catalogue is a declared test input, so edits invalidate the check. All 32 lessons and 84 stages must decode and pass the actual Rust teaching-step validator. Incomplete or invalid results fail the build. A negative test also rejects an in-range but false conclusion.

Runtime loading still reads and structurally decodes the asset on the I/O dispatcher, caches successful content under a mutex, propagates cancellation, and reports read failures. It no longer invokes native mathematical validation. Player save/import validation is unchanged.

Candidate notes use a board-shared Compose `TextMeasurer` and cached drawing. Each nonempty note cell replaces its three rows and nine boxes with one drawing node; empty note masks allocate no note layout. Original font style, colors, 3 dp padding, weighted-slot rounding, centering, and RTL order are retained. Cell interaction and accessibility nodes are unchanged. Page composition, navigation, dimensions, and positioning are unchanged.

## Verification

- The new player test failed against the old implementation when native teaching validation was unavailable: [red result](verification/2026-10-17-lesson-rendering/runtime-red.txt). It passes after the runtime dependency is removed.
- A temporary, structurally valid catalogue changed both the first answer and its matching conclusion from 5 to 4. Running `:core:data:preBuild` reran the host tests and rejected the false conclusion before packaging: [build gate result](verification/2026-10-17-lesson-rendering/invalid-content-build.txt). The original asset was restored byte-for-byte, and the subsequent normal build passed.
- [Board tests](verification/2026-10-17-lesson-rendering/board-tests.txt): 5 passed. The pixel regression compares the new renderer with a frozen copy of the previous layout across six cases: all candidates, partial candidates, a single candidate, fractional dimensions, dark theme with font scale 2, RTL, and an empty mask. It also runs existing cell-selection, disabled-cell, clue-description, and digit-input checks.
- [Player workflow tests](verification/2026-10-17-lesson-rendering/player-tests.txt): 21 passed, including opening bundled lessons with native teaching validation unavailable.
- [Lesson screen tests](verification/2026-10-17-lesson-rendering/lesson-tests.txt): 5 passed, covering teaching/practice transitions, input, and board geometry.
- `qualityCheck :app:assembleDebug :feature:learning:assembleDebugAndroidTest` passed, including formatting, dependency direction, JVM tests, and Android lint.

[Before](verification/2026-10-17-lesson-rendering/before.png) and [after](verification/2026-10-17-lesson-rendering/after.png) screenshots of the first lesson have identical pixels in the application area. Comparison excluded only the top 140 pixels containing the changing system status bar; the 1080 × 2260 remaining region has no differences.

## Diagnostic performance sample

An API 37.2 ARM64 disposable emulator used a 1080 × 2400 display, density 480, and SwiftShader. Debug builds were used in both runs. A system `atrace` capture (`gfx view sched`, application tracing enabled) was parsed for main-thread slices while entering the first lesson again after returning to the course list:

| Longest slice                   |    Before |    After |
| ------------------------------- | --------: | -------: |
| `AndroidOwner:measureAndLayout` | 247.16 ms | 72.07 ms |
| `Compose:recompose`             |  70.26 ms | 19.16 ms |
| `Compose:applyChanges`          |  71.54 ms | 18.40 ms |
| `AndroidOwner:draw`             |  14.60 ms | 23.69 ms |

The new version's first lesson entry measured 111.31 ms for its longest `measureAndLayout` slice. Nested slice durations must not be added together. These are individual diagnostic samples from equivalent emulator configurations, not a release benchmark or a guarantee of frame-budget compliance. Drawing moves some work out of layout; the measured layout reduction does not imply every phase got faster. Real-device release profiling remains outside this verification.

The disposable emulator was removed after testing. No everyday emulator or physical device was used.

## References

- [Compose graphics and cached text drawing](https://developer.android.com/develop/ui/compose/graphics/draw/overview)
- [Compose performance and release measurement guidance](https://developer.android.com/develop/ui/compose/performance)
- Installed Compose Foundation 1.12.0 `RowColumnMeasurePolicy` was used to preserve weight remainder distribution.
