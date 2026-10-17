# Web Demand-Driven Loading

Status: implemented on 2026-10-17; see the [verification report](../verification/2026-10-17-web-demand-loading.md).

## Scope

Implement the four accepted Android-inspired improvements: compact storage reads and pagination, stable unknown/loading presentation, a generated course directory with on-demand lesson content, and lazy WASM startup. Preserve the existing visual design, game rules, portable backup v1/session v2 formats, first-completion semantics, editor leases, revision fencing, and mathematical validation of complete persisted content. Android and Rust sources are outside this change.

The current checkout is the user's continuing Web workspace on `feature/web-demand-loading`. The follow-up request authorizes grouped local commits; pushing remains a separate action.

## Storage and reads

Keep canonical session/result stores. Add derived compact summary stores in IndexedDB schema v2, with compound indexes for variant, ordering time and identity. Maintain summaries in the same transaction as canonical writes, replacement, original-result insertion, quarantine, restore and clear. Full records remain untrusted and must be validated before resuming, result viewing, backup, or destructive decisions. Summaries only authorize presentation.

Expose purpose-specific reads from `GameRepository`: selected session/result by ID, active slot by mode/variant, Home presence, today's formal IDs, per-variant overview, and summary pages. A page contains at most 30 rows in deterministic timestamp/ID order. Its cursor includes dataset epoch, summary generation and filters. An invalid cursor returns a revision conflict; the consumer replaces its first page rather than appending unrelated data. Keep displayed rows bounded to 120 and make continued navigation explicit.

Schema upgrade must not perform WASM computation. Existing v1 payloads remain intact and missing projections are pending, never absent. A cancellable maintenance operation validates and backfills individual records outside upgrade, fencing repairs against concurrent writes and dataset replacement. Normal paired writes and coverage markers avoid repeated full-payload discovery. An unavailable engine or exhausted validation retains the source and exposes retry. Fresh/fully projected summary browsing does not initialize WASM.

Targeted reads that detect a missing projection invalidate the affected coverage under the captured epoch/generation. Malformed compact projections clear only their affected derived store and request a bounded rebuild from canonical records. Pages validate the rows they encounter; ordinary reads are not a whole-database integrity audit.

Asynchronous engine initialization finishes before opening any transaction that needs synchronous semantic validation. Do not await network/engine work inside IndexedDB transactions. Reuse the installed idb 8.0.4 API and current ownership ordering.

## Runtime

App creates browser/storage services and mounts navigation without awaiting WASM. `GameRuntime.ensureEngine(): Promise<void>` shares initialization, resets a failed attempt for retry and disposes late arrivals. The synchronous `engine` contract is only available after readiness; a lazy worker adapter initializes computation on its first actual request and respects cancellation/disposal. Store construction and summary/learning browsing perform no engine operations.

Game entry and persisted detail operations explicitly await engine readiness before synchronous validation/install. Generation failures are local to the game workflow and retryable. Root shutdown does not initialize an unused engine. Retain the existing generated WASM build pipeline and worker protocol.

## Learning

Generate a small typed directory and individual lesson modules from the single authored catalogue during Vite development/build. Directory fields are identity, order, title, introduction, variant, difficulty and stage counts. The full content decoder stays strict and preserves owned snapshots. Production generation must use the exact snapshot proved by the existing build validation gate, including subpath builds.

`useLearningStore` exposes the static directory independently from personal progress and selected lesson content. Loading a lesson fetches only that lesson; cache at most three decoded lessons. Stale route loads cannot publish a different course. Durable cursor readiness gates exercise submission/advancement; guide reading need not wait for personal progress. Preserve draft switching, explicit submission/next actions and no-skip semantics.

## Visible workflows

Home reads only lightweight presence/counts; setup, daily and continue sheets request their own data. Record tabs query only their active dataset. The result viewer reads one complete result. Backup validation and quarantine counting run when requested.

Unknown progress/counts are represented explicitly, not as zero. Course metadata and record card structures render immediately. Unknown values use neutral placeholders with accessible loading semantics; recommendation actions wait for real progress. Refresh keeps the last compatible snapshot. Loading feedback uses the existing 350 ms delay; errors remain visible immediately. Reuse existing content geometry where possible, but never retain an empty loading panel in a ready dialog. Setup feedback renders only while visible; resume feedback replaces the introduction. Preserve keyboard focus, dialog ownership and responsive layouts.

The resume picker uses compact rows separated by rules, without individual card outlines. Group variant, difficulty and source together, align progress and elapsed time for scanning, and make the entire row the resume target. Start timestamps remain secondary. Narrow screens stack metadata without clipping it, and all colors use the shared light/dark palette.

## Verification

Add observable regressions for migration, atomic projection writes, stale cursors, equal timestamp boundaries, reset races, single-record validation, startup without WASM, engine failure/retry/disposal, content splitting, build proof gating, unknown progress and stable loading layouts. Run focused tests during each task, then all unit tests, Vue/TypeScript checks, ESLint, Prettier, root/subpath production builds and browser flows. Use controlled delayed storage/engine responses; do not equate unit timing with browser performance. Record the exact browser coverage and any environment limitation.

## References reviewed

- Installed versions: Vue 3.5.43, Pinia 4.0.3, Vue Router 5.4.0, idb 8.0.4, Vite 8.3.4, Vitest 5.0.3, Playwright 1.64.0.
- [idb transaction lifetime](https://github.com/jakearchibald/idb#transaction-lifetime)
- [Vite lazy imports](https://vite.dev/guide/features.html#glob-import)
- [Vue watcher cleanup](https://vuejs.org/guide/essentials/watchers.html#side-effect-cleanup)
- [Android loading design](2026-10-17-android-data-loading-design.md)
