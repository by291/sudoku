# Saved-game picker verification

Date: 2026-10-17

The multiple-save picker now shares the Start/Daily bottom-sheet shell. Its heading contains only the title and Close action, without a save-count subtitle or a header divider. The approved refinement uses flat rows, fine theme-colored dividers, prominent variant titles, quiet difficulty labels, mint source tags, and a compact progress/time footer. Daily saves retain their challenge date and formal/practice identity. Start dates retain the year for saves from other years. A single save still opens directly; selecting a row resumes its exact session.

## Checks

- `qualityCheck :app:assembleDebug :app:assembleDebugAndroidTest` passed, covering formatting, JVM tests, dependency checks, and lint. Some lint invocations encountered an intermittent internal Kotlin analysis failure in the unchanged backup test; retries passed.
- Three summary tests cover filling counts excluding givens/notes, local time conversion, source distinctions, and older-year timestamps.
- [Player workflows](verification/2026-10-17-save-picker/player-tests.txt): all 22 passed, including setup selection, single-save continuation, multiple-save identity and selection, Close, and system Back.
- [Small-screen check](verification/2026-10-17-save-picker/large-font-tests.txt): the picker workflow passed at 320 × 640 dp and font scale 2. Text wraps and the list scrolls. This ran before the final divider-color-only adjustment.
- After that color adjustment, the picker workflow passed in [portrait](verification/2026-10-17-save-picker/final-picker-tests.txt) at 360 × 800 dp and in [dark landscape](verification/2026-10-17-save-picker/landscape-tests.txt) at 800 × 360 dp.
- Inspected [portrait](verification/2026-10-17-save-picker/phone.png) and [dark landscape](verification/2026-10-17-save-picker/dark-landscape.png) screenshots. The landscape capture is scrolled to the later saves. These reference captures predate removal of the save-count subtitle and the full-width touch-surface adjustment.

Verification used an API 37.2 ARM64 disposable emulator with density 480 and SwiftShader. No everyday emulator or physical device was modified. The disposable emulator was removed afterward. No physical-device validation is claimed.

Layout wrapping follows the installed Compose Foundation 1.12.0 [FlowRow guidance](https://developer.android.com/develop/ui/compose/layouts/flow).

## Full-width touch feedback

Horizontal 20 dp text padding lives inside each clickable surface, allowing touch feedback to extend to both sheet edges. The [picker test](verification/2026-10-17-save-picker/edge-tests.txt) checks both row edges against the list bounds and resumes the selected daily save by tapping one pixel inside its left edge. It passed before the final header-only simplification. Final layout retains the original first-row spacing and omits the count subtitle and header separator.
