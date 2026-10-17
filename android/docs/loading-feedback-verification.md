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
