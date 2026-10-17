# Mobile game layout verification

Date: 2026-10-17.

## Layout and behavior

The current game layout follows the complete mobile reference rather than scaling isolated elements. A quieter centered title sits above the timer. Rules remain in Settings, and zoom is available through More. The board has 12 dp portrait margins, 1 dp major lines, and regular-weight givens. Board and input controls retain the shared paper/teal palette. The board and controls are vertically centered together, with 12 dp below the status row and 16 dp between the board and input panel; wide windows place controls beside the board.

A compact six-tool strip precedes two aligned input rows. The primary row uses transparent outlined keys, 52 dp minimum height, 24 sp digits, and 4 dp gaps. The quieter secondary row toggles notes directly; its underline reflects actual notes in the selected cell. Direct note toggles reuse the native edit queue and leave the main input mode unchanged. The existing Notes toggle remains available for keyboard and primary-row entry.

Measured text widths determine when either row needs three columns. Compact digit targets can be narrower than the recommended 48 dp width; zoom retains the full-size keypad. Short windows and enlarged text can scroll. Routine input-mode, coordinate, and successful-save captions remain omitted; save failures and retry remain visible. Existing pause, completion, hint, and persistence workflows are retained.

## Verification

From `android/`:

```sh
bash ./gradlew spotlessApply --offline --no-parallel
bash ./gradlew qualityCheck :app:assembleDebug :app:assembleDebugAndroidTest --offline --no-parallel
```

Formatting, dependency checks, JVM tests, Android lint, and both APK builds passed. An initial lint invocation failed internally in the unchanged backup test; a later run also caught an invalid test import. The import was corrected, and the final complete check passed without disabling checks.

The task-owned API 37.2 ARM emulator used port 5584. The personal emulator was not used.

| Initial layout window              | Checks                                                                                       | Result                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 360 × 800 dp                       | Complete player workflow suite; adds visible tools/digits and notes/undo/redo/erase coverage | [12 passed](verification/2026-10-17-mobile-game/phone-tests.txt)     |
| 320 × 640 dp                       | Pause, notes/undo/redo/erase with scrolling, full-board visibility                           | [3 passed](verification/2026-10-17-mobile-game/small-tests.txt)      |
| 800 × 360 dp                       | Completion, pause, notes/undo/redo/erase, board and input visibility                         | [5 passed](verification/2026-10-17-mobile-game/landscape-tests.txt)  |
| 360 × 800 dp, dark, 1.5 font scale | Pause, notes/undo/redo/erase with scrolling, full-board visibility                           | [3 passed](verification/2026-10-17-mobile-game/large-text-tests.txt) |

Initial-iteration screenshots (before the compact outlined-key refinement): [phone](verification/2026-10-17-mobile-game/phone-game.png), [notes](verification/2026-10-17-mobile-game/phone-notes.png), [wide phone](verification/2026-10-17-mobile-game/wide-phone-game.png), [small phone](verification/2026-10-17-mobile-game/small-game.png), [small phone controls](verification/2026-10-17-mobile-game/small-controls.png), [landscape](verification/2026-10-17-mobile-game/landscape-game.png), [dark large text](verification/2026-10-17-mobile-game/large-text-game.png), and [dark large-text controls](verification/2026-10-17-mobile-game/large-text-controls.png).

