# Web Sudoku: First Release Design

Date: 2026-10-11

Status: Approved by the user on 2026-10-11. Implementation planning follows this design.

## 1. Goals and approved scope

Build a Chinese-language web Sudoku game that supports casual play, guided learning, and timed challenges. Keyboard interaction on desktop and touch interaction on mobile must be comfortable. Players must be able to resume interrupted sessions, and learning hints must explain the reasoning behind a move.

The selected stack is Vue 3, TypeScript, Vite, Vue Router, Pinia, Web Workers, IndexedDB with idb, native CSS, Vitest, and Playwright. Use pnpm, ESLint, and Prettier for project tooling. Select compatible stable dependency versions at installation time and pin them with a lockfile.

Repository documentation, code comments, and docstrings are written in English. Player-facing interface copy is written in Chinese.

Deliver the first release as a static website with game computation and data storage in the browser. Accounts, cross-device synchronization, friends, and global leaderboards belong to later releases. Learning, daily challenges, and personal records are part of the first release and must be functional rather than demonstration screens.

Success means that players can complete a game in all three modes; puzzles have unique solutions and explainable difficulty; undo, pause, saving, and restoration behave consistently; hints are correct; and both mobile layouts and keyboard controls work.

## 2. Pages and visual design

- Home: entry points for all three modes, links to resume saved sessions, and today's challenge status.
- Free play: choose Easy, Medium, or Hard and enter the shared game screen.
- Learning: rules, technique lessons, interactive exercises, and learning progress.
- Daily challenge: the challenge date, start or resume controls, and completion status.
- Records: completed sessions, personal best times by difficulty, daily completion counts, and completion streaks. Clearing local data requires confirmation.

On desktop, display the board and control panel side by side. On mobile, arrange the board, number pad, and supporting controls vertically. Keep the board square, clearly separate the nine 3-by-3 boxes, and scale digits and notes to the available width. The page must not overflow horizontally at a viewport width of 360 pixels.

Use a calm, simple visual design: a light paper-like background, dark text, teal accents, and distinct error and hint states. Support light, dark, and system themes. Use markers or descriptions in addition to color for errors. Buttons must have text or accessible names. Board cells must expose their row, column, fixed value, player value, and notes accessibly.

Use Vue Router in hash mode so direct navigation and refresh work on static hosting. Routes are `/`, `/play/free`, `/learn`, `/learn/:lessonId`, `/play/daily`, and `/records`.

## 3. Shared board and interaction rules

The board is a standard 9-by-9 Sudoku with 81 cells. Zero represents an empty cell; integers from 1 to 9 represent digits. Given digits are immutable. Players may select any cell to inspect related highlights, but may only edit cells that are not givens.

Provide:

- Digit entry, erasing, and switching between value and note entry.
- Manual candidate notes and an explicitly invoked candidate-generation helper.
- Highlights for the selected row, column, and box, matching digits, and optionally conflicting entries.
- Undo and redo, with a move including both value changes and related note changes.
- Pause, resume, restart, new-puzzle controls, and a timer visibility setting.

Keyboard controls: arrow keys move the selection; 1-9 enter digits; Backspace or Delete erases; N toggles notes; Ctrl/Cmd + Z undoes; and Ctrl/Cmd + Shift + Z redoes. Do not intercept these shortcuts inside text fields, dialogs, or editable text. Mobile interaction uses the on-screen number pad.

In note mode, toggle the selected candidate within the cell. Entering a value clears that cell's notes and removes the value from notes in its row, column, and box. Erasing a value does not automatically restore notes the player previously removed; undo restores the complete previous board state. Re-entering the current value in value mode is a no-op and does not add a history entry.

Conflict highlighting only identifies repeated digits in a row, column, or box. It does not continuously compare entries against the solution. A separate Check action may identify entries that differ from the unique solution and counts as assistance.

A game is complete when the board is full and satisfies every Sudoku constraint. Stop the timer, save the result, and display the time, difficulty, and assistance information. Completion handling and result persistence must be idempotent.

## 4. Game modes

### 4.1 Free play

Generate a random puzzle at the chosen Easy, Medium, or Hard difficulty. Allow unlimited mistakes without ending the session. Players may hide the timer; hiding it does not stop time measurement.

Keep one active free-play save. Confirm both restart and new-puzzle actions. Restart keeps the puzzle but creates a new session; a new puzzle replaces the active session. Previously completed results remain in history.

### 4.2 Guided learning

The first release contains six lessons: Sudoku rules, naked singles, hidden singles, locked candidates, naked pairs, and hidden pairs. Each lesson includes Chinese explanations, a board example, an interactive exercise, and completion feedback.

