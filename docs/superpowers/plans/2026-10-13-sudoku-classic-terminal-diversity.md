# Classic Terminal Diversity Implementation Plan

> Historical milestone: the user removed the Node CLI on 2026-10-13. CLI tasks, commands, and parity results below describe the earlier implementation and are no longer current requirements. The retained boundary suite now lives in `tests/module-boundaries.test.ts`. See the current README and the CLI-removal plan for active checks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native implementation. Steps use checkbox (`- [x]`) syntax.

**Goal:** Continue Phase B without historical generation compatibility: broader Classic terminals, shared generation assessment/budgets, and immediate current-version starts.

**Architecture:** One generation dispatcher; `classicGeneration.ts` owns terminal search, removals, and verified fallback. Variant orchestration shares the assessor. Default Worker/CLI delivery reuses the accepted summary; saved boards remain snapshots independent of construction.

**Tech Stack:** Installed TypeScript 6.0.3, pnpm 12.11.2, Node 26+, Vite 8.3.4, Vitest 5.0.3, Playwright 1.64.0 and existing adapters; no new dependencies.

**Spec:** [Generation design](../specs/2026-10-13-sudoku-generation-and-rating-design.md), including the continuation amendment; [Web Architecture](../../architecture.md); [AGENTS.md](../../../AGENTS.md).

**Status:** User authorized native continuation on 2026-10-13 without compatibility requirements. Implementation completed on `feat/internal-assessment`, with changes uncommitted until requested. See the [verification report](../verification/2026-10-13-sudoku-classic-terminal-diversity.md).

## Constraints

- Current generation versions: `sudoku-v2` and `sudoku-variants-v2`; assessment remains `sudoku-rating-v1`.
- Limits: `{ maxLayouts: 20, maxWork: 1000000, maxSteps: 500, fallbackWork: 1000000 }`. One aggregate construction budget and one separate fallback budget; exhaustion is inconclusive.
- Require uniqueness and a complete requested tier; clue targets `36/32/30` guide shape.
- Preserve 15,000 ms timeout, cancellation, stored snapshots, daily IDs/eligibility. No cutoff table or storage clearing.
- English docs/code/tests, Chinese interface, pure engine. Scores, advanced techniques, and variant geometry diversity remain separate.

## Review Focus

1. Repeated construction/uniqueness/assessment cannot reset aggregate work (Tasks 1–2).
2. Different strings can be equivalent terminals; require independently unequal invariant counts (Task 1).
3. Incomplete work cannot accept removed clues or unverified fallback (Task 2).
4. Summary reuse must honor explicit CLI diagnostic limits and trace requests (Task 3).
5. Immediate daily generation must retain stored attempts and fence late replies (Task 3).

### Task 1: Shared Budget and Randomized Terminals

**Files:** `rating.ts`, `logic.ts`, their tests; new `classicGeneration.ts`, `classicGeneration.test.ts`, `tests/support/terminalDiversity.ts`.

**Interfaces:** `assessPuzzleWithBudget(input: AssessmentInput, budget: WorkBudget): AssessmentResult` validates/consumes the mutable caller budget. `constructClassicTerminal(random: () => number, budget: WorkBudget): { status: 'ready'; solution: Board } | { status: 'budget-exhausted' }`. Independent test helper `countIntercalates(board: Board): number` imports no production solver/transform.

- [x] Write/run RED tests for accumulated/invalid shared budgets, unchanged summaries, terminal determinism, independent validity, and zero/small allowances.
- [x] Charge every detector pass in `findLogicalStep`; remove compatibility-only charging. Share standalone/supplied-budget assessment execution.
- [x] Implement MRV terminal search from empty, stable cell ties, shuffled ascending digits, and a charge before each node; document seed consumption.
- [x] Independently count `a,b / b,a` rectangles. Test transform invariance and different totals across `classic-terminal-v2-01` through `-16`, including a total different from the old template.
- [x] Run type checking and rating/logic/terminal suites; preserve RED→GREEN logs.

### Task 2: One Current Generation Workflow

**Files:** `generation.ts`, `classicGeneration.ts`, `variantGeneration.ts`, rating/policy modules, generation/template/technique tests. Remove historical `generationCompatibility.test.ts` and `tests/fixtures/generationCompatibility.json`.

**Interfaces:** `GenerationLimits = { maxLayouts: number; maxWork: number; maxSteps: number; fallbackWork: number }`; core `parseGenerationLimits(value: unknown): ParseResult<GenerationLimits>` validates exact keys/bounds. Ready `GenerationResult` carries `assessment: DifficultyAssessment`. `generateClassicPuzzle(input: Extract<GenerationInput, { variant: 'classic' }>, limits: GenerationLimits): GenerationResult` delivers a successful summary.

- [x] Write/run RED tests for current-only input versions/limits, reproducible unique puzzles at each tier, summary identity, and incomplete/forced fallback.
- [x] Replace template-only construction with terminal search and removals under one budget. Restore failed/unsupported removals; stop incomplete checks. Deliver a matching tier after shape guide; zero solutions from a known terminal is an inconsistency.
- [x] Transform/validate authored fallback under one separate search/assessment budget. Never downgrade or deliver an inconclusive fallback.
- [x] Use shared assessment and accepted summaries for variants, retaining legal transforms, necessary clues, and incomplete-removal rollback.
- [x] Remove legacy rating wrappers, duplicate policies/accounting, and frozen historical outputs. Bump both generation versions and retain current invariant/determinism tests.
- [x] Run type checking and core/independent fixture suites.

### Task 3: Adapters and Immediate New Starts

**Files:** Worker/CLI and tests, daily model/store tests, real Worker/CLI browser tests and fixtures.

- [x] Write/run RED cases for current inputs, shared limits, reused summaries, explicit diagnostic limits/trace, and current free/daily requests.
- [x] Worker attaches accepted generation summary. CLI defaults reuse it; explicit assessment limits or trace invoke standalone diagnostic assessment without changing acceptance.
- [x] Preserve explicit assessment, timeout/cancellation/retry fences, save/restart summaries. One current factory supplies both adapters and player starts.
- [x] Daily seeds use current constants immediately; assert stored sessions/results take precedence and cannot grant another formal attempt. Do not delete/rewrite records.
- [x] Compare built Node and emitted Worker results at root/subpath and run adapter/storage/player regressions.

### Task 4: Complete Verification and Documentation

**Files:** README, architecture, variant checklist, design/plan status, Phase B verification report.

- [x] Run sixteen Classic seeds per tier (`classic-v2-corpus-01` through `-16`) and representative variants. Report generated/fallback frequencies, workloads, independent terminal invariants, and separate timings.
- [x] Independently verify uniqueness/solutions and constructed diversity; distinguish fallback observations. No uniform-sampling claim.
- [x] Run types, lint, formatting, all units, root/subpath/CLI builds and every browser project with actual concurrency evidence.
- [x] Complete one fresh whole-change review; fix Important/Critical findings with regressions and verification.
- [x] Document current contracts/versions/budgets/reuse/diversity/results. Mark Phase A evidence historical where superseded.
- [x] Review local links and `git diff --check`; leave implementation and scratch evidence uncommitted.
