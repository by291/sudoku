# Web Demand-Driven Loading Verification

Date: 2026-10-17. Branch: `feature/web-demand-loading`, based on `1c0b657`.

## Delivered behavior

- IndexedDB schema v2 stores compact projections atomically with canonical sessions/results. Home, setup and daily entry use narrow summary reads; record tabs retain one 30-row page; resume/result detail validates one selected payload.
- Legacy coverage remains unknown until explicit cancellable validation. Missing/corrupt projections can be rebuilt without discarding canonical data. Cursor filters, dataset epochs and projection generations prevent mixed pages and stale repairs.
- Loading feedback reuses existing content geometry where possible and does not retain empty panels in ready dialogs. Unknown counts/progress are distinct from zero; unavailable slot presence cannot authorize replacement. Entry errors, query errors and backup operations have independent lifetimes.
- The build generates a lightweight directory and 32 lazy lesson modules from the exact mathematically proved source snapshot. The decoded content cache holds three lessons. Progress readiness still gates exercises.
- Browsing services mount without WASM. Computation initializes on demand, shares concurrent requests, retries failures and disposes late initializers. Pending requests retain owned inputs and support cancellation.

Portable backup v1, session format v2, original completion retention, editing leases and revision fencing are preserved. Android and native Rust sources were not modified by this work. Concurrent Android edits in the workspace belong to separate work.

## Automated checks

| Check                | Result                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm test:unit`     | 69 files, 741 tests passed                                                                 |
| `pnpm typecheck`     | All configured application, test, tooling, Worker, E2E and reference configurations passed |
| `pnpm lint`          | Passed, no warnings                                                                        |
| `pnpm format:check`  | Passed                                                                                     |
| `pnpm build`         | Passed, 32 independently loaded lesson assets                                              |
| `pnpm build:subpath` | Passed for `/sudoku/`, using the same proof gate                                           |
| Storage subset       | 108 tests passed, included in the unit total                                               |

WASM was rebuilt through the existing pipeline. No Rust source or mathematical contract changed, so this change does not claim a new native benchmark or migration audit.

## Browser coverage

Chromium desktop, Chromium mobile and WebKit were exercised at both deployment roots where applicable. Verification was staged rather than represented as one final all-green full-suite run:

1. The broad run executed 504 cases: 455 passed, 40 device-specific skips and 9 failures. The failures identified one compact course-list layout regression and test synchronization/locator assumptions exposed by earlier rendering.
2. After corrections, all affected failure groups were rerun: 21 passed and 6 expected desktop-only skips. This covered short desktop density, engine retry, variant persistence and failed-save navigation.
3. The final integration run covered engine/lesson loading, legacy upgrade, pagination, storage, backup, daily play, generation, dialogs, Home, learning navigation and records: 171 passed, 2 expected device skips and one ambiguous daily-card locator. That locator was corrected to use the card's unique visible caption; the same case then passed nine runs across the three browser profiles. No application change was needed for that last correction.

Specific new browser evidence:

- Home, guides, records and the daily overview issue zero WASM requests before computation is needed; failed engine downloads and mismatched identities remain local and retryable.
- A genuine schema-v1 Classic save without explicit rules remains pending until explicit maintenance, then resumes the original saved board.
- Sixty-five completed results paginate as 30/30/5 with deterministic equal-time ordering, previous/next navigation and stable reload behavior. List browsing requests no WASM; selecting one result loads computation and validates that board.
- Held lesson content preserves board and guide coordinates. Inspected 360-by-800 pending/ready screenshots retain the board at y=201 and preserve the controls/status regions.
- A real failed lesson-chunk response retries successfully at root and subpath on all three browser profiles and restores keyboard focus.
- Existing backup/reset/peer ownership, all 32 authored courses, rules, Worker and WASM browser contracts were included in the broad run. Focused unit regressions additionally cover cancellation, disposal, stale selection/page races, reset counts and invalid migration keys.

Firefox could not start in this environment (`Could not find profile folder`, exit 1 before test execution). It is not counted as passing coverage.

## Dialog spacing and resume picker follow-up

The reported screenshots exposed permanent loading reservations in ready dialogs. A browser regression reproduced a 121 px gap between setup warning text and actions, and a 68 px gap between the resume heading and introduction. Setup now renders feedback only when visible; resume feedback replaces its introduction. The resume picker uses separated compact rows, aligned desktop metadata and stacked mobile metadata.

The new regression passed alongside existing dialog/save-picker coverage: 21 browser tests across desktop Chromium, mobile Chromium and WebKit. Six focused component tests, application and E2E type checks, scoped ESLint/Prettier, root/subpath production builds and `git diff --check` passed. Inspected desktop/mobile light and dark screenshots under `.superpowers/dialog-redesign/`; save selection, long metadata, full-row targets, focus restoration and the recent-course action remain covered.

## Review and limits

Independent reviews found and verified fixes for shared error-state clearing, unknown-save replacement, reset overview refresh, stale page rollback, retry cursor mismatch, cold lesson geometry, malformed migration cursor identities and missing/corrupt derived projections. No material review findings remain open.

Summary reads validate encountered projections, not every indexed record in the database. Ordinary browsing deliberately avoids a full canonical integrity scan. Per-variant statistics still walk compact summaries; this report establishes query scope, bounded displayed rows and deferred requests, not a measured startup-time or large-dataset throughput improvement.

The user's follow-up authorizes grouped local commits: storage summaries, lesson loading, computation and game entry, Home/records queries, resume dialog presentation, and documentation. Before grouping, all 741 unit tests, all configured TypeScript checks, ESLint and Prettier passed again. The already verified production and browser artifacts are unchanged. Android work remains outside these commits; nothing is pushed.
