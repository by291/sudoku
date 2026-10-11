# Web Sudoku Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete Chinese-language, browser-local Sudoku game with free play, six guided lessons, daily challenges, reliable restoration, and personal records.

**Architecture:** A pure TypeScript Sudoku engine supplies rules, deterministic generation, and explainable deductions. A shared game workflow owns session transitions and Pinia orchestration; infrastructure owns worker execution, IndexedDB transactions, and editing ownership. Vue pages present these workflows without implementing Sudoku rules or writing directly to the database.

**Tech Stack:** Vue 3, TypeScript, Vite, Vue Router, Pinia, Web Workers, IndexedDB with idb, native CSS, pnpm, ESLint, Prettier, Vitest, and Playwright.

**Spec:** [Approved first-release design](../specs/2026-10-11-sudoku-design.md). Also read [repository guidelines](../../../AGENTS.md).

## Global Constraints

- Write documentation, identifiers, comments, docstrings, and test descriptions in English; write player-facing copy in Chinese.
- Deliver a static website; accounts, synchronization, friends, global rankings, puzzle import, and offline installation are deferred.
- Select compatible stable versions at installation time, commit a pnpm lockfile when authorized, and check installed versions before using version-specific APIs. Resolved dependency versions are recorded in pnpm-lock.yaml; TypeScript 6.0.3 remains within the installed lint parser support range.
- Use strict TypeScript, Vue SFCs with `<script setup lang="ts">`, Composition API, typed props/emits, and named Pinia actions. Keep the engine independent of frameworks, browser APIs, and persistence.
- Use hash routes `/`, `/play/free`, `/learn`, `/learn/:lessonId`, `/play/daily`, and `/records`; support a 360-pixel-wide viewport without horizontal overflow.
- Board size is 81 cells; empty is 0; digits are integers 1 through 9. Givens are immutable, and undo affects entries and notes only.
- Difficulty is determined by logical techniques: singles for Easy; additional locked candidates for Medium; additional naked/hidden pairs for Hard. Unsupported puzzles are rejected.
- Generation allows at most 20 layouts and 1,000,000 search nodes in total; each logical analysis allows at most 500 steps. Worker timeout is 15,000 milliseconds. Save running time every 5,000 milliseconds.
- Daily difficulty is Medium; the challenge date changes at midnight in `Asia/Shanghai`. Daily output must depend on its date and puzzle version, never elapsed execution time.
- Assistance remains recorded after undo, hint dismissal, and daily restart. Restored sessions are paused, and save success is shown only after transaction completion.
- Review relevant official references before each new implementation area, reusing guidance already reviewed in this task. Check the repository's conventions before adding abstractions; do not split every control into a separate feature.
- Run checks appropriate to each deliverable. Do not suppress diagnostics or treat a Vite build as TypeScript verification. Commit only when the user explicitly requests it; task completion alone does not authorize a commit.

## Review Focus

1. A structurally plausible saved record contains a wrong solution, illegal note mask, or inconsistent history: quarantine that record while preserving valid saves (Tasks 2 and 7).
2. A worker completes after cancellation, navigation, or replacement of a session: its response cannot alter the current game or assistance statistics (Tasks 5 and 9).
3. An editing tab freezes, its lease expires, and another tab takes over: the old owner cannot overwrite the new owner's changes (Task 8).
4. A challenge crosses Beijing midnight or the device wall clock changes during play: preserve the original challenge date and measure elapsed play with a monotonic clock (Tasks 6 and 12).
5. Storage fails, or all data is cleared while another tab has pending writes: show failure truthfully, support safe retry, and prevent deleted data from reappearing (Tasks 7, 8, and 13).

---

## File Responsibilities and Execution Order

The initial repository contained only `AGENTS.md` and the approved design. The application files below were created by their owning tasks. Unit tests live beside the workflow they verify; shared fixtures and browser tests live under `tests/`.

| Area           | Files                                                                                                                                                                                                                                                 | Responsibility                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tooling        | `package.json`, `pnpm-lock.yaml`, `index.html`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.worker.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `playwright.config.ts` | Compatible dependency versions, strict browser/worker types, linting, formatting, unit tests, build and browser checks |
| Application    | `src/app/main.ts`, `App.vue`, `router.ts`, `theme.ts`, `HomePage.vue`                                                                                                                                                                                 | Bootstrap, hash routes, shell, theme, resume entry points                                                              |
| Engine         | `src/core/sudoku/types.ts`, `board.ts`, `search.ts`, `logic.ts`, `techniques.ts`, `hint.ts`, `generation.ts`, `templates.ts`                                                                                                                          | Domain contracts, rules, bounded search, logical evidence, seeded generation, verified fallback catalog                |
| Game workflow  | `src/features/game/session.ts`, `timer.ts`, `useGameStore.ts`, `useGameLifecycle.ts`, `useGameKeyboard.ts`, `GamePage.vue`, `SudokuBoard.vue`, `GameControls.vue`, `HintPanel.vue`                                                                    | Pure state transitions, clock, runtime orchestration, shared input, board, controls, hints                             |
| Learning       | `src/features/learning/lessons.ts`, `useLearningStore.ts`, `LearningPage.vue`, `LessonPage.vue`                                                                                                                                                       | Validated lesson examples, exercises, durable progress, full practice games                                            |
| Daily policy   | `src/features/game/daily.ts`, `DailyPage.vue`                                                                                                                                                                                                         | Beijing dates, versioned seeds, formal attempts, replays, daily restart rules                                          |
| Records        | `src/features/records/records.ts`, `useRecordsStore.ts`, `RecordsPage.vue`                                                                                                                                                                            | History, free-play bests, daily totals/streaks, local-data controls                                                    |
| Infrastructure | `src/infrastructure/worker/protocol.ts`, `client.ts`, `sudoku.worker.ts`; `src/infrastructure/storage/records.ts`, `database.ts`, `repository.ts`, `saveQueue.ts`; `src/infrastructure/ownership.ts`                                                  | Typed transport, runtime validation, transactional storage, serialized writes, fenced editing leases                   |
| Presentation   | `src/styles/theme.css`, `global.css`                                                                                                                                                                                                                  | Shared variables, reset, application-wide accessibility and layout rules; component styles remain scoped               |
| Verification   | `tests/fixtures/sudoku.ts`, `tests/support/referenceSudoku.ts`, `tests/support/gameFixtures.ts`, `tests/e2e/*.spec.ts`, `tooling/module-boundaries.test.ts`                                                                                           | Independent puzzle oracle, explicit game fixtures, production-preview player flows, dependency checks                  |

