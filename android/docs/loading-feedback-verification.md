# Loading feedback verification

Date: 2026-10-17.

## Policy and scope

Transient progress appears only after 350 ms of continuous pending work. Completion immediately clears the feedback, cancels the pending timer, and permits the actual transition. No minimum display duration or artificial operation delay is introduced. Each subsequent operation starts a fresh delay. Errors and the actual enabled state of controls remain immediate.

The shared presentation helper in `core/design` uses composition-scoped cancellation, following the official [Compose effect lifecycle](https://developer.android.com/develop/ui/compose/side-effects). The installed Compose BOM is 2026.09.00.

Applied to app readiness, Home save loading, setup loading, game preparation, conflict checks, candidate generation, hints, lesson loading/submission, and records loading/processing. Home retains the Start button during loading. Game analysis reuses the existing single-line board status region. Records reuses the heading and subtitle instead of inserting a progress row. This preserves the accepted game layout and avoids transient height changes.

## Verification

An instrumented native-entry regression failed before the fix: after 100 ms, the quick conflict-check caption was already visible. See [the pre-fix result](verification/2026-10-17-loading-feedback/progress-red-test.txt).

Formatting, `qualityCheck`, app assembly, and test assembly passed. Tests use a disposable API 37.2 ARM emulator; the personal emulator is untouched.

- [360 × 800 dp: 20 tests](verification/2026-10-17-loading-feedback/progress-phone-tests.txt): the full 15-test player suite, four controlled-clock feedback tests, and a real app startup test with gated native readiness.
- [320 × 640 dp: 2 tests](verification/2026-10-17-loading-feedback/progress-small-tests.txt): short-check suppression and stable board/key bounds during long checks.
- [800 × 360 dp: 2 tests](verification/2026-10-17-loading-feedback/progress-landscape-tests.txt): the same checks in landscape.
- [360 × 800 dp, dark, 1.5 font scale: 2 tests](verification/2026-10-17-loading-feedback/progress-large-text-tests.txt): the same checks with enlarged text.

After reserving the records header indicator slot, the final APK also passed [two records/navigation checks](verification/2026-10-17-loading-feedback/progress-final-records-tests.txt).

The controlled-clock checks cover fast completion, long-running visibility, immediate clearing, consecutive operations, and disposal before the timer fires. The game tests still execute native edits and conflict calculations; only result timing is gated. Physical-device startup timing and TalkBack were not newly measured.

## Stable home actions during saved-game refresh

Before startup preloading, the daily sheet refreshed saved games immediately and once per minute while open. Previously, each refresh replaced the Start/Continue row with the initial-loading branch, removing Continue and changing Start's width, label, and color. A native-validation gate reproduced this disappearance before the fix: [failed regression](verification/2026-10-17-home-refresh/home-refresh-red-test.txt).

Home now distinguishes the first load from a refresh of an existing snapshot. Existing actions, descriptions, and labels stay mounted while refreshing. Both Start and Continue remain disabled until fresh data arrives, with their normal fill and text colors. The initial-load Start button also keeps its normal colors, and its delayed spinner uses contrasting text color. The Records icon now uses the same primary teal as Daily and Learning.

Formatting, `qualityCheck`, app assembly, and test assembly passed. The regression compares button bounds before, during, and after a deliberately held refresh, compares sampled fill pixels before and during loading, verifies both buttons remain disabled while pending, and checks that background refresh never replaces the labels with loading copy.

- [360 × 800 dp: 16 player workflow tests](verification/2026-10-17-home-refresh/home-refresh-phone-tests.txt).
- [320 × 640 dp: 1 refresh regression](verification/2026-10-17-home-refresh/home-refresh-small-tests.txt).
- [800 × 360 dp: 1 refresh regression](verification/2026-10-17-home-refresh/home-refresh-landscape-tests.txt).
- [360 × 800 dp, dark, 1.5 font scale: 1 refresh regression](verification/2026-10-17-home-refresh/home-refresh-large-text-tests.txt).

Final [home screenshot](verification/2026-10-17-home-refresh/home-refresh-final.png).

## Preparing Home before presentation

Startup now waits for settings and the game feature's shared home snapshot. Settings, all ordinary/daily saved sessions, and completion records are read concurrently using scoped `async` jobs. The session repository already returns both kinds of saves in one query. Only a complete successful snapshot opens Home; a failed read keeps the startup gate closed and offers retry. Cancellation never publishes partial data or leaves the loader stuck.

Home consumes that snapshot on first entry. Opening today's daily sheet reuses it without another read; returning from another route, the daily minute timer, and challenge-date rollover still refresh saved state. The delayed startup caption now describes preparing Home. This follows [Kotlin structured concurrency](https://kotlinlang.org/docs/composing-suspending-functions.html#structured-concurrency-with-async), using the installed kotlinx.coroutines 1.10.2.

The gated native-validation regression failed before the change because Start was already present while saved games were still loading: [pre-fix result](verification/2026-10-17-home-preload/preload-red-test.txt).

Six focused JVM tests cover concurrent reads, atomic snapshot publication, cancellation, failure retention, first-entry reuse, return refresh, startup readiness, and retry after read failure. The startup instrumentation fixture contains both a free save and today's daily save; Home remains absent until validation completes, then both actions are enabled and opening the daily sheet adds no validation/read calls.

Formatting, `qualityCheck`, app assembly, and instrumentation assembly passed. Disposable-emulator results:

- [360 × 800 dp: 22 tests](verification/2026-10-17-home-preload/home-preload-phone-tests.txt), including the full player suite, startup, and delayed progress checks.
- [320 × 640 dp: return-refresh regression](verification/2026-10-17-home-preload/home-preload-small-tests.txt).
- [800 × 360 dp: return-refresh regression](verification/2026-10-17-home-preload/home-preload-landscape-tests.txt).
- [Dark 360 × 800 dp, 1.5 font scale: return-refresh regression](verification/2026-10-17-home-preload/home-preload-large-text-tests.txt).

The refresh regression compares bounds and colors at a fixed scroll position. No physical-device startup performance measurement is claimed.