These checks cover emulator rendering and automated touch behavior. Physical-device TalkBack, keyboard input, and predictive-Back animation were not newly exercised. The implementation uses Compose BOM 2026.09.00 and the official [app bar](https://developer.android.com/develop/ui/compose/components/app-bars) and [accessibility defaults](https://developer.android.com/develop/ui/compose/accessibility/api-defaults) guidance.

## Compact outlined-key refinement

The follow-up removes the input-mode, coordinate, and successful-save captions. Digit keys now have transparent fills, 1 dp outlines, 8 dp corners, a 48 dp minimum height, and 24 sp digits (20 sp in Notes). Layout decisions use measured text width rather than a fixed font-scale breakpoint. The complete quality check and app/test builds passed again.

Focused instrumentation verified digit entry visibility, single-row alignment where space permits, absence of the removed captions, and Notes/Undo/Redo/Erase:

- 360 × 800 dp: [2 passed](verification/2026-10-17-mobile-game/refined-phone-tests.txt).
- 320 × 640 dp: [2 passed](verification/2026-10-17-mobile-game/refined-small-tests.txt), with all nine digits in one row.
- 360 × 800 dp, dark, 1.5 font scale: [2 passed](verification/2026-10-17-mobile-game/refined-large-text-tests.txt), retaining a single digit row.
- 360 × 800 dp, dark, 2.0 font scale: [2 passed](verification/2026-10-17-mobile-game/refined-largest-text-tests.txt), verifying the full board and editing workflow with a reflowed tool strip; the measured digit widths still permit a single row.

Outlined-key screenshots (before the board color refinement): [phone](verification/2026-10-17-mobile-game/refined-phone-game.png), [small phone](verification/2026-10-17-mobile-game/refined-small-game.png), and [largest text](verification/2026-10-17-mobile-game/refined-largest-text-game.png).

## Board color refinement

Board borders, major region dividers (including jigsaw regions), and givens now use the same theme accent as the controls. Minor grid lines use the accent at 28% opacity. Player entries keep the theme text color and their existing distinct weight; conflicts, selected-cell fills, notes, and evidence retain their semantic treatment. Shared board rendering applies this consistently to gameplay, zoom, and learning boards in both themes. Earlier screenshots above predate this color-only refinement. Formatting, `qualityCheck`, and `:app:assembleDebug` passed after the change; device screenshots were not recaptured for this refinement.

## Portrait placement and taller keys

Portrait content now starts near the toolbar instead of being vertically centered, moving the board upward. Digit keys have a 60 dp minimum height. Spacing grows up to 8 dp to narrow the individual keys; available width determines when spacing must shrink to retain a single row. The typography, outlined treatment, and theme colors are unchanged.

Formatting, `qualityCheck`, app assembly, and test assembly passed. Focused checks of full input visibility, single-row alignment, and Notes/Undo/Redo/Erase passed on [360 × 800 dp](verification/2026-10-17-mobile-game/positioned-phone-tests.txt) and [320 × 640 dp](verification/2026-10-17-mobile-game/positioned-small-tests.txt), two tests each.

[Current phone screenshot](verification/2026-10-17-mobile-game/positioned-phone-game.png) includes both this adjustment and the unified teal board colors.

## Reference composition and direct note row

The latest pass restores the reference's complete visual hierarchy: quieter header, rules/zoom and timer above an almost edge-to-edge board, lighter grid and digit weight, a compact tool strip, outlined number keys, and a second quieter note row. Quick notes go through the existing native edit queue, preserve main input mode, reflect actual note state, support undo, and are disabled on givens. This pass supersedes the earlier isolated key-sizing and positioning iterations above.

Formatting, `qualityCheck`, app assembly, and test assembly passed. Instrumentation results:

- 360 × 800 dp: [13 passed](verification/2026-10-17-mobile-game/reference-phone-tests.txt), including the complete player suite and direct-note regression.
- 320 × 640 dp: [4 passed](verification/2026-10-17-mobile-game/reference-small-tests.txt), including primary-row visibility and note editing with scrolling.
- 800 × 360 dp: [4 passed](verification/2026-10-17-mobile-game/reference-landscape-tests.txt), covering board/input visibility and both note-entry methods.
- 360 × 800 dp, dark, 1.5 font scale: [3 passed](verification/2026-10-17-mobile-game/reference-large-text-tests.txt), covering the full board and both note-entry methods.

Reference-iteration screenshots: [game](verification/2026-10-17-mobile-game/reference-phone-game.png) and [quick note selected](verification/2026-10-17-mobile-game/reference-phone-notes.png).

## Centered group and board spacing

Removed the two icons above the board. Rules remain available in Settings, and board zoom now opens through More. Increased portrait board margins to 12 dp, added 12 dp below the status row, and increased the board-to-controls gap to 16 dp. The complete board and controls group is vertically centered below the app bar, with scrolling retained for short windows and enlarged text.

Formatting, `qualityCheck`, app assembly, and test assembly passed. Focused instrumentation verified board visibility, both note-entry methods, single-row number input where it fits, removal of the two icons, and zoom access through More:

- 360 × 800 dp: [4 passed](verification/2026-10-17-mobile-game/centered-phone-tests.txt).
- 320 × 640 dp: [4 passed](verification/2026-10-17-mobile-game/centered-small-tests.txt), retaining all nine primary digits on one row.
- 800 × 360 dp: [4 passed](verification/2026-10-17-mobile-game/centered-landscape-tests.txt).
- 360 × 800 dp, dark, 1.5 font scale: [3 passed](verification/2026-10-17-mobile-game/centered-large-text-tests.txt).

Current screenshots: [game](verification/2026-10-17-mobile-game/centered-phone-game.png) and [quick note selected](verification/2026-10-17-mobile-game/centered-phone-notes.png).

## Stable layout during conflict checks

The pending conflict label previously added a row below the keys on every edit. Since the board and controls are centered as one group, adding that row moved the board upward and removing it moved the board back. A deterministic native-entry regression reproduced a 38 px shift on the 360 × 800 dp emulator: the first cell's top changed from 592 px to 554 px while checking an incorrect entry. See the [pre-fix failure](verification/2026-10-17-mobile-game/jump-red-test.txt).

Conflict progress now reuses the existing single-line board status area. It does not change the group's height or the accepted layout. Native conflict results and red cell markers remain unchanged. The test gates conflict delivery only; actual editing and rule checks still use the packaged Rust engine. It compares board and key bounds before checking, during checking, and after conflict feedback, then verifies the board position after erasing.

Formatting, `qualityCheck`, app assembly, and test assembly passed. The complete player suite passed on [360 × 800 dp (14 tests)](verification/2026-10-17-mobile-game/stable-phone-tests.txt). The position regression also passed on [320 × 640 dp](verification/2026-10-17-mobile-game/stable-small-tests.txt), [800 × 360 dp](verification/2026-10-17-mobile-game/stable-landscape-tests.txt), and [360 × 800 dp with dark theme and 1.5 font scale](verification/2026-10-17-mobile-game/stable-large-text-tests.txt), one test each.
