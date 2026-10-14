# Generation Efficiency Experiments Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this approved sequence, with focused regression tests and one independent final review.

**Goal:** Ship prepared rule-context reuse, then measure lighter trial grading, terminal decision clues, and known-solution uniqueness independently against it.

**Architecture:** Keep production generation and public assessment validation in their existing owners. A prepared assessment owns one validated rule snapshot and compiled context. Experimental implementations use isolated source overlays outside production dispatch; each is compared with the same prepared baseline and the same v7 inputs.

**Tech Stack:** TypeScript 6.0.3, Node.js 26.10.0, Vitest 5.0.3, Vite 8.3.4, Playwright 1.64.0.

**Spec:** `../specs/2026-10-13-sudoku-generation-and-rating-design.md`, latest construction-only amendment, plus the user's approval to implement item 1 and independently experiment with items 2–4.

## Global Constraints

- Retain v7 seed inputs, four-million shared work, 40 layouts, 500 steps, three-second generation timeout, and `sudoku-rating-v2`.
- Prepared reuse must preserve complete generation results, summaries, work counts, and failure outcomes.
- Every delivered candidate retains exact uniqueness, complete matching assessment, and variant necessity; no authored fallback.
- Experiments do not become production behavior or change saved facts without a separate selection decision.
- All 64 fixed seeds across all 19 combinations are independently checked for every mode. Report exhausted requests separately from successes.
- Keep benchmark processes sequential and record host, versions, identical input identities, median/p95/max, success counts, and work.
- Repository documentation, comments, and tests remain English. Product copy stays Chinese.

## Review Focus

- Mutation of caller-owned rules or assessment results must not corrupt another assessment.
- Pre-consumed, malformed, and exhausted work budgets must remain explicit and bounded.
- Sparse or multiple-solution boards must never become success through a cached state.
- A removed clue widens domains; only immutable geometry can be reused across trial boards.
- Real Worker outcomes, cancellation, existing saves, and both deployment roots must remain valid.

## Tasks

### Task 1: Preserve the baseline and prepare assessment contexts

**Files:** `src/core/sudoku/rating.ts`, `rating.test.ts`, `classicGeneration.ts`, `variantGeneration.ts`.

**Interface:** `prepareAssessment(rules, limits)` returns an owned compiled `context` and `assess(board, budget): AssessmentResult`. Every board is validated and copied; each call owns its logical workspace. Public worker assessment retains full input validation.

- [x] Record the clean baseline source revision and full fixed-seed results.
- [x] Add regressions for fresh/prepared equivalence, rule snapshot ownership, repeated calls, malformed static inputs, invalid boards, and shared-budget exhaustion; observe RED.
- [x] Implement the prepared assessor and route generation through it; observe GREEN.
- [x] Compare all 1,216 results exactly with the preserved baseline and run independent corpus checks.

### Task 2: Independently experiment with lighter trial grading

**Files:** isolated experiment overlays and runner under `.superpowers/generation-efficiency-implementation/`.

- [x] Defer trial workload summarization while retaining complete logical classification; finalize the successful candidate through full assessment.
- [x] Exercise incomplete outcomes and compare final summaries with an independent fresh assessment.
- [x] Run the complete corpus and actual browser Worker matrix; compare with Task 1 only.

### Task 3: Independently experiment with terminal decision clues

- [x] Track only decisions on the successful terminal search path; undo failed decisions with assignments.
- [x] Start clue removal from the retained decisions, verify initial uniqueness, and skip already-empty cells.
- [x] Keep seeded shuffle ordering, all validation gates, finite work, and geometry ownership explicit.
- [x] Run the complete corpus and actual browser Worker matrix; compare with Task 1 only.

### Task 4: Independently experiment with known-solution uniqueness

- [x] Add a bounded search for a completion differing from the known valid solution, with explicit inconclusive exhaustion.
- [x] Exercise unique, multiple, contradictory, and exhausted examples against the independent reference solver.
- [x] Use the one-deletion restriction only with a verified unique predecessor; retain a general alternative-solution restriction for tentative removals.
- [x] Run the complete corpus and actual browser Worker matrix; compare with Task 1 only.

### Task 5: Release verification and comparison report

**Files:** `docs/superpowers/verification/2026-10-14-generation-efficiency.md` and machine-readable comparison; architecture documentation.

- [x] Run all TypeScript projects, lint, formatting, unit tests, root/subpath builds, and relevant browser player flows.
- [x] Check final prepared production results against the original baseline and verify corpus geometry/terminal diversity.
- [x] Obtain an independent read-only review, resolve material findings, and record the final test evidence.
- [x] Report independently measured gains, regressions, success rates, remaining limits, and which implementation is production. Keep Git changes uncommitted for review.

## Completion on 2026-10-15

Completed in the preserved handoff checkout without committing or pushing. The
[final verification report](../verification/2026-10-15-generation-efficiency.md)
and machine-readable comparison record the corrected source snapshots, all five
complete corpora, independent review correction, available browser matrices, and
release checks. Firefox could not launch on macOS 27 and is explicitly unverified.
Only prepared context reuse and clue-evidence isolation are production changes;
all three experiments remain independent overlays.

## Subsequent production selection

The user selected lightweight grading for formal integration on 2026-10-15. The
[current v8 release report](../verification/2026-10-15-lightweight-rating-v8.md)
records the selected production workflow and new verification. The experiment
measurements and original production selection above remain historical records.