Implementation defaults introduced here: puzzle version `sudoku-v1`; database schema version 1 and record format version 1; fallback verification gets a separate 1,000,000-node budget; editing leases last 6,000 milliseconds and renew every 2,000 milliseconds. These are named constants, not scattered literals. Changing generation order, PRNG, templates, or difficulty rules requires a new puzzle version.

Tasks 1–8 establish contracts; Task 9 integrates them; Tasks 10–13 deliver the player workflows; Task 14 verifies the complete production build. Preserve this dependency order even if the user chooses delegated execution.

## Task 1: Working Application Shell and Development Checks

**Files:** Create the tooling files above except `playwright.config.ts`, the application files, both global CSS files, `src/app/App.test.ts`, and `tooling/module-boundaries.test.ts`.

**Interfaces:** Consumes the approved design and `AGENTS.md`. Produces a mounted Vue/Pinia application, `router` using `createWebHashHistory()`, and `useTheme(): { preference: Ref<ThemePreference>; setTheme(value: ThemePreference): void }`, where `ThemePreference = 'light' | 'dark' | 'system'`. Persistence is added in Task 13; this task provides functional theme switching and the home route.

- [x] Inspect `node --version`, `pnpm --version`, and official Vue/Vite/TypeScript/tooling guidance. Choose mutually compatible stable packages, pin the package-manager version in `package.json`, install dependencies, and record resolved versions in the lockfile. Preserve the existing repository and documentation; do not run a scaffold command that replaces the directory.
- [x] Configure strict application, tooling, and worker TypeScript projects; ESLint with Vue/TypeScript support; Prettier; and Vitest. Add `@vue/test-utils`, a DOM test environment, and `fake-indexeddb` as development dependencies. Define `dev`, `typecheck`, `lint`, `format:check`, `test:unit`, `build`, and `preview` scripts; `typecheck` checks Vue, tooling, and worker projects separately.
- [x] Write `App.test.ts` with test `changes themes and exposes an accessible home landmark`: mount the real shell, activate the Chinese theme controls, assert the selected preference and effective theme, and assert a named main landmark. Test system theme changes and listener cleanup. Run `pnpm test:unit src/app/App.test.ts`; expect failure because the shell/theme behavior is absent.
- [x] Implement the bootstrap, home route, shell, native CSS variables, keyboard focus styling, and light/dark/system themes. Use `matchMedia` only in the application layer and dispose its listener. Provide a real home introduction; add mode entry points as their routes become functional in later tasks.
- [x] Add dependency-boundary checks: core cannot import application/features/infrastructure or browser globals; game session transitions cannot import Pinia, DOM, workers, or database code; feature pages cannot import database implementation files. Enforce import restrictions with ESLint and verify the restricted graph in `module-boundaries.test.ts`.
- [x] Run `pnpm test:unit src/app/App.test.ts tooling/module-boundaries.test.ts`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build`. Expected: passing checks and a navigable home page with usable theme controls.

## Task 2: Board Rules and Bounded Solution Counting

**Files:** Create `src/core/sudoku/types.ts`, `board.ts`, `search.ts`, `board.test.ts`, `search.test.ts`, `tests/fixtures/sudoku.ts`, and `tests/support/referenceSudoku.ts`.

**Interfaces:** Produces the following public contracts. `Board` and `NoteMask[]` are validated to contain exactly 81 items at external boundaries; cell indices are validated integers 0–80. Digit bit `digit - 1` in a note mask represents that digit, with allowed masks 0–511.

```ts
type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
type CellValue = 0 | Digit
type Board = readonly CellValue[]
type NoteMask = number
type Difficulty = 'easy' | 'medium' | 'hard'
type ParseResult<T> = { valid: true; value: T } | { valid: false; issues: readonly string[] }
type SearchResult =
  | { status: 'complete'; count: 0 | 1 | 2; solution: Board | null; nodesVisited: number }
  | { status: 'budget-exhausted'; nodesVisited: number }

declare function parseBoard(value: unknown): ParseResult<Board>
declare function findConflicts(board: Board): readonly number[]
declare function isComplete(board: Board): boolean
declare function calculateCandidates(board: Board): readonly NoteMask[]
declare function countSolutions(
  board: Board,
  options: { maxSolutions: 2; nodeBudget: number },
): SearchResult
declare function countReferenceSolutions(board: readonly number[], limit: number): number // test-only, independent
```

- [x] Write literal fixtures: solved board `534678912672195348198342567859761423426853791713924856961537284287419635345286179`; unique puzzle `530070000600195000098000060800060003400803001700020006060000280000419005000080079`; an all-zero board; the unique puzzle with cell 2 set to 5 (conflicting); and the unique puzzle with cell 2 set to 1 (locally valid but unsatisfiable). Independently verify the latter two counts. Export these as `solvedBoard`, `uniqueBoard`, `emptyBoard`, `conflictingBoard`, and `unsatisfiableBoard`. Test names include `rejects malformed boards`, `distinguishes zero one and multiple solutions`, and `never reports uniqueness after budget exhaustion`.
- [x] Add independent assertions: removing cell 0 from the solved fixture yields only candidate 5 there; filled cells have mask 0; a duplicate is reported in its row/column/box; a full valid fixture is complete; empty-board counting stops at 2; a zero-node budget produces `budget-exhausted`. Run `pnpm test:unit src/core/sudoku/board.test.ts src/core/sudoku/search.test.ts`; expect missing-engine failures.

```ts
expect(countSolutions(emptyBoard, { maxSolutions: 2, nodeBudget: 0 })).toMatchObject({
  status: 'budget-exhausted',
  nodesVisited: 0,
})
expect(countReferenceSolutions(uniqueBoard, 2)).toBe(1)
```

- [x] Implement the contracts using named size/unit/mask constants and constrained backtracking. Count every visited search node against the passed budget; return no success-shaped uniqueness result on exhaustion. Reject malformed runtime data with explicit issues; locally conflicting boards have zero solutions.
- [x] Implement the test-only reference counter with an independent exact-cover approach, without importing engine rules/search. Verify it against the literal fixtures before using it to validate generated puzzles; include its own assertions in `search.test.ts`.
- [x] Run the two test files, `pnpm typecheck`, and `pnpm lint`. Expected: fixed known answers, independent zero/one/multiple counts, explicit inconclusive budget outcomes, and no forbidden dependencies.

## Task 3: Logical Techniques and Honest Hint Analysis

**Files:** Create `src/core/sudoku/techniques.ts`, `logic.ts`, `hint.ts`, `logic.test.ts`, and `hint.test.ts`; extend shared fixtures/types.

**Interfaces:** Consumes `Board`, `Digit`, `NoteMask`, `Difficulty`, and candidate/rule functions from Task 2. Produces `Technique = 'naked-single' | 'hidden-single' | 'locked-candidate' | 'naked-pair' | 'hidden-pair'`; `Unit = { kind: 'row' | 'column' | 'box'; index: number }`; `LogicalState = { board: Board; candidates: readonly NoteMask[] }`. A `LogicalStep` is a discriminated placement `{ kind: 'placement'; cell: number; digit: Digit }` or elimination `{ kind: 'elimination'; removals: readonly { cell: number; digit: Digit }[] }`, combined with `{ technique: Technique; evidence: { unit: Unit; cells: readonly number[]; digits: readonly Digit[] } }`.

```ts
declare function findLogicalStep(
  state: LogicalState,
  allowed: readonly Technique[],
): LogicalStep | null
declare function analyzeLogic(
  board: Board,
  allowed: readonly Technique[],
  stepBudget: number,
): {
  status: 'solved' | 'stalled' | 'budget-exhausted'
  board: Board
  steps: readonly LogicalStep[]
}
declare function rateDifficulty(board: Board, stepBudget: number): Difficulty | null
type HintResult =
  | { kind: 'review-entry'; cell: number }
  | { kind: 'deduction'; steps: readonly LogicalStep[]; placement: { cell: number; digit: Digit } }
  | { kind: 'unavailable'; reason: 'complete' | 'unsupported' | 'budget-exhausted' }
