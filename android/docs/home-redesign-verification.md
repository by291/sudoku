# Android home redesign verification

Date: 2026-10-17.

## Delivered behavior

Home is the entry hub, with a primary teal hero containing the Web-inspired tilted Sudoku illustration, Start, and an optional blue-gray Continue action. Daily and Learning are secondary cards; Records is a quieter row. Bottom navigation and the expanded rail are removed. Workflow toolbars and system Back return to Home, while decorated Navigation 3 entries retain visited filters and scroll state. Game and lesson detail navigation remains intact.

The latest user reference adopts only the Web hero's structure. The mint surface, paper background, colors, rounded cards, original Chinese copy, and destination hierarchy remain unchanged. Kicker, two-line heading, and description form one left-aligned column; the tilted board is centered against that entire column. Both sit above the shared Start/Continue row. The regular-height visual region has a 192 dp minimum height, giving the upper composition more room; short windows wrap content instead. The complete hero-and-destinations group remains vertically centered below the toolbar. Copy now takes only its natural width, with an 8 dp gap; the board uses the remaining width dynamically. Its full rotated bounds stay inside its layout region to avoid overlapping copy or actions. The final visual adjustment reduces artwork fill to 92% and changes the kicker to the primary teal color; surrounding layout measurements are unchanged.

The default-font layout fits one viewport with a saved game present, including the complete touch targets. Short landscape windows use two columns and omit the nonessential hero description. Enlarged system text keeps its requested scale and permits scrolling.

## Build and regression checks

Using the repository's JDK 21 compilation toolchain and installed SDK, from `android/`:

```sh
bash ./gradlew spotlessApply --offline --no-parallel
bash ./gradlew qualityCheck :app:assembleDebug :app:assembleDebugAndroidTest --offline --no-parallel
```

Passed: module dependency checks, Spotless, Android lint, debug app/test assembly, and 50 JVM tests with no failures or skips. The Gradle wrapper file is not executable in this checkout, so it is invoked with Bash. No engine or generated bindings changed. The spacing follow-up reran formatting separately after a transient Spotless read of a disappearing Kotlin build-cache file; the sequential formatting and full quality/build run passed.

The new home-navigation test first failed against the previous implementation because the Home bottom tab still existed. The final app passes seven player workflow tests: home viewport bounds, all home entries and Back paths, records-filter retention, setup cancellation without save replacement, paused continuation/native completion, pause/save behavior, and the existing game-board viewport contract.

The viewport test checks both visibility and unclipped target bounds, without scrolling to find entries. Every fixture includes an unfinished save so Continue is present.

## Latest structure verification

The adaptive-width refinement passed `spotlessCheck`, `:feature:game:lintDebug`, and `:app:assembleDebug`. The existing viewport contract verifies all five actions without scrolling. The screenshot matrix below verifies the adaptive Web-inspired arrangement, including a 440 dp wide phone, before the final 8% artwork reduction and teal kicker adjustment. Those two final changes received formatting, lint, and debug-build checks; screenshots were not recaptured. The full `qualityCheck` and debug app/test assemblies were rerun before committing the final changes and passed. The seven-workflow instrumentation suite above predates the layout refinements; the matrix records the more recent focused runs.

## Emulator matrix

All cases use the task-owned `sudoku-home-redesign` API 37.2 arm64 emulator, explicitly addressed as `emulator-5584`. The emulator was stopped and its AVD deleted after verification. Personal AVDs are untouched.

| Window / settings                       | Checks                                                    | Result   | Screenshot and raw output                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 360 × 800 dp, default text              | Viewport (earlier full suite: 7 passed)                   | 1 passed | [Screenshot](verification/2026-10-17-home-redesign/phone-with-save.png), [output](verification/2026-10-17-home-redesign/phone-with-save-tests.txt)                                                                                         |
| 440 × 960 dp, default text              | Adaptive artwork and all five actions inside the viewport | 1 passed | [Screenshot](verification/2026-10-17-home-redesign/wide-phone-with-save.png), [output](verification/2026-10-17-home-redesign/wide-phone-with-save-tests.txt)                                                                               |
| 360 × 900 dp, default text              | All five home actions inside the initial viewport         | 1 passed | [Screenshot](verification/2026-10-17-home-redesign/tall-phone-with-save.png), [output](verification/2026-10-17-home-redesign/tall-phone-with-save-tests.txt)                                                                               |
| 320 × 640 dp, default text              | All five home actions inside the initial viewport         | 1 passed | [Screenshot](verification/2026-10-17-home-redesign/small-phone-with-save.png), [output](verification/2026-10-17-home-redesign/small-phone-with-save-tests.txt)                                                                             |
| 800 × 360 dp, default text              | All five home actions fully inside the initial viewport   | 1 passed | [Screenshot](verification/2026-10-17-home-redesign/landscape-with-save.png), [output](verification/2026-10-17-home-redesign/landscape-with-save-tests.txt)                                                                                 |
| 1280 × 800 dp, default text             | Home viewport and all entry/Back paths                    | 2 passed | [Screenshot](verification/2026-10-17-home-redesign/expanded-with-save.png), [output](verification/2026-10-17-home-redesign/expanded-with-save-tests.txt)                                                                                   |
| 360 × 800 dp, dark mode, 1.5 font scale | All entry/Back paths, with scrolling                      | 1 passed | [Initial viewport](verification/2026-10-17-home-redesign/dark-large-text.png), [lower content](verification/2026-10-17-home-redesign/dark-large-text-lower.png), [output](verification/2026-10-17-home-redesign/dark-large-text-tests.txt) |

The [fresh home](verification/2026-10-17-home-redesign/phone-empty.png) also receives visual inspection. Screenshots are captured from the rebuilt debug APK. This is emulator evidence; physical TalkBack and predictive-Back gesture animation are not newly claimed verified.

## API references reviewed

The implementation uses the installed Compose BOM `2026.09.00` and Navigation 3 `1.2.0`. Navigation entry retention was checked against that installed version's `DecoratedNavEntries.kt` source. Layout and control semantics follow the official [adaptive sizing guidance](https://developer.android.com/develop/ui/compose/layouts/adaptive/support-different-display-sizes), [intrinsic measurement contracts](https://developer.android.com/develop/ui/compose/layouts/intrinsic-measurements), [accessibility defaults](https://developer.android.com/develop/ui/compose/accessibility/api-defaults), and [navigation state ownership](https://developer.android.com/guide/navigation/navigation-3/save-state).
