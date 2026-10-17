# Loading feedback verification

Date: 2026-10-17.

## Cold-start Home geometry

Cold-start frame capture exposed a separate layout jump after preloading had completed. The startup placeholder did not subscribe to Compose window insets. Home's first Scaffold therefore measured with zero system insets; the next frame applied the status/navigation bars and recentered the entry group. At 360 × 800 dp, the Start button moved down by 48 physical pixels on a density-3 emulator.

The app now subscribes to `WindowInsets.safeDrawing` throughout bootstrap and applies that padding to startup feedback. The first destination receives initialized insets without changing Home's final styling, spacing, or alignment. This follows the installed Compose Foundation 1.12.0 inset lifecycle and [Android's inset phase guidance](https://developer.android.com/develop/ui/compose/system/insets-ui#insets-and-jetpack-compose-phases).

`HomeStartupTest` observes actual draw frames around gated native readiness instead of waiting for Compose to become idle. It failed before the fix with Start bounds moving from y=1110 to y=1158 px, then passed after the change. A separate real cold-start capture showed the hero top remaining at y=462 px in all 14 captured Home frames. These measurements use a disposable API 37.2 ARM emulator; they do not establish physical-device startup latency.

## Policy and scope

Transient progress appears only after 350 ms of continuous pending work. Completion immediately clears the feedback, cancels the pending timer, and permits the actual transition. No minimum display duration or artificial operation delay is introduced. Each subsequent operation starts a fresh delay. Errors and the actual enabled state of controls remain immediate.

The shared presentation helper in `core/design` uses composition-scoped cancellation, following the official [Compose effect lifecycle](https://developer.android.com/develop/ui/compose/side-effects). The installed Compose BOM is 2026.09.00.

Applied to app readiness, Home save loading, setup loading, game preparation, conflict checks, candidate generation, hints, lesson loading/submission, and records loading/processing. Home retains the Start button during loading. Game analysis reuses the existing single-line board status region. Records reuses the heading and subtitle instead of inserting a progress row. This preserves the accepted game layout and avoids transient height changes.

## Learning directory initial overview

Course count is fixed by the catalogue's authored identity contract, so the heading and variant choices render immediately without waiting for asset or personal-progress reads. `LessonCatalogue.bundledLessonCount` derives that count from the same identities verified by catalogue decoding; no separate hard-coded total or runtime lesson computation is needed.

Application bootstrap now prepares a feature-owned learning snapshot concurrently with Home. Within that preparation, the fixed catalogue, saved settings, and lesson progress load concurrently between dataset-epoch reads. First navigation uses the complete cached snapshot synchronously, including the recommendation and list; it does not clear the list or issue another initial read. Returning to the directory refreshes progress while retaining its existing content. Lesson interactions still read a fresh durable cursor before accepting answers, and never treat the directory snapshot as a loaded lesson.

Failures remain retryable on the learning page and do not disable unrelated Home actions. Mixed dataset epochs and cancelled reads never publish partial snapshots. When no snapshot is available, the fixed heading remains visible, the counter and progress geometry stays reserved, and unknown progress is not announced as zero.

Regressions cover the fixed count before asset loading, stable subtitle/category bounds, prepared list availability before navigation, one-time first-entry reuse, return refresh, and rejection/retry across dataset replacement. The original directory regression failed because its initial state was still loading despite a prepared snapshot. Full Android quality checks and debug/test assembly passed.

Seven device checks passed on a disposable API 37.2 ARM emulator at 360 × 800 dp: initial Home geometry, startup feedback, predictive navigation, and opening a real bundled lesson without runtime mathematical validation. The temporary emulator was removed afterwards.

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

## Reserving the game board during loading

The game previously omitted BoardWorkspace while its session was null. Tools and keys therefore appeared without the square, then moved when loading installed the session. The original gated-load regression measured the digit key's top moving from 403.67 dp to 605.33 dp on the phone: [pre-fix failure](verification/2026-10-17-board-loading/red-test.txt).

BoardWorkspace now reserves its final square from the first composition. Delayed preparation feedback, cancellation/retry, the paused cover, and the real board render inside those same bounds. Preparation no longer inserts an extra outer row. Initial errors and retry are inside the placeholder; there is no initial retry button before an error or cancellation. The status line also retains its normal timer-height minimum when settings hide the timer. Native loading, save ownership, and paused restoration are unchanged.

Tests gate native preparation while using the real repository and native board after release. They compare exact board/key bounds before and after delayed progress, paused restoration, active play, cancellation, and retry, and verify that digits remain disabled before readiness. Formatting, `qualityCheck :app:assembleDebug`, instrumentation assembly, and documentation checks passed. The disposable API 37.2 emulator was used; the personal emulator was untouched.

- [360 × 800 dp: 20 player workflow checks](verification/2026-10-17-board-loading/phone-tests.txt).
- [320 × 640 dp: 2 board loading checks](verification/2026-10-17-board-loading/small-tests.txt).
- [800 × 360 dp: 2 board loading checks](verification/2026-10-17-board-loading/landscape-tests.txt).

These results establish layout stability under controlled loading; they do not measure physical-device load speed or TalkBack behavior. The temporary emulator was stopped and deleted after verification.
