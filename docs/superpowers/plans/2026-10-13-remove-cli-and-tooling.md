# Remove the CLI and Tooling Directory

> **For agentic workers:** Use native execution with superpowers:executing-plans. The user directly authorized this removal; preserve the earlier generation and internal-assessment implementation.

**Goal:** Remove the unused Node CLI and the entire `tooling/` directory while retaining module-boundary and production-worker coverage.

**Architecture:** Move the Node-only ESLint boundary suite to `tests/module-boundaries.test.ts`. Browser tests validate real Worker outcomes against authored fixtures and explicit expected facts instead of spawning a CLI. Application engine, worker, session, and persistence contracts stay intact.

**Tech Stack:** TypeScript 6.0.3, Vite 8.3.4, Vitest 5.0.3, Playwright 1.64.0, pnpm 12.11.2.

**Spec:** `docs/superpowers/specs/2026-10-13-sudoku-generation-and-rating-design.md`, with the CLI-removal amendment requested on 2026-10-13.

## Global Constraints

- Keep repository prose and test descriptions in English.
- Preserve current generation versions, internal grading, and saved-session snapshots.
- Remove only CLI-specific files, configuration, scripts, and artifacts; do not discard unrelated uncommitted work.
- Do not commit without an explicit request.

## Review Focus

- Vitest must still discover every module-boundary assertion after the move.
- Type checking must keep the boundary suite in its Node environment.
- Browser tests must not depend on an old `dist-cli/` bundle.
- Explicit work budgets and unavailable assessment outcomes must remain observable through the real Worker.
- Root and `/sudoku/` assets and stored assessment restoration must remain usable.

## Task 1: Remove the Adapter and Retain Its Useful Coverage

**Files:** Move `tooling/module-boundaries.test.ts` to `tests/module-boundaries.test.ts`; remove `tooling/sudoku-cli.ts`, `tooling/sudoku-cli.test.ts`, and `vite.cli.config.ts`. Update Vite/TypeScript configuration, package scripts, ignore files, `tests/e2e/rating.spec.ts`, README, architecture, and the current design. Mark previous plans and verification reports as historical where they describe the removed CLI.

**Interfaces:** Retain `parseWorkerResponse`, `createAssessmentInput`, the shared engine policies, and existing saved-session tests. Direct assessment requests use fixed fixture expectations and explicit domain outcomes.

- [x] Move the boundary suite unchanged and update test discovery and Node type ownership.
- [x] Remove CLI source, tests, build output/configuration, scripts, and ignore entries.
- [x] Replace CLI-dependent browser comparisons with real Worker fixture, outcome, and zero-work-budget checks; retain snapshot tests.
- [x] Update active documentation and label superseded historical CLI requirements.
- [x] Run type checking, lint, formatting, all unit tests, root/subpath builds, and rating/worker browser tests; inspect residual references and the final diff.

Self-review: The cleanup covers adapter removal, the requested directory removal, discovery/type ownership, and production-worker regression coverage. No new product behavior or storage migration is required.

## Verification

Type checking, lint, formatting, 492 unit tests across 46 files, and root/subpath builds passed. The moved boundary suite retains all 85 assertions. Direct Worker/assessment browser checks passed across every configured project: 36 desktop/mobile/Firefox cases with two workers and 12 WebKit cases with one worker. The initial browser run exposed an over-specific new zero-work assertion; the corrected test checks exhaustion and identity without assuming the same exhaustion stage for every variant.

A fresh read-only reviewer found no Critical, Important, or Minor issues in the removal. The adjacent README's older generation-version and terminal-construction prose was reconciled with the retained current engine after review. Earlier engine implementation and verification reports remain separate historical milestones. After verification, the user authorized committing the current implementation on 2026-10-13.