declare function analyzeHint(board: Board, solution: Board, stepBudget: number): HintResult
declare function explainStep(step: LogicalStep): string // Chinese technique wording and evidence
```

- [x] Write `logic.test.ts` with explicit placement/removal/evidence expectations for each technique, including row/column/box variants and negative lookalikes. Examples: row cells 0 and 1 are exactly `{1,2}`, cell 2 is `{1,2,3}`, so a naked-pair step removes 1 and 2 from cell 2; a hidden pair removes extra candidates only where both digits have the same two allowed cells. Test locked candidates in both pointing and claiming directions. Do not derive expected steps with the analyzer under test.
- [x] Write `hint.test.ts`: arbitrary/wrong player notes cannot change hints; an entry differing from the literal solution yields `review-entry` without mutation; correct entries produce an elimination sequence ending in a provable placement; unsupported analysis never exposes a search answer. Run `pnpm test:unit src/core/sudoku/logic.test.ts src/core/sudoku/hint.test.ts`; expect missing-analysis failures.
- [x] Implement deterministic logical workspaces and evidence: technique order follows the declared union order; break ties by unit kind row/column/box, then unit index, cell index, and digit. Apply eliminations to the workspace until placement/solve/stall, with a 500-step production cap. Each rating starts with a fresh workspace and requires the lower tier to stall before accepting the next tier.
- [x] Implement `analyzeHint` from filled values, comparing entries to the stored solution first; do not accept player notes as an input. Keep explanation data shared and framework-free so lessons and game hints can use `explainStep`.
- [x] Run the two test files, `pnpm typecheck`, and `pnpm lint`. Expected: exact independently justified deductions, stable ordering, correct tier boundaries, and explicit unsupported/budget outcomes.

## Task 4: Seeded Generation and Verified Fallback Puzzles

**Files:** Create `src/core/sudoku/generation.ts`, `templates.ts`, and `generation.test.ts`; extend `tests/fixtures/sudoku.ts` with literal tier fixtures.

**Interfaces:** Consumes Task 2 search and Task 3 rating. Produces `Puzzle = { givens: Board; solution: Board; difficulty: Difficulty; seed: string; puzzleVersion: string }`, `GenerationInput = { seed: string; difficulty: Difficulty; puzzleVersion: string }`, and:

```ts
type GenerationLimits = {
  maxLayouts: number
  searchNodes: number
  logicalSteps: number
  fallbackNodes: number
}
type GenerationResult =
  | { status: 'ready'; puzzle: Puzzle; source: 'generated' | 'fallback' }
  | { status: 'budget-exhausted'; stage: 'fallback-validation' }
  | { status: 'failed'; reason: string }
declare function generatePuzzle(input: GenerationInput, limits?: GenerationLimits): GenerationResult
```

- [x] Curate at least one literal, uniquely solvable template for each difficulty with a literal solution and reviewed technique proof. Establish the exact Easy/Medium/Hard classifications using independently checked deduction witnesses, and independently count uniqueness. Store them in `templates.ts`; do not invent a difficulty based on clue count.
- [x] Write `generation.test.ts`: identical seed/version/difficulty yields identical givens and solution; every tier matches its known fixture; fixed seeds `generation-01`, `generation-02`, `generation-03` per tier yield valid, unique, logically solvable puzzles; zero generation budget selects a deterministic verified fallback; zero fallback validation budget returns `budget-exhausted`. Use the independent reference counter for generated uniqueness. Run the file; expect absent-generation failures.
- [x] Implement deterministic string hashing with FNV-1a and a documented Mulberry32 PRNG, solution construction, seeded removal order, cumulative node accounting, and technique-based acceptance. Count solution construction and all removal searches against the same 1,000,000-node generation budget across at most 20 layouts. Do not consult wall time in core generation.
- [x] Implement seeded template selection and valid Sudoku transformations: digit permutation, row swaps within bands, column swaps within stacks, band/stack swaps, and optional transposition. Revalidate transformed uniqueness and difficulty with the separate 1,000,000-node fallback budget; explicit failure must not return an unverified puzzle. Freeze templates and algorithm ordering under `sudoku-v1`.
- [x] Run `pnpm test:unit src/core/sudoku/generation.test.ts`, `pnpm typecheck`, and `pnpm lint`. Expected: deterministic bounded output for all tiers, independently unique generated fixtures, and no false success after either budget is exhausted.

## Task 5: Worker Execution, Cancellation, and Stale-Response Protection

**Files:** Create `src/infrastructure/worker/protocol.ts`, `client.ts`, `sudoku.worker.ts`, and `client.test.ts`; finalize worker type-check configuration.

**Interfaces:** Consumes `GenerationInput`, `Puzzle`, `Board`, `HintResult`, `generatePuzzle`, and `analyzeHint`. Produces request messages with `{ requestId: string }` and discriminated `kind: 'generate' | 'hint'` payloads; responses echo the ID and operation kind. Runtime-validate messages. Public client contract:

```ts
type WorkerOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'timed-out' }
  | { status: 'budget-exhausted'; message: string }
  | { status: 'failed'; message: string }
