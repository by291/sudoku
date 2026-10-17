# Frontend Responsibility and Readability Verification

Baseline: `e4f4196` (`refactor(engine): clarify Rust ownership and checked contracts`). Verification and review were completed before the user subsequently authorized a local commit.

Scope: the approved [frontend design](../specs/2026-10-18-frontend-responsibility-design.md) and [implementation plan](../plans/2026-10-18-frontend-responsibility.md). This is a Web-only refactor; Rust and Android source, generated bindings, stored/backup formats, authored lesson content and algorithm identities remain unchanged.

## Implemented ownership changes

- Storage now has explicit summary coverage, cancellable maintenance and pure statistics owners. Live compact-summary tests replace retired full-record aggregation tests. Repository access policy names error classification and readiness rather than relying on positional booleans.
- Learning separates lesson metadata, guided/exercise stages and answer contracts. Submission uses discriminated outcomes with exhaustive consumers. Durable completion precedes optional cursor cleanup. Recommendations derive from domain state; preference operation generations remain separate from dataset epochs.
- Game replacement has named preparation/acquisition/commit/install stages and typed borrowed/acquired lease ownership. Daily summary lifecycle has its own composable; setup consumes compact summaries only. Hint and technique presentation use named conditions and explicit branches.
- Records reading/paging/maintenance and backup preview/operation state have separate internal owners. The public store coordinates saves and committed dataset resets. File errors use named actions; old save failures cannot overwrite a newer preview.
- Pure-model lint restrictions are recursive and include records; shared code cannot import idb. Only explicit type imports from persisted contract owners are allowed. Scalar/variant guards have single owners, application startup names reflect service readiness, and board labels/arrow geometry use focused helpers and named constants.
- Logical paragraphs and invariant comments now clarify Home, Worker, preferences, learning, game and storage workflows. AGENTS and Web Architecture describe the implemented contracts.

## Confirmed ownership defects and regressions

A denied proposed lease could leave an independently acquired old-slot lease active when cancellation occurred during the following dataset epoch read. A deterministic test failed with a positive lease expiry instead of zero, then passed after cleanup was corrected.

Independent review then reproduced a handoff race: a superseding restore reused that token before stale cleanup expired it. The corrected replacement resource barrier settles cleanup before another operation acquires ownership. The regression verifies a subsequent real edit and saved digit, not only token state. Daily fallback leaves its own barrier before restoring, avoiding self-wait. Both fixes passed scoped independent review.

## Focused verification

- Storage/records models: 49 tests; app/test type checks, scoped lint and formatting passed.
- Learning/settings/catalogue/teaching contracts: 105 tests; app/test type checks, scoped lint and formatting passed. Independent sealed authored fixtures were not edited; comparisons exclude only removed redundant Lesson aliases.
- Game: 150 tests before the handoff fix; the amended transition/persistence/daily/store set passed 64 tests, including the added handoff/save regression. App/test type checks and scoped lint/format passed. Full-suite results below supersede focused counts for final integration.
- Records: 69 tests, including named file-selection/error handling and the obsolete save-failure race; app/test type checks, scoped lint and formatting passed.
- Shared/boundaries: 37 new boundary cases failed before the policy change; all 151 boundary cases then passed. The combined shared/App/Home/Worker/boundary run passed 248 tests, with scoped type/lint/format checks.
- All five task reviews passed. Game review required one correction round for lease handoff; its scoped re-review passed. No deferred or parked findings remain.

## Execution decisions

- Continued in the existing clean checkout and left changes uncommitted, consistent with the approved continuation. If the intended workspace were different, the reversible edits would need to be moved before committing.
- Reviewed file snapshots including new nonignored files rather than empty commit ranges. This avoids requiring an unauthorized commit. An incomplete snapshot could omit review evidence; the final Git status/diff inventory was checked to corroborate coverage of tracked and new files.

## Final integration

| Check                            | Result                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                 | Passed all app/test/node/worker/E2E/reference configurations after WASM rebuild.                                                                                          |
| `pnpm lint`                      | Passed.                                                                                                                                                                   |
| `pnpm format:check`              | Passed.                                                                                                                                                                   |
| `pnpm test:unit`                 | 72 files, 874 tests passed.                                                                                                                                               |
| `pnpm build`                     | Passed; Rust/WASM validated 32 lessons and 116 teaching stages.                                                                                                           |
| `pnpm build:subpath`             | Passed for `/sudoku/`; the same teaching proof gate passed.                                                                                                               |
| Desktop/mobile/WebKit Playwright | 485 passed, 40 skipped by existing device conditions; exit 0, 5.6 minutes.                                                                                                |
| Firefox scoped startup           | Environment blocked before application execution: `browserType.launch` / `Could not find profile folder`. One scoped attempt failed; Firefox behavior remains unverified. |
| Final whole-diff review          | Passed spec compliance and quality; all 65 changed paths at review time included new files and cross-task contracts. No actionable or deferred findings.                  |

Logs are `/tmp/sudoku-frontend-final-{typecheck,lint,format,unit,build,subpath,e2e,firefox}.log`. The full unit suite emits existing jsdom `Window.scrollTo()` not-implemented notices; browser checks establish the actual navigation behavior separately. No test failure was hidden or disabled.

Final Git inspection confirms no changed files under `sudoku/`, `android/`, `content/`, `packages/` or `tests/reference/`. Native/Android suites are not claimed as rerun for this Web-only change. New source files and renamed startup files are included in the review inventory.

Browser commands:

```sh
PLAYWRIGHT_USE_PREBUILT=1 pnpm exec playwright test --project=desktop --project=mobile --project=webkit --reporter=line
PLAYWRIGHT_USE_PREBUILT=1 pnpm exec playwright test tests/e2e/engine-loading.spec.ts --project=firefox --grep 'browses without WASM.*4173' --workers=1 --max-failures=1 --reporter=line
```

Firefox exited during process startup, before loading the application. No full Firefox suite is claimed. Playwright also emits the existing `NO_COLOR`/`FORCE_COLOR` environment notice; it does not affect the successful primary suite.

Full review reports, task briefs, red/green evidence and complete diff packages are archived locally at `/private/tmp/sudoku-frontend-review-10sz8eg6`. Large redundant baseline snapshot JSON files were omitted from the archive; the reviewed task/fix diffs and final Git diff retain the change evidence. The task-specific ignored workspace was removed after archiving. No sibling plan workspace was touched.
