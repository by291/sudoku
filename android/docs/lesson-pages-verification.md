# Lesson screens and shared digit keys

Date: 2026-10-17.

## Approved presentation

The title bars use the same Material app-bar height and titleMedium typography as the directory and game. The tabs remain outside the scrolling content. Guide and practice share a measured message-card height, an equal-height board-heading row, and one scroll offset; the visited content extent is retained to prevent offset clamping when switching to a shorter mode. The Clear icon and label are separated by 8 dp.

The lesson screens implement the approved mobile preview using the existing paper, teal, and dark-theme tokens. Learning Explanation and Hands-on Practice are selectable tabs that preserve the unfinished answer. The guide presents the authored introduction, example board, and explanation. Practice presents the current stage, instructions or answer feedback, the board, shared digit keys, and Clear. The primary Start, Submit, Next, or Review action stays below the scrollable content and inside safe drawing insets.

Feedback occupies a reserved region, with longer authored explanations independently scrollable. Submission does not insert a new card or remove the keypad. Errors use a text heading as well as a different surface color. Correct answers still require explicit Next, after the existing ViewModel completes persistence. The ViewModel, catalogue, and Rust validation remain unchanged. Authored evidence is shown in the guide and after a correct exercise answer; it is not revealed before answering.

Zoom and full-board practice remain reachable from the toolbar menu; the guide also has a labeled zoom icon. Full-board practice retains its separate-save explanation. The zoom view provides larger digit targets. Small windows and enlarged text scroll rather than clipping authored explanations or shrinking the requested text size.

The game and lesson screens now use the same `NumberPad`: light surface, 8 dp corners, a thin teal border, 24 sp digits, and 52 dp minimum key height. Measured digit width determines whether all nine keys fit in one row; otherwise the keys wrap into three columns. Compact phone keys preserve the requested direct access, while zoom uses a 48 dp minimum key width. The game's independent quick-note row remains available, aligned with the same measured column count.

Implementation follows the official [Compose button guidance](https://developer.android.com/develop/ui/compose/components/button) and [accessible component defaults](https://developer.android.com/develop/ui/compose/accessibility/api-defaults), using the repository's Compose BOM 2026.09.00. Material surfaces supply native click, selection, disabled, focus, and press behavior.

## Validation scope

The tests exercise observable callbacks and authored answers: starting an exercise, correct submission requiring explicit Next, placement and candidate elimination, toggling and clearing exclusions, preservation across tabs, physical-keyboard input mode, secondary navigation, and unchanged board/key/button bounds after incorrect feedback. Shared-pad checks cover nine-key alignment, narrow-window fallback, larger zoom targets, and disabled input.

Small-window tests explicitly scroll the outer content to the feedback panel before scrolling its longer explanation. Keyboard tests request keyboard input mode before checking focus, matching a hardware keyboard rather than assuming a touch-only surface owns keyboard focus.

## Initial implementation results

`spotlessApply`, `qualityCheck`, app assembly, and the learning/core UI/app instrumentation APK builds passed. Twenty-five instrumentation checks passed on a disposable API 37.2 ARM emulator:

- [360 × 800 dp](verification/2026-10-17-lesson-pages/phone-tests.txt): four lesson checks.
- [320 × 640 dp](verification/2026-10-17-lesson-pages/small-tests.txt): four lesson checks.
- [800 × 360 dp](verification/2026-10-17-lesson-pages/landscape-tests.txt): four lesson checks.
- [Dark 360 × 800 dp, 1.5 font scale](verification/2026-10-17-lesson-pages/large-text-tests.txt): four lesson checks.
- [Shared controls](verification/2026-10-17-lesson-pages/core-ui-tests.txt): six board and number-pad checks.
- [Real application game workflow](verification/2026-10-17-lesson-pages/game-tests.txt): three checks for visible controls, notes/undo/redo/erase, and quick notes independent of the main entry mode.

Visual review used the installed application for [learning](verification/2026-10-17-lesson-pages/guide-phone.png) and [practice](verification/2026-10-17-lesson-pages/practice-phone.png), plus an instrumentation capture of [dark enlarged text](verification/2026-10-17-lesson-pages/guide-large-text.png). Short screens require scrolling to read the full guide explanation or reach lower secondary content; the primary action stays visible. These checks do not establish physical-device or TalkBack behavior. The personal emulator was not used.

## Follow-up: stable tab geometry

The screenshot feedback identified three presentation defects: the lesson title was larger than the other toolbar titles, each mode used a different pre-board arrangement and independent scroll position, and Clear lacked icon/label spacing. The correction uses the standard Material toolbar and shared title typography, fixes the tabs below it, shares the measured card and heading bounds, and retains one scroll position and its visited content extent. This prevents both different content heights and scroll clamping from shifting the board. Clear now has an 8 dp icon/label gap.

The new regression compares the toolbar, tab, and board bounds before and after switching, both at the top and after scrolling down. All five lesson tests passed in each configuration: [phone](verification/2026-10-17-lesson-pages/switch-phone-tests.txt), [small phone](verification/2026-10-17-lesson-pages/switch-small-tests.txt), [landscape](verification/2026-10-17-lesson-pages/switch-landscape-tests.txt), and [dark enlarged text](verification/2026-10-17-lesson-pages/switch-large-text-tests.txt). `qualityCheck`, app assembly, instrumentation assembly, and formatting checks passed.

The current [guide](verification/2026-10-17-lesson-pages/switch-guide.png) and [practice](verification/2026-10-17-lesson-pages/switch-practice.png) device screenshots supersede the initial layout captures above. The capture helper now uses the device screenshot API because Compose node captures showed stale drawing layers after tab switches even when device rendering and semantic bounds were correct. System bar appearance in the feature harness is not owned by the production app activity.
