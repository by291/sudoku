# Mobile setup verification

Date: 2026-10-17.

## Interaction and layout

Free play and daily challenge now open a native Material modal bottom sheet directly over Home. Six concise variant options occupy two rows at default phone text size. Only the selected variant's rule explanation is shown. Free-play difficulty uses one segmented group; daily variants show their status and expose challenge rules separately. Enlarged text uses two columns and permits scrolling.

The bottom action area contains one primary Start action. An unfinished free save adds a quieter Continue row and an explicit replacement notice. On short windows these scroll with the options, leaving space to choose a variant while only Start remains fixed. Close, scrim dismissal, and system Back dismiss the sheet; selecting an option never starts or replaces a game. Daily no longer has an intermediate route. Home artwork, palette, spacing, and destination positions are unchanged.

## Verification

From `android/`, using the configured JDK 21 compilation toolchain and installed SDK:

```sh
bash ./gradlew spotlessApply --offline --no-parallel
bash ./gradlew qualityCheck :app:assembleDebug :app:assembleDebugAndroidTest --offline --no-parallel
```

Formatting, module dependency checks, JVM tests, Android lint, and app/test assembly passed. Android lint initially reported an internal FIR resolution failure while analyzing the unchanged backup instrumentation test; the separate rerun passed without disabling checks.

Instrumented checks used the task-owned API 37.2 ARM emulator on port 5584. The personal emulator was not used.

| Window                             | Checks                                                                                                     | Result                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 360 × 800 dp                       | Complete player workflow suite, including selection, dismissal, save retention, and phone setup visibility | [10 passed](verification/2026-10-17-mobile-setup/phone-tests.txt)     |
| 320 × 640 dp                       | Setup visibility, close, selection without replacement, and daily Back to Home                             | [4 passed](verification/2026-10-17-mobile-setup/small-tests.txt)      |
| 800 × 360 dp                       | Close, selection without replacement, and daily Back to Home, with scrolling                               | [3 passed](verification/2026-10-17-mobile-setup/landscape-tests.txt)  |
| 360 × 800 dp, dark, 1.5 font scale | Close, selection without replacement, and daily Back to Home, with scrolling                               | [3 passed](verification/2026-10-17-mobile-setup/large-text-tests.txt) |

Screenshots: [phone free](verification/2026-10-17-mobile-setup/phone-free.png), [phone daily](verification/2026-10-17-mobile-setup/phone-daily.png), [small free](verification/2026-10-17-mobile-setup/small-free.png), [small daily](verification/2026-10-17-mobile-setup/small-daily.png), [landscape](verification/2026-10-17-mobile-setup/landscape-free.png), and [enlarged dark text](verification/2026-10-17-mobile-setup/large-text-free.png).

This verifies emulator layout and automated touch/Back behavior; physical-device TalkBack and predictive-Back gesture animation were not newly tested. Implementation uses the installed Compose BOM 2026.09.00 and the official [modal bottom sheet guidance](https://developer.android.com/develop/ui/compose/components/bottom-sheets).