interface SudokuWorkerClient {
  generate(input: GenerationInput, signal?: AbortSignal): Promise<WorkerOutcome<Puzzle>>
  hint(board: Board, solution: Board, signal?: AbortSignal): Promise<WorkerOutcome<HintResult>>
  dispose(): void
}
declare function createSudokuWorkerClient(): SudokuWorkerClient
```

- [x] Write `client.test.ts` using an injected fake Worker transport and fake timers: success maps to its own request; unknown IDs/malformed replies are rejected; cancellation settles once; after exactly 15,000 milliseconds the worker is terminated and the result is `timed-out`; late replies cannot complete a later request; retry uses the identical generation input. Run the file; expect missing-client failures.
- [x] Implement one disposable worker per active job so synchronous engine computation can be stopped by termination. Create it with Vite's documented literal `new Worker(new URL('./sudoku.worker.ts', import.meta.url), { type: 'module' })` pattern. Clear timers/listeners and terminate on every terminal outcome; disposal resolves pending work as cancelled.
- [x] Implement worker dispatch without adding Sudoku rules to infrastructure. Map engine budget/failure outcomes explicitly; do not catch every error and return a puzzle. Keep request validation separate from domain algorithms.
- [x] Run `pnpm test:unit src/infrastructure/worker/client.test.ts`, `pnpm typecheck`, and `pnpm build`. Expected: all outcomes settle once and the build emits the worker asset. Real asset loading is exercised in Task 14.

## Task 6: Pure Session Actions, History, and Monotonic Timing

**Files:** Create `src/features/game/session.ts`, `timer.ts`, `session.test.ts`, and `timer.test.ts`; create `tests/support/gameFixtures.ts`.

**Interfaces:** Consumes `Puzzle`, board rules, and hint results. Produces `GameMode = 'free' | 'learning' | 'daily'`, `SessionPhase = 'generating' | 'playing' | 'paused' | 'completed' | 'failed'`, and `GameSession`. Its persisted fields are `id: string`, `puzzle: Puzzle`, `mode: GameMode`, `entries: Board`, `notes: readonly NoteMask[]`, `undoStack`/`redoStack` (readonly history arrays), `elapsedMs: number`, `assistance`, `startedAt: string`, `completion`, and `metadata`; runtime phase is separate. `assistance` has numeric `hintCount`/`checkCount`/`candidateCount` and boolean `assisted`. `completion` is null or `{ completedAt: string; elapsedMs: number }`. Metadata is `{ kind: 'free' } | { kind: 'learning'; lessonId: string } | { kind: 'daily'; challengeDate: string; formalAttempt: boolean }`; its kind determines `mode`. History holds `{ before: { entries: Board; notes: readonly NoteMask[] }; after: { entries: Board; notes: readonly NoteMask[] } }`. Givens remain in `puzzle.givens`; entries at given cells stay zero.

```ts
type GameAction =
  | { kind: 'enter'; cell: number; digit: Digit }
  | { kind: 'erase'; cell: number }
  | { kind: 'toggle-note'; cell: number; digit: Digit }
  | { kind: 'generate-notes' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'hint-shown' }
  | { kind: 'check' }
