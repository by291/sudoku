# Frontend Responsibility and Readability

The user approved implementing the complete frontend audit. This document records that approved scope; it does not introduce new product behavior.

## Outcome

Keep the existing Vue feature architecture while making ownership, asynchronous stages, domain outcomes and production data paths easier to understand. Remove redundant legacy aggregation and duplicated contracts. Use logical whitespace and short invariant comments rather than mechanical commentary or arbitrary file-size limits.

## Constraints

- Preserve Chinese interface copy, visual layout, keyboard/modal ownership and player workflows.
- Preserve storage schema 2, portable record/backup formats, 32 stable lesson IDs and authored content.
- Preserve `sudoku-v11`, `sudoku-variants-v11`, `sudoku-rating-v2`, bridge version 3, seed bytes, random-call order and work budgets. Do not change Rust or generated bindings.
- Preserve lazy WASM loading, summary-only browsing, page size 30, stable ordering, and unknown-versus-zero semantics.
- Keep canonical/projection writes atomic. Await engine readiness before opening validation transactions; never introduce unrelated awaits inside IndexedDB transactions.
- Keep one public game store and one public records coordinator. Preserve save-before-switch, dataset epoch/revision fencing, and explicit resource ownership.
- Keep pure models independent of browser services and reactive state; permit explicit type-only persisted contracts where needed.
- Continue in the current checkout. Do not commit or push without a new explicit request.

## Approved changes

1. Separate compact summary maintenance, summary statistics and repository reads. Migrate meaningful old aggregation tests to production summary APIs before removing unused full-record helpers and duplicate summary types. Replace positional repository access flags with named policy options.
2. Narrow lesson and exercise contracts. Remove duplicated guided fields and synthetic complete Lesson objects. Represent submission outcomes with a discriminated union, retain one orchestration action, and explain durable completion before optional cursor cleanup. Derive recommendation presentation from domain state, not translated button text.
3. Clarify game transition stages and lease ownership with a typed union and centralized cleanup. Cover cancellation while a denied replacement rereads the dataset epoch. Remove the unused replacement argument and full-record setup fallback. Extract daily status loading as a complete reactive concern.
4. Give records browsing and backup operations focused internal owners while the public store coordinates reset/replacement and save ordering. Stop direct arbitrary panel mutation of backup errors.
5. Close recursive pure-model and shared `idb` import restrictions. Consolidate scalar and variant guards, rename application bootstrap presentation, and improve focused board, clue, hint, worker, preference and Home readability.

## Validation

Use existing behavioral contracts for pure extraction. Add targeted regressions for missing ownership and import-boundary invariants, with failure observed before fixing them. Test real compact-summary statistics with independently stated expected facts. Preserve existing authored mathematical proof checks.

Run focused tests during each task, then type checking, lint, formatting, the full Web unit suite, root/subpath production builds and available desktop/mobile browser suites. Report browser startup limitations separately from passing checks. Inspect the complete working-tree diff, including new files, before delivery.

## Convention sources

The audit reviewed the installed Vue 3.5.43, Pinia 4.0.3, TypeScript 6.0.3 and idb 8.0.4 against [Vue composables](https://vuejs.org/guide/reusability/composables.html), [Vue TypeScript](https://vuejs.org/guide/typescript/composition-api.html), [Pinia core concepts](https://pinia.vuejs.org/core-concepts/), [TypeScript narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) and [idb transaction lifetime](https://github.com/jakearchibald/idb#transaction-lifetime). Follow current Composition API guidance and the explicit owners in [Web Architecture](../../architecture.md).