Use validated fixed examples that directly demonstrate the target technique. An exercise may ask the player to fill a digit or eliminate a specific candidate. Explain the reasoning after submission and allow retries. Save lesson completion and allow players to repeat lessons.

Lessons also link to a complete practice game at the corresponding difficulty, using the shared board and hint system. Keep the current lesson and one active learning game. Changing lessons preserves saved lesson progress; replacing a complete practice puzzle requires confirmation. Learning sessions appear in history but do not contribute to personal speed records.

### 4.3 Daily challenge

All players receive the same puzzle for a given challenge date. Dates change at midnight in Beijing time, using `Asia/Shanghai`; explain the update time in the interface. Seeds include the date and a fixed puzzle version and do not depend on device randomness, browser language, or device time zone.

Daily puzzles use Medium difficulty. Keep one active challenge session per date. Advancing to a new date must not overwrite an unfinished older challenge, which remains available through the resume entry point. Completion belongs to the original puzzle date; only completion within that date contributes to daily streaks.

The first formal session for each date is eligible for that day's challenge record. After completion, allow practice replays that cannot replace the formal result. Restarting before completion clears values and notes but preserves accumulated time and assistance usage, preventing a reset from creating a new formal attempt.

Hints, solution checks, and candidate generation all mark a session as assisted. Separate unassisted and assisted results. Both assisted and unassisted completions count toward completion totals and streaks, subject to the date rule above. Keep generation rules stable within each puzzle version. Use a new version when changing generation behavior and resume existing saves from their stored puzzles.

## 5. Sudoku engine, generation, and difficulty

Implement the engine in pure TypeScript without dependencies on Vue, Pinia, the DOM, or storage. Its responsibilities are rule validation, candidate calculation, solution counting, generation, logical analysis, and hint analysis.

The search solver uses candidate constraints and backtracking. Uniqueness checks stop counting after two solutions. If a search reaches its node budget, return an inconclusive outcome rather than treating the puzzle as uniquely solvable.

The logical analyzer maintains its own candidate workspace and emits deterministic deduction steps. Supported techniques are naked singles, hidden singles, locked candidates, naked pairs, and hidden pairs. Each step identifies the technique, involved cells and digits, eliminations or placements, and the data needed for a Chinese explanation.

Rate puzzles by analyzing techniques in a fixed order:

- Easy: solvable using only naked and hidden singles.
- Medium: singles are insufficient, but adding locked candidates solves the puzzle.
- Hard: Medium techniques are insufficient, but adding naked or hidden pairs solves the puzzle.

Exclude puzzles that cannot be solved with the techniques supported in the first release. The number of empty cells may help shape a puzzle but does not determine its difficulty rating.

Generate a complete solution, then attempt to remove digits while checking uniqueness and logical difficulty. Control every random choice with the seed. Each request may try at most 20 puzzle layouts and visit at most one million search nodes in total; each logical analysis may perform at most 500 steps. On budget exhaustion, select and transform a previously validated puzzle of the requested difficulty using the seed, then validate it again. Fallback validation has a separate budget; if it is exceeded, report an explicit error instead of returning an unverified puzzle. Daily generation must not select different outcomes based on elapsed execution time.

Run expensive generation and analysis in a Web Worker. Include request IDs and discard stale responses after a session changes. Players can cancel loading. The main thread imposes a 15-second timeout and offers error feedback and a retry of the same request. A timeout cancels execution without changing the seed or generation path. Verify that worker assets load correctly in the production deployment.

## 6. Hint correctness and interaction

Recalculate legal candidates from the current filled values when requesting a hint. Do not treat manual player notes as authoritative.

First check whether the current entries deviate from the puzzle's unique solution. If incorrect entries exist, identify a location to review and explain why reliable deduction cannot continue from the current position. Do not silently modify the board.

For correct entries, run logical analysis from the current board until the next provable digit placement. The hint panel reveals the necessary eliminations and deductions step by step, highlighting the evidence on the board. The player explicitly applies the final placement, which becomes a normal undoable move.

Displaying a hint increments the hint count and marks assistance. Cancelling the hint, undoing its application, or restarting a challenge must not reverse these statistics. If the supported strategies cannot continue, explain that limitation. Never present an answer found by search as a logical deduction.

Learning examples and complete games share technique definitions and explanation data so the same technique is explained consistently.

## 7. Session state and timing

Persist each session's puzzle, unique solution, puzzle version, mode, difficulty, seed, player entries, notes, undo stack, redo stack, accumulated time, assistance statistics, start date, and completion metadata. Learning sessions include lesson metadata; daily sessions include the challenge date and formal-attempt eligibility.

