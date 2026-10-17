# Records page verification

Date: 2026-10-17.

## Approved presentation

The Android screen follows the approved interactive preview: the shared app toolbar and paper/teal palette, a six-variant choice grid matching Learning, and Overview / Local Saves / Completion History tabs. The actual supported variants are Standard, Diagonal, Jigsaw, Killer, Thermometer, and Arrow; preview sample data and unsupported sample labels are not used.

Overview renders the existing formal daily totals, current/longest streaks, and separate assisted/unassisted free-play best times. Local Saves highlights the most recently started unfinished session and preserves access to all other saves, including completed saves. Completion History groups results by local calendar date without changing the domain's Beijing-date challenge eligibility. Each variant/tab has saveable scrolling state. Tabs become sticky when the introduction scrolls away.

The app shell supplies the Backup action. The records feature owns the native modal sheet, document handoff, and confirmation dialogs. The sheet reuses the existing game setup sheet's decorative handle and initial Close focus, avoiding an automatically focused default drag-handle tooltip. Export, restore preview, clear confirmation, quarantine cleanup, cancellation, and error retry retain their existing ViewModel/repository contracts. Errors remain visible in the active sheet; restore failures remain visible in the confirmation dialog.

First loading does not render zero statistics as if the dataset were empty. Subsequent refreshes retain the loaded content, and progress feedback still waits for the shared delay. Large text uses two variant columns, stacked best-time values, and stacked record details. Short windows scroll while preserving access to actions. No theme palette action is added outside Home.

The implementation uses Compose BOM 2026.09.00 and follows the official [modal bottom sheet](https://developer.android.com/develop/ui/compose/components/bottom-sheets) and [saveable UI state](https://developer.android.com/develop/ui/compose/state-saving) guidance.

## Verification scope

The feature checks cover empty-state tabs, explicit destructive confirmations and safe keyboard focus, restore preview counts, selected-session callbacks, variant filtering across tabs, busy backup controls, visible failure/retry, quarantine confirmation, and the distinction between unread and empty datasets. Lazy-list tests scroll by semantic match before interacting with items that may not yet be composed; the large-text record action is located within its combined time/action label.

The application checks cover the real toolbar Backup action, Back dismissing the sheet before leaving Records, returning through Home while retaining the variant and tab, and navigation between Home workflows. Tests use a disposable API 37.2 ARM emulator; the personal emulator is untouched. The original tab regression was first observed failing against the old screen because no Overview tab existed.

Physical-device touch, TalkBack, and system document-provider export/import were not revalidated in this UI pass. Existing repository and ViewModel tests cover data operations; instrumentation checks the corresponding UI callbacks and confirmations.

## Results

`spotlessApply`, followed separately by `qualityCheck :app:assembleDebug --offline --no-daemon`, passed. Instrumentation APK assembly, documentation formatting, and `git diff --check` also passed. The disposable emulator was stopped and deleted after verification.

Seven feature tests passed in each of four configurations (28 checks): [360 × 800 dp](verification/2026-10-17-records/phone-tests.txt), [320 × 640 dp](verification/2026-10-17-records/small-tests.txt), [800 × 360 dp](verification/2026-10-17-records/landscape-tests.txt), and [dark 360 × 800 dp at 1.5 font scale](verification/2026-10-17-records/large-text-tests.txt). Three [application navigation checks](verification/2026-10-17-records/app-tests.txt) passed.

Visual review used native device screenshots of the actual application [overview](verification/2026-10-17-records/overview-phone.png) and [backup sheet](verification/2026-10-17-records/backup-phone.png), plus feature-harness captures of [history](verification/2026-10-17-records/history-phone.png) and [large-text saves](verification/2026-10-17-records/saves-large-text.png). The feature harness omits the app toolbar and does not own production system-bar styling.