declare function createSession(
  puzzle: Puzzle,
  metadata: GameSession['metadata'],
  id: string,
  startedAt: string,
): GameSession
declare function applySessionAction(
  session: GameSession,
  action: GameAction,
): { session: GameSession; changed: boolean; boardComplete: boolean }
declare function completeSession(
  session: GameSession,
  completedAt: string,
  elapsedMs: number,
): GameSession
type RunClock = { accumulatedMs: number; runningSince: number | null }
declare function readElapsed(clock: RunClock, now: number): number
declare function resumeClock(clock: RunClock, now: number): RunClock
declare function pauseClock(clock: RunClock, now: number): RunClock
```

- [x] Write `session.test.ts`: givens cannot be edited; notes toggle; entry clears own and peer notes atomically; erase does not restore them; undo/redo restores exactly both layers; repeated entry creates no history; new edits clear redo; full invalid boards do not complete; completion is idempotent. Assert hint/check/generated-notes assistance survives undo and cannot be cleared by ordinary history actions. Run the file; expect absent-session failures.
- [x] Write `timer.test.ts`: run from monotonic 100 to 1,600 yields 1,500 milliseconds; pause then advancing to 50,000 adds no time; resume adds only its new interval; wall-clock jumps do not affect elapsed time. A restored session starts with its persisted elapsed time and `runningSince: null`. Run the file; expect absent-clock failures.

```ts
const clock = resumeClock({ accumulatedMs: 0, runningSince: null }, 100)
const paused = pauseClock(clock, 1600)
expect(readElapsed(paused, 50000)).toBe(1500)
```

- [x] Implement immutable transitions and runtime argument validation. Keep the running clock out of persisted records; retain fractional monotonic precision internally and floor total milliseconds only for persistence/completion. Effective entry, notes, helper-statistic, and history changes signal `changed`; selection and no-op entry do not. Notes only occupy empty editable cells; erase clears that cell's entry/notes, never restores peer notes; generated candidates replace notes atomically. Checking marks assistance even when no wrong entries exist, and generating candidates marks assistance even when candidate notes already match.
- [x] Implement idempotent completion that locks the final result, stops accepting session edits, and never removes an earlier recorded completion through undo. Hint application uses the same `enter` action after `hint-shown` has already been recorded.
- [x] Run both test files, `pnpm typecheck`, and `pnpm lint`. Expected: atomic reversible board changes, irreversible helper statistics, and elapsed-time behavior independent of wall-clock changes.

## Task 7: Validated IndexedDB Records and Transactional Repository

**Files:** Create `src/infrastructure/storage/records.ts`, `database.ts`, `repository.ts`, `repository.test.ts`, and `records.test.ts`.

**Interfaces:** Consumes `GameSession`, `ParseResult`, and engine validation. Produces `SessionRecord = { formatVersion: 1; revision: number; session: GameSession }`, `ResultRecord = { formatVersion: 1; session: GameSession }` restricted to completed sessions, `LessonProgress = { lessonId: string; completedAt: string }`, and `Settings = { theme: ThemePreference; showTimer: boolean; highlightConflicts: boolean }`. `StorageFailure = { kind: 'unavailable' | 'write-failed' | 'ownership-lost' | 'revision-conflict'; message: string }`; `StorageOutcome<T> = { ok: true; value: T } | { ok: false; error: StorageFailure }`.

Public repository reads are `listSessions(): Promise<StorageOutcome<readonly SessionRecord[]>>`, `listResults(): Promise<StorageOutcome<readonly ResultRecord[]>>`, `readSettings(): Promise<StorageOutcome<Settings>>`, and `readLessonProgress(): Promise<StorageOutcome<readonly LessonProgress[]>>`. Writes are `writeSettings(settings: Settings)`, `writeLessonProgress(progress: LessonProgress)`, and `removeQuarantined(): Promise<StorageOutcome<void>>`, all returning `Promise<StorageOutcome<void>>`. Session writes are deliberately added with ownership enforcement in Task 8.

- [x] Write validation tests starting from explicit session fixtures: reject length 80, fractional digits, mask 512, entries on givens, solution/given mismatch, an invalid completed solution, negative duration, invalid IDs/date metadata, unsupported record versions, and inconsistent undo layers. Wrong player entries are valid gameplay data and must not be rejected merely for differing from the solution. Accept an otherwise valid saved puzzle from an older nonempty puzzle version without regenerating it. Run the two test files; expect absent-storage failures.
- [x] Test database creation/upgrade from version 0 to schema 1, settings/progress round trips, and mixed valid/corrupt records. Assert corrupt records move to quarantine atomically, valid records remain readable, and cleanup removes only quarantined data. Do not invent historical schema migrations that the repository has never shipped.
- [x] Implement `parseSessionRecord(value: unknown): ParseResult<SessionRecord>` and analogous result/settings/progress validators. Validate solutions as full Sudoku boards consistent with givens; validate history continuity, current undo/redo endpoints, mode/metadata agreement, and given protection without treating unfinished player conflicts as corruption. IDs are nonempty strings of at most 200 characters; timestamps are valid ISO instants; durations/counters/revisions are nonnegative integers; puzzle versions are nonempty strings. Persist schema and record format versions independently.
- [x] Implement `parseResultRecord(value: unknown): ParseResult<ResultRecord>`, `parseSettings(value: unknown): ParseResult<Settings>`, and `parseLessonProgress(value: unknown): ParseResult<LessonProgress>`. Open a typed idb database with stores `sessions`, `results`, `lessons`, `settings`, `quarantine`, `leases`, and `meta`, exporting `openSudokuDatabase()` and grouping the public read/write functions in a `GameRepository` interface. Session indexes are `by-mode`, `by-date`, and `by-lesson`; result keys use stable session IDs. Initialize dataset epoch in `meta` for Task 8. Await `tx.done` before reporting success; never await workers, network, or unrelated asynchronous work inside a transaction.
- [x] Implement typed repository errors and explicit failure notices as data for later stores. A read failure must not be converted into an apparently empty successful history. Test transaction abort and unavailable IndexedDB paths.
- [x] Run `pnpm test:unit src/infrastructure/storage/records.test.ts src/infrastructure/storage/repository.test.ts`, `pnpm typecheck`, and `pnpm lint`. Expected: truthful errors, independent record/schema validation, and preservation of valid local data.

## Task 8: Single-Tab Editing, Serialized Saves, and Safe Data Reset

**Files:** Create `src/infrastructure/ownership.ts`, `ownership.test.ts`, `src/infrastructure/storage/saveQueue.ts`, and `saveQueue.test.ts`; extend repository/database tests and implementation.

**Interfaces:** Consumes Task 7 records/outcomes. Produces `OwnershipToken = { sessionId: string; ownerId: string; fence: number; epoch: number }`, `acquireOwnership(sessionId: string, ownerId: string): Promise<StorageOutcome<OwnershipToken | null>>`, `renewOwnership(token: OwnershipToken): Promise<StorageOutcome<boolean>>`, and `releaseOwnership(token: OwnershipToken): Promise<StorageOutcome<void>>`. Null means another live owner, not storage failure. Add repository `writeSession(session: GameSession, expectedRevision: number, token: OwnershipToken): Promise<StorageOutcome<SessionRecord>>` and `clearAll(): Promise<StorageOutcome<void>>`. A session write also inserts its completed result idempotently in the same transaction when applicable.

Add `replaceActiveSession(session: GameSession, token: OwnershipToken, previous: { id: string; revision: number; token: OwnershipToken } | null): Promise<StorageOutcome<SessionRecord>>`. This atomically creates the new free/learning record at revision 1 and removes its previous session record, checking both ownership tokens and the mode's current slot. Completed result history is retained. Expected revision 0 means a previously absent record for ordinary session creation; a conflicting existing record is never overwritten.

`createSaveQueue(token: OwnershipToken, initialRevision: number): SaveQueue` returns `{ enqueue(session: GameSession): Promise<StorageOutcome<SessionRecord>>; flush(): Promise<StorageOutcome<void>>; retry(): Promise<StorageOutcome<void>>; dispose(): void }`. Queue snapshots are copied at enqueue time; a newer pending snapshot may subsume an older failed write, but old data cannot overwrite new data. Group acquire/renew/release in `OwnershipCoordinator`; extend `GameRepository` with Task 8's storage methods.

- [x] Write `ownership.test.ts`: two simultaneous acquisitions yield one owner; after 6,000 milliseconds a new owner obtains a higher fence; a stale owner fails to renew/write; release enables takeover; BroadcastChannel notifications update peer status. Assert transaction enforcement still works when messages are delayed or unavailable. Run the file; expect absent-ownership failures.
- [x] Write `saveQueue.test.ts`: delayed writes preserve revision order; mutating caller data cannot change an enqueued snapshot; an aborted write never reports saved; retry commits the latest state without erasing newer peer changes; completion retried twice produces one result; competing free/learning replacements leave one active slot and cannot bypass another owner. Test clear-all with a paused pending write: the old epoch is rejected and neither session nor result reappears. Run the file; expect missing-queue failures.
- [x] Implement atomic lease acquisition/renewal and fences in IndexedDB. Use a per-tab random owner ID, a 6,000-millisecond lease, and 2,000-millisecond renewal; BroadcastChannel communicates changes, while the transaction determines ownership. Every session write checks epoch, lease owner/fence/expiry, and expected revision in the same read/write transaction as the session/result write. No `force` save may bypass these checks.
- [x] Implement serialized saves and result insertion with stable IDs. Ownership/revision loss stops editing and requires a fresh reload/acquisition; it must not be treated as an ordinary write retry. If IndexedDB becomes unavailable, an already active game may continue in memory with a persistent unsaved notice, but durable writes resume only after valid ownership and revision are re-established.
- [x] Implement `clearAll` as one transaction: clear player data/quarantine/leases and advance the dataset epoch. Notify tabs to cancel workers and queues, pause/drop their old sessions, and reload the empty catalog. Keep the epoch marker so old tabs cannot resurrect cleared data.
- [x] Run the ownership, save-queue, and repository tests, `pnpm typecheck`, and `pnpm lint`. Expected: one durable editor per session, serialized revision-safe saves, idempotent results, and reset that invalidates every stale writer.

## Task 9: Pinia Game Runtime and Resource Lifecycle

**Files:** Create `src/features/game/useGameStore.ts`, `useGameLifecycle.ts`, and `useGameStore.test.ts`; extend application dependency wiring.

**Interfaces:** Consumes worker client, session/clock functions, repository, ownership, and save queue. Produces `useGameStore` with reactive `phase: SessionPhase`, `session: GameSession | null`, `selectedCell: number | null`, `noteMode: boolean`, `hint: HintResult | null`, `saveState: 'idle' | 'saving' | 'saved' | 'failed'`, `readOnly: boolean`, and explicit `error: string | null` plus computed board/time/conflicts/history availability. Public actions:

```ts
interface GameStoreActions {
  startGame(
    input: GenerationInput,
    metadata: GameSession['metadata'],
    replaceId?: string,
  ): Promise<void>
  restoreSession(id: string): Promise<void>
  dispatch(action: GameAction): void
  selectCell(cell: number): void
  toggleNoteMode(): void
  requestHint(): Promise<void>
  applyHint(): void
  dismissHint(): void
  pause(): void
  resume(): Promise<void>
  cancelLoading(): void
  retrySave(): Promise<void>
  restartFree(): Promise<void>
}
```

`useGameLifecycle(): void` installs owned route/visibility/timing cleanup for the shared game screen. Provide `GameRuntime = { worker: SudokuWorkerClient; repository: GameRepository; ownership: OwnershipCoordinator; createSaveQueue: (token: OwnershipToken, revision: number) => SaveQueue; monotonicNow: () => number; wallNow: () => Date; createId: () => string; ownerId: string }` through a typed Vue injection key at bootstrap. Tests supply the same interface to real Pinia actions; no global test switches in production code.

- [x] Write real-action Pinia tests with injected worker/storage/clock fakes: generating → playing/failed/cancelled; stale hint/generation replies after replacing a session are ignored; helper counts change only when the current hint is shown; paused/read-only/completed states reject edits; restore is paused; a 5,000-millisecond timing save captures elapsed play; navigating/hiding pauses and saves; becoming visible does not automatically resume. Run `pnpm test:unit src/features/game/useGameStore.test.ts`; expect missing-runtime failures.
- [x] Implement actions so keyboard/touch/hints all call `dispatch`, then one completion/save path. Keep an operation epoch in addition to worker IDs; only a current response can affect the session. `requestHint` presents the response and records `hint-shown` once; dismissal and application do not increment it again.
- [x] Wire elapsed-time settlement, effective-action saves, periodic saves, completion, ownership renewal, and truthful save notices. Complete the session immediately in memory, but present result-save failure separately until the atomic session/result transaction succeeds. Repeated completion and retry cannot create another result. If storage is unavailable when starting a fresh game, allow memory-only play with a persistent save-failure notice; never interpret a failed restore/catalog read as an empty successful database. Another live owner remains read-only.
- [x] Implement `startGame` to replace an active free/learning session only after a verified new puzzle is ready, preserving the old save on generation failure. Use Task 8's `replaceActiveSession` and refresh the expected revision after settling pending writes; fail safely if the previous slot is owned by another tab. `restartFree` retains the puzzle, creates a new session ID, and resets that new session's timer/helpers. Keep completed history intact.
- [x] Implement lifecycle cleanup for clocks, polling/lease renewal, route guards, visibility listeners, save queues, and workers. Pause and flush before release when possible; abrupt exit retains the spec's pending-write/5-second durability limit. Show storage-failure, corruption, timeout/cancel, and other-tab states with Chinese actionable text.
- [x] Run store tests, `pnpm typecheck`, and `pnpm lint`. Expected: shared action semantics, isolated async results, automatic pause, durable restoration, and disposed resources.

## Task 10: Accessible Shared Board and Complete Free Play

**Files:** Create `src/features/game/GamePage.vue`, `SudokuBoard.vue`, `GameControls.vue`, `HintPanel.vue`, `useGameKeyboard.ts`, `GamePage.test.ts`, and `useGameKeyboard.test.ts`; extend home/router/theme styles.

**Interfaces:** Consumes the game store's state/actions. `SudokuBoard` has typed props `board: Board`, `givens: Board`, `notes: readonly NoteMask[]`, `selectedCell: number | null`, `conflicts: readonly number[]`, `hintCells: readonly number[]`, `disabled: boolean`, `obscured: boolean` and emit `select: [cell: number]`. Disabled prevents edits; obscured removes values/notes from visual and accessible presentation while paused. `GameControls` emits digits/erase/note/history/pause/helper/restart/new intentions; the page translates them to the same store actions. `useGameKeyboard(): void` owns keyboard listeners and disposal; it reads the active store rather than implementing Sudoku rules.

- [x] Write board/page tests: 81 accessible cells expose row/column/value/given/notes; givens are selectable but immutable; entry from controls and keyboard produces identical state; note mode and undo restore peer notes; pause obscures every digit/note and disables input; timer hiding does not stop elapsed time; restart/new-puzzle cancel leaves the old session intact. Write keyboard tests for all specified shortcuts and no interception in text fields, dialogs, editable text, or inactive routes. Run the two files; expect missing-UI failures.
- [x] Implement CSS Grid board and native controls with visible focus, row/column/box/matching highlights, optional duplicate-only conflicts, and markers/descriptions beyond color. Use scoped component CSS with shared theme variables. Keep templates free of Sudoku calculations; use named computed presentation data and `storeToRefs`.
- [x] Implement `/play/free` selection for Easy/Medium/Hard and the shared game screen; optional `?session=<id>` resumes a validated free session. Require confirmation for restart and replacement; provide cancel/retry during generation, an on-screen number pad, notes, generated candidates, checks, undo/redo, pause/resume, and time visibility. Present wrong-entry check locations separately from ordinary duplicate highlighting.
- [x] Implement stepwise hint evidence and explicit final-placement application. Revalidate that the hint still applies to the board it analyzed; clear obsolete hints after board edits. Chinese result feedback displays difficulty, elapsed time, and assisted status. Dialog focus must remain usable and return to its trigger.
- [x] Run component/keyboard/store tests, `pnpm typecheck`, and `pnpm lint`; inspect at 360, 390, and 1,280 pixels. Expected: square board, legible candidates, desktop side-by-side/mobile vertical controls, visible focus, and no horizontal overflow.

## Task 11: Six Guided Lessons and Full Learning Practice

**Files:** Create `src/features/learning/lessons.ts`, `useLearningStore.ts`, `LearningPage.vue`, `LessonPage.vue`, and `lessons.test.ts`; extend home/router and shared game page for learning mode.

**Interfaces:** Consumes logical evidence/explanations, persistence progress, and shared game runtime. Produces lesson IDs `rules`, `naked-single`, `hidden-single`, `locked-candidate`, `naked-pair`, `hidden-pair`; `Lesson = { id: string; title: string; introduction: string; board: Board; candidates: readonly NoteMask[]; explanation: string; exercise: Exercise; practiceDifficulty: Difficulty }`. `Exercise` is `{ kind: 'placement'; expected: { cell: number; digit: Digit } }` or `{ kind: 'elimination'; expected: readonly { cell: number; digit: Digit }[] }`. `checkExercise(lesson: Lesson, answer: Exercise['expected']): { correct: boolean; explanation: string }` performs exact answer validation. `useLearningStore` provides `load(): Promise<void>`, `selectLesson(id: string): void`, and `submitExercise(id: string, answer: Exercise['expected']): Promise<{ correct: boolean; explanation: string }>`.

- [x] Write `lessons.test.ts`: every ID has Chinese explanation, fixed valid example, explicit expected exercise answer, and independent technique witnesses; incorrect answers allow retry; correct answers persist completion; repeats do not duplicate progress; changing lessons retains completed progress. Rules/singles use Easy practice, locked candidates Medium, pairs Hard. Run the file; expect absent-lessons failures.
- [x] Implement literal lesson examples and exercise feedback with the same technique definitions as game hints. Compare elimination answers as sets of distinct cell/digit pairs: submission order is irrelevant, and extra/missing removals fail. Candidate elimination exercises use a dedicated local candidate workspace, not player-note authority or search answers. Save the current lesson in settings and validate its ID; extend the settings type/validator/tests with `currentLessonId: string | null` in this task.
- [x] Implement `/learn` and `/learn/:lessonId` with accessible example boards, fill/elimination submission, retries, saved progress, and links to full practice. Render the shared game within the lesson route when `?practice=1`; add `&session=<id>` for restoration, validating that the saved mode/lesson matches. Keep one active learning game; confirm replacement and retain prior lesson completion. Unknown lesson routes show a Chinese recovery link rather than throwing.
- [x] Run lesson tests, storage validation tests, `pnpm typecheck`, and `pnpm lint`. Expected: all six usable exercises, durable progress, consistent explanations, and a playable learning session excluded from speed bests.

## Task 12: Versioned Daily Challenges and Formal Attempt Rules

**Files:** Create `src/features/game/daily.ts`, `daily.test.ts`, and `DailyPage.vue`; extend the game store/session tests, router, and home page.

**Interfaces:** Consumes generation, persisted daily sessions/results, and the shared runtime. Produces `getChallengeDate(now: Date): string`, `getDailySeed(date: string, puzzleVersion: string): string`, and `restartDailySession(session: GameSession): GameSession`. Dates are validated `YYYY-MM-DD`; seeds use `daily:<version>:<date>`. Add store actions `startDaily(date: string): Promise<void>` and `restartDaily(): Promise<void>`. New formal daily sessions use deterministic ID `daily:<date>:formal`, independent of puzzle version; subsequent practice sessions get new IDs and `formalAttempt: false`. A version update cannot create a second formal attempt for the same date.

- [x] Write `daily.test.ts`: `2026-10-11T15:59:59.999Z` maps to `2026-10-11`, and `2026-10-11T16:00:00.000Z` to `2026-10-12`; seed/date output ignores device locale/time zone; midnight does not replace yesterday's unfinished save; restoring an old puzzle version preserves stored givens. Run the file; expect missing-policy failures.

```ts
expect(getChallengeDate(new Date('2026-10-11T15:59:59.999Z'))).toBe('2026-10-11')
expect(getChallengeDate(new Date('2026-10-11T16:00:00.000Z'))).toBe('2026-10-12')
expect(getDailySeed('2026-10-11', 'sudoku-v1')).toBe('daily:sudoku-v1:2026-10-11')
```

- [x] Add session/store tests: restarting an unfinished daily keeps its ID, formal eligibility, elapsed time, hint/check/candidate counts, and assisted flag while clearing entries/notes/history; only the first completed formal attempt writes the date's formal result; practice replays or version updates cannot replace it; simultaneous starts in two tabs converge on one formal session and one owner. Completing tomorrow belongs to the original date and is ineligible for that date's streak.
- [x] Implement Beijing-date conversion with explicit `Intl.DateTimeFormat` time zone and validated date parts, plus pure seed/restart policy. Keep actual time measurement in the monotonic clock. Date refresh updates availability while preserving the current session; do not infer challenge dates from UTC substrings or localized display strings.
- [x] Implement `/play/daily` with date/status, start/resume/replay, Medium difficulty, assistance classification, preserved-time restart confirmation, and Chinese explanation that challenges change at Beijing midnight. Optional `?session=<id>` restores a validated daily save, including older dates; otherwise show today's challenge. Existing saved puzzles always resume from storage; version changes create new seeds without regenerating saves.
- [x] Run daily, session, and store tests, `pnpm typecheck`, and `pnpm lint`. Expected: stable daily puzzles, one formal attempt per date, retained older challenges, and correct restart/replay semantics.

## Task 13: Personal Records, Resume Catalog, and Durable Preferences

**Files:** Create `src/features/records/records.ts`, `useRecordsStore.ts`, `RecordsPage.vue`, and `records.test.ts`; complete `HomePage.vue`, `theme.ts`, router, settings, and clear-data integration.

**Interfaces:** Consumes validated results/session catalog/settings and `getChallengeDate`. Produces `summarizeRecords(results: readonly ResultRecord[], today: string): RecordSummary`. `RecordSummary = { freeBests: Record<Difficulty, { assisted: number | null; unassisted: number | null }>; dailyTotals: { assisted: number; unassisted: number }; currentStreak: number; longestStreak: number }`; best values are milliseconds. Learning/practice daily sessions remain in history but never count as speed bests or formal daily totals. `useRecordsStore` exposes `sessions: readonly SessionRecord[]`, `results: readonly ResultRecord[]`, `summary: RecordSummary`, `error: string | null`, and actions `load(): Promise<void>` and `clearLocalData(): Promise<void>`. Home and records consume this catalog without database calls in page components.

- [x] Write `records.test.ts` with literal dates/times: assisted and unassisted free bests are separate; learning is excluded; daily practice is excluded; duplicate session IDs count once; late completion appears in history/totals but not streaks; a streak joins adjacent eligible challenge dates across month/year boundaries; current streak may end today or yesterday. Run the file; expect missing-summary failures.
- [x] Implement aggregation without mutating records and render `/records` with history, per-difficulty bests, daily totals, and streaks. State in Chinese that data belongs to this browser. Provide quarantine cleanup and clear-all confirmations with error/retry feedback; report cleared only after the reset transaction succeeds.
- [x] Complete home resume links for the active free game, current learning game/lesson, and all unfinished daily dates; show today's status. Persist and restore theme, timer visibility, and conflict highlighting through settings. Storage failure leaves the current in-memory preferences usable with an explicit unsaved notice.
- [x] Add integration tests: cancel-clear retains data; confirmed-clear removes sessions/results/lessons/settings and returns to default theme; another tab drops its old session; aborted-clear leaves recoverable data and shows failure. Ensure current-lesson metadata and settings validators agree with Task 11.
- [x] Run records, storage, ownership, and application tests, `pnpm typecheck`, and `pnpm lint`. Expected: accurate mode-aware records, complete resume access, durable preferences, and reset without stale data resurrection.

## Task 14: Production Browser Verification and Delivery Documentation

**Files:** Create `playwright.config.ts`, `tests/e2e/game.spec.ts`, `learning.spec.ts`, `daily.spec.ts`, `storage.spec.ts`, and `README.md`; refine existing code only to resolve observed acceptance failures.

**Interfaces:** Consumes the real production build and all player-facing workflows. Produces `test:e2e` and `check` scripts; `check` runs type checking, lint, formatting, unit tests, build, and browser tests. Playwright uses the production preview via `webServer`, with desktop Chromium and mobile touch/viewport projects, including an explicit 360-pixel overflow assertion.

- [x] Write player-oriented tests using roles/accessibility names: start each difficulty and mode; keyboard/touch edits and notes; undo/redo; hint explanation/application; pause/hide/refresh/restored pause; confirmation cancel/accept; all lesson exercises; game completion/results; preference restoration. Use explicit fixture sessions seeded into IndexedDB before page bootstrap for lengthy completion cases, keeping those fixtures separate from real-worker generation tests.
- [x] Add real production-worker tests for fixed generation seeds and hint jobs without transport mocks. Exercise a deployment subpath by building with a non-root base and verifying hash navigation, refresh, and worker asset requests. No console errors, failed worker requests, or placeholder mode pages may remain.
- [x] Add two-tab browser tests: second editor is read-only; owner release enables takeover; stale ownership cannot save; clear-all invalidates both tabs. Inject storage failures through a narrowly scoped browser test harness rather than permanent public application debug endpoints. Assert persistent failure notice, safe retry, and exactly one saved completion result.
- [x] Run `pnpm test:e2e`. Expected: passing production-preview flows on desktop and mobile, square/readable board without horizontal overflow at 360 pixels, and real worker assets loading. Fix observed failures with the owning task's unit regression test where meaningful.
- [x] Write English `README.md` with compatible runtime/package-manager versions, installation, development, type/lint/format/unit/browser checks, building/preview, static deployment/base path, difficulties/lessons, Beijing date policy, assistance classification, browser-local saves, and the documented abrupt-exit durability limit. Do not claim cross-device sync or offline installation.
- [x] Run `pnpm check` and inspect the production preview at desktop and mobile sizes for focus, touch targets, dark/system themes, candidate legibility, hint markers, dialogs, paused-board obscuring, and Chinese copy. Run `git diff --check` and inspect the final diff. Expected: all checks pass; report actual commands/results and any environment limitations without substituting an unrun check with a claim.

## Acceptance Coverage

| Design section                          | Owning tasks | Completion evidence                                                              |
| --------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| Goals, static scope, language           | 1, 10–14     | Real Chinese workflows, English documentation, production build                  |
| Pages, themes, responsive accessibility | 1, 10–14     | Hash navigation, theme tests, keyboard/touch flows, 360-pixel preview            |
| Board/actions/history/completion        | 2, 6, 9, 10  | Domain/store tests and shared-input browser flows                                |
| Free play                               | 4, 9, 10     | All difficulty seeds, confirm/restart/new, retained history                      |
| Learning                                | 3, 11        | Independent witnesses for six exercises, durable progress, full practice         |
| Daily challenge                         | 4, 8, 12, 13 | Boundary fixtures, deterministic versioned seeds, formal/replay/streak tests     |
| Engine, budgets, hints                  | 2–5, 10      | Independent uniqueness oracle, technique assertions, cancellation/timeout tests  |
| Timing and restoration                  | 6–9, 14      | Monotonic interval tests, automatic pause, refreshed paused state                |
| Local data and failures                 | 7–9, 13, 14  | Validation, quarantine, aborted transactions, fencing, retry/reset browser tests |
| Boundaries and readability              | 1–14         | Strict types, lint restrictions, named contracts, focused workflow review        |
| Verification and documentation          | 14           | `pnpm check`, production preview, English README, clean diff checks              |

## Official Reference Checkpoints

These references were reviewed during planning. At execution, confirm installed versions and revisit the relevant page when an API, version, or area changes.

- Tasks 1/9/10/11: [Vue TypeScript Composition API](https://vuejs.org/guide/typescript/composition-api.html), [Vue composables](https://vuejs.org/guide/reusability/composables.html), [Vue Router](https://router.vuejs.org/guide/), [Pinia core concepts](https://pinia.vuejs.org/core-concepts/), and [Pinia testing](https://pinia.vuejs.org/cookbook/testing.html). Store integration tests must execute real actions, rather than silently accepting stubbed behavior.
- Tasks 1–6: [TypeScript strict configuration](https://www.typescriptlang.org/tsconfig/strict.html), [Vite guide](https://vite.dev/guide/), [Vitest guide](https://vitest.dev/guide/), [eslint-plugin-vue](https://eslint.vuejs.org/), [typescript-eslint](https://typescript-eslint.io/), and [Prettier configuration](https://prettier.io/docs/configuration).
- Task 5: [Vite Web Workers](https://vite.dev/guide/features.html#web-workers) and [MDN Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Keep the worker URL constructor statically analyzable and terminate synchronous jobs for cancellation.
- Tasks 7/8: [idb transaction lifetime](https://github.com/jakearchibald/idb#transaction-lifetime) and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API). Awaiting `tx.done` establishes committed success; unrelated asynchronous work can let a transaction close prematurely.
- Task 14: [Playwright best practices](https://playwright.dev/docs/best-practices). Test observable player behavior through roles, names, and retrying assertions.

## Execution Outcome

The user approved this plan for inline execution in the current session and explicitly chose the current branch. All 14 tasks are implemented. The final independent review led to one regression-tested repair pass covering unsaved-state recovery, stale asynchronous continuations, epoch-fenced settings and lessons, keyboard lesson navigation, current-board check feedback, and identical-request generation retries.

Acceptance verification includes strict Vue/application/worker/tooling/browser-test types, ESLint, Prettier, unit tests, a production build, desktop/mobile Playwright flows, and a static deployment under `/sudoku/`. See [README.md](../../../README.md) for commands, runtime requirements, architecture, local-data behavior, and known limitations.

The user subsequently authorized fixing the remaining global arrow-key boundary issue and committing the complete implementation on `main` after successful checks. Global shortcuts now preserve the selected column at the top and bottom edges, matching focused-board and lesson navigation. Regression coverage includes every top/bottom cell and production-browser navigation with focus outside the board. No review findings remain deferred.