Store givens, player entries, and notes separately. Undoable actions affect only values and notes; they do not reverse time, hint counts, check counts, assistance flags, or previously recorded results.

Session states are generating, playing, paused, completed, and failed. Pausing obscures the board and disables digit input while keeping a resume control available. Navigating to another page, switching modes, or hiding the browser page automatically pauses the session. The player explicitly resumes when the page becomes visible again.

Compute elapsed time from accumulated time and the current running interval rather than incrementing a counter once per second. Use a monotonic browser clock for each running interval, and persist the accumulated duration. Restore refreshed sessions as paused; time while the page is closed does not count.

Save after each effective move and save elapsed time every five seconds while playing. When the page becomes hidden, settle the timer immediately and request a save. An abrupt browser exit may lose the latest unfinished write or one timing-save interval. Do not show a save as successful before its write completes.

## 8. Local data and failure handling

Use IndexedDB through idb for active sessions, completed results, lesson progress, and settings. Version the database schema and saved data independently. On read, validate board length, digit and note ranges, givens, record IDs, and versions.

Index active sessions by mode and, where necessary, lesson or challenge date. The home page exposes resume links. Deduplicate completed results with stable session IDs. Group records by mode, difficulty, and assistance; maintain separate assisted and unassisted best times for each free-play difficulty.

Only one browser tab may edit a given session at a time. Coordinate same-origin tabs using an ownership identifier and tab communication; other tabs become read-only and explain why. Editing can resume after refresh, closure, or owner failure. Concurrent tabs must not silently overwrite each other's saves.

Serialize writes for each session to prevent an older snapshot from overwriting a newer one. If storage is unavailable or a write fails, allow the current game to continue but show a persistent save-failure notice and a retry action. Isolate corrupted records, preserve other valid data, and offer an explicit cleanup option.

Clearing all local data requires confirmation. The records page briefly explains that saves belong to the current browser.

## 9. Code organization and dependency direction

Organize around complete workflows. Avoid creating separate feature modules for every button or small calculation.

```text
src/
  app/                   Application entry, routing, global theme, and page shell
  core/sudoku/           Board rules, search, logical strategies, generation, and types
  features/game/         Shared board, controls, hints, session state, and timing
  features/learning/     Lessons, examples, exercises, and progress pages
  features/records/      Result aggregation and presentation
  infrastructure/        Worker communication, persistence, and tab coordination
  styles/                Theme variables and global styles
```

Dependencies point from the interface and session state toward the core. The core must not depend on those layers. Infrastructure handles computation execution and persistence without implementing Sudoku rules. Pinia coordinates session actions, worker requests, and saving. Pages obtain presentation data from session state and do not write directly to the database.

Keyboard input, touch input, and hint application use the same session actions. Those actions consistently protect givens, record undo history, mark assistance, detect completion, and save changes.

## 10. Verification and delivery criteria

Engine tests cover invalid boards, zero solutions, multiple solutions, unique solutions, budget exhaustion, candidate correctness, valid deductions and explanatory evidence for every technique, and known examples of all three difficulties. Use fixed seeds to generate multiple puzzles per difficulty and verify uniqueness, logical solvability, and rating consistency.

Session tests cover immutable givens, values and notes, peer-note cleanup, undo and redo, irreversible assistance statistics, idempotent completion, time measurement and pauses, paused restoration, daily seeds and Beijing-time date boundaries, versioned saves, formal challenge results versus practice replays, and streak calculations.

Persistence tests cover write ordering, read validation, schema upgrades, failure feedback, result deduplication, and editing ownership across tabs.

Playwright verifies player-facing flows: starting each mode, keyboard and touch entry, submitting lesson exercises, hint explanation and application, paused-board obscuring, refresh and restoration, new-game confirmation, completion, and record updates. Cover at least desktop Chromium and mobile viewport sizes. Algorithm assertions must not ask the same solver being tested to prove its own correctness.

Before delivery, run type checking, lint, engine and session tests, browser tests, and the production build. Open the production preview to inspect layout and worker asset paths. The README documents installation, development, checking, building, previewing, and static deployment, including the supported difficulties and lesson techniques.

## 11. Default decisions and future scope

Details not previously specified are resolved as these first-release defaults: Chinese interface copy; three logically rated difficulties; the six lessons above; Medium daily challenges that change in Beijing time; separate assisted results; resumable progress in each mode; and theme settings.

Later releases may add accounts and synchronization, global leaderboards, advanced techniques, puzzle import, and offline installation. Maintain clear boundaries between the engine, interface, and storage to support future development. Server implementations for those future features are outside the first release.
