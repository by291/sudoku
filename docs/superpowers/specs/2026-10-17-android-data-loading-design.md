# Android Data Loading and Read Models

Status: approved and implemented on 2026-10-17; grouped commits authorized by the user.

## Intent and scope

Make startup and navigation depend only on data needed by the visible workflow. Preserve the current Android styling, geometry, save safety, daily-attempt rules, and Web-compatible backups. Avoid transient false empty states, count changes caused by placeholder values, and layout movement when data arrives.

This design replaces the full Home/bootstrap preload policy in the Android client design. It also replaces the recently added blocking learning-directory preload. It does not change game rules, rewrite Web persistence, or change the portable backup format.

Source inspection establishes unnecessary work and dependencies; it does not establish their measured share of startup time. Capture a device baseline before implementation and compare against it afterward.

## Findings before implementation

| Area                     | Current behavior                                                                              | Consequence                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AppViewModel`           | Waits for native version readiness, then awaits settings, Home data, and learning preparation | Unrelated feature work becomes an application startup dependency                                                         |
| `GameEntryLoader`        | Loads every session and result concurrently                                                   | Home pays for history it does not display; concurrency does not reduce total work                                        |
| `RoomGameRepository`     | List reads select payloads and decode/validate each complete record                           | List reads include board layers, undo/redo history, mathematical validation, assessment validation, and ownership copies |
| `GameController`         | Resume reads all sessions, then potentially all results                                       | Opening one game depends on unrelated records                                                                            |
| `RecordsViewModel`       | Sequentially rereads sessions, results, and quarantine count; summarizes full results         | Duplicated decoding, excess retained state, and delayed initial content                                                  |
| `LearningSnapshotLoader` | Bootstrap awaits the entire catalogue, settings, and progress                                 | Static directory presentation waits for unrelated lesson boards and personal state                                       |
| Room schema v1           | Session/result rows contain a few routing columns plus JSON; list queries select everything   | Existing indexes do not provide the UI's needed projection, ordering, or aggregate queries                               |

The relevant source owners are `android/app/.../AppViewModel.kt`, `android/feature/game/.../GameEntryLoader.kt`, `android/feature/game/.../GameController.kt`, `android/feature/records/.../RecordsViewModel.kt`, `android/feature/learning/.../LearningSnapshotLoader.kt`, `android/core/data/.../SudokuDatabase.kt`, `android/core/data/.../RoomGameRepository.kt`, and `android/core/domain/.../PortableCodec.kt`.

### Assessment of the data structures

Keep these existing choices:

- Full immutable session snapshots are useful for restoration, validation, and portable backup. JSON itself is not the fundamental problem.
- Separate original completion records preserve history when the active session is replayed or replaced.
- Dataset epochs, session revisions, editor ownership, atomic writes, and quarantine distinguish stale, invalid, and unavailable data correctly.
- A small settings record and 32 lesson-completion records do not justify a wholesale database redesign.

Change the read structures and contracts:

- `listSessions()` and `listResults()` expose heavyweight restoration objects for lightweight presentation. Add purpose-specific reads; stop using these methods in ordinary screens.
- Lists need indexed, typed display facts. Deriving them by repeatedly opening the JSON defeats the current routing columns.
- Fixed course metadata, lesson content, and personal progress have different lifetimes and should not be loaded as one unit.
- Each history move stores complete before/after board layers. This increases serialized size and repeated save/validation work with move count. Removing this cost from list/startup reads is the first priority. A delta-history format would require a separate compatibility design and measurement; do not silently truncate history or alter backup v1/session v2 here.
- Completion payloads duplicate some session data. Retain their independent original snapshots for now; do not deduplicate away original-result semantics merely to reduce bytes.

Web also exposes full-record list APIs over IndexedDB. Its portable format remains compatible with this proposal because the new Android read models are local derived data, not exported fields. Web performance changes require a separate scoped follow-up.

## Alternatives and decision

1. **Only defer the existing full reads.** Small implementation, but each visited page still incurs full decoding and validation. Useful as an intermediate step, not the final design.
2. **Keep canonical payloads and add compact read models. Recommended.** Adds explicit projection maintenance and migration, while making page reads proportional to their actual needs and preserving backup contracts.
3. **Normalize boards, moves, and all nested state into relational tables.** Larger migration and synchronization burden; unnecessary for the current read problem. Defer until measurements establish a write/storage requirement.

Use separate `session_summaries` and `result_summaries` tables. This keeps payload columns out of read-model queries and gives summary observers an independent invalidation boundary. Adding scalar columns to the existing tables is viable, but timer/payload writes would invalidate their observers even when displayed facts did not change. Do not introduce a generic projection framework or event-sourcing system.

## Loading stages

### 1. Minimal bootstrap

Initialize safe-area observation immediately, as today. Open Room off the main thread and read one small bootstrap snapshot containing theme preferences, dataset epoch, and Home save-presence information. A fresh database returns known-empty state immediately.

The normal Home snapshot only needs whether unfinished saves exist; it does not need every save card or any completion-history payload. Query ready summary facts with `EXISTS`, including all relevant ordinary/daily saves. Reading both modes must not become two independent full scans. Preserve the existing Start/Continue arrangement before the first normal Home frame.

Native initialization, mathematical validation, complete lesson assets, learning progress, historical results, aggregate records, and quarantine counts are not startup gates. Do not create feature ViewModels solely to preload their pages. Remove App's dependency on feature-owned snapshot loaders; App depends on small domain bootstrap/settings contracts implemented by core/data.

Database or settings failure is not an empty database. Show a stable recoverable startup error for this essential dependency. The existing delayed feedback policy may show progress after 350 ms; it must not delay the operation or conceal errors. Measure Room opening separately: removing payload reads cannot guarantee that storage opening is instantaneous on every device.

### 2. After Home's first frame

Do not unconditionally warm the engine on a fresh dataset. Initialize it when a real operation needs native computation; legacy-record backfill may also initialize it after Home has drawn. Keep maintenance cancellable and yield between records. Do not queue all feature loads after a short delay: that would merely move contention into the first interaction.

No default full-history, full-learning, or full-save preload. A requested sheet/page loads its own small read model. A cached model from the current dataset can be reused while refreshing.

### 3. On demand

| Surface            | Required read                                                                                    | Deferred work                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Home               | Theme, epoch, unfinished-save presence                                                           | Save card details, daily status, all history, lessons, engine |
| Free setup         | Selected variant's active-slot summary                                                           | Full prior session until replacement/resume requires it       |
| Continue sheet     | Ordered unfinished-save summaries, bounded pages when needed                                     | One selected session's complete payload                       |
| Daily sheet        | Today's six deterministic formal IDs: session and original-result status in one consistent query | Other dates, history, puzzle generation                       |
| Learning directory | Build-generated static directory; separate small progress/cursor snapshot                        | Lesson boards, evidence, exercises, engine                    |
| Individual lesson  | Selected lesson asset and its current progress/cursor                                            | Other lessons; native practice operations until needed        |
| Records overview   | Selected variant's aggregate facts and eligible challenge dates                                  | Save/history lists, complete payloads, backup                 |
| Records saves      | Selected variant's ordered summary page                                                          | Offscreen pages and selected-game payload                     |
| Records history    | Selected variant's completion-summary page                                                       | Remaining history and selected-result payload                 |
| Game resume        | One session by ID; one result by ID only if the session is absent                                | Unrelated records                                             |
| Backup tools       | Quarantine count when opened; full validated snapshot on explicit export/import                  | No backup work during navigation                              |

All page-specific errors remain local. Engine unavailability blocks generation, restoration validation, and engine-backed actions, not directory browsing or summary display.

## Read-model schema

Keep the current payload tables and portable DTOs. Add Room v2 projection tables with explicit types and integrity checks.

| Projection           | Fields                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared display facts | ID, mode, variant, difficulty, start instant, elapsed milliseconds, completion instant if any, assistance flag, challenge date/formal-attempt flag or lesson ID as appropriate |
| Session summary      | Source session revision, player-filled count, editable-cell count, projection version                                                                                          |
| Result summary       | Original completion facts, eligible Beijing streak date when applicable, projection version                                                                                    |

Store instants as sortable UTC epoch milliseconds locally; preserve original portable timestamp strings inside payloads. Display history groups in the user's local timezone. Challenge eligibility always uses the existing Beijing-date domain rule.

Validate enums, nonnegative durations/revisions, bounded counts, valid dates, and mode-specific field relationships. A summary is derived presentation data, never proof that the payload is mathematically valid. Do not place board arrays, notes, history, explanations, or assessment evidence in summaries.

Use the existing primary ID lookup for deterministic daily IDs. Add composite indexes matching actual queries: variant plus start time and ID for saved lists; variant plus completion time and ID for history; variant/mode/difficulty/assistance for best-time queries; variant/formal-attempt/eligible date for streak reads. Confirm plans with `EXPLAIN QUERY PLAN`; avoid redundant indexes without a demonstrated query.

Persist projection coverage flags alongside the projection generation. Schema-only migration starts with unknown coverage; the first successful coverage check records completion. Normal paired payload/projection writes preserve complete coverage, explicit projection removal invalidates it, and clear/import establish it atomically. Steady-state pages therefore skip pending-record discovery instead of rescanning canonical history merely to prove that no legacy rows remain. Pending rows sort first by ID; ready rows use indexed timestamp-plus-ID ordering. Backfill changes the generation, so loading more after a pending row moves forces a fresh first page.

Initially use 30-row pages with a deterministic timestamp-plus-ID cursor. Cursors include the dataset epoch, projection generation, and all filters. A database change affecting membership/order invalidates the visible list generation and reloads it; an old cursor must not append to a new generation. Keep scroll anchors by record ID and refresh before continuing. Do not rely on timestamp-only ordering or silently mix pages across a restore.

Records overview computes best times with `MIN` and completion totals with filtered aggregates over result summaries. Compute streaks from distinct eligible challenge dates, not complete records. Preserve `summarizeRecords` behavior: formal assisted/unassisted totals, late completion counting in totals but not streak days, and a current streak that may end yesterday. These aggregate queries still scale with relevant summary rows; they are not constant-time just because JSON is absent. Add stored aggregate counters only if profiling demonstrates a need.

## Write consistency and validation

1. Validate and freeze a candidate session using the existing write contract, outside the database transaction.
2. Derive summary facts from that same validated snapshot.
3. In one Room transaction, recheck epoch, editor token, and expected revision; write payload and summary together.
4. On completion, insert the original result and its summary only when the original result is first created. Repeated completion saves cannot overwrite either original snapshot or summary.
5. Publish committed state only after success. Deletes, quarantine, replacement, clear, and import update payloads and summaries in the same transaction.

Timer checkpoints preserve source revision correctness: session projections track the newly committed revision together with display facts. Selected detail reads compare the complete projection before repairing it and skip unchanged projection writes. Query-level `distinctUntilChanged` prevents unchanged UI emissions but does not eliminate Room query reruns after table invalidation.

Read summaries with lightweight structural checks. Before resuming, reviewing a full result, exporting, or using persisted content for a game operation, validate the selected complete payload. Native validation timeouts, cancellation, exhaustion, and temporary failure preserve the record and expose retry. Only conclusive corruption permits quarantine, guarded by the captured epoch and source revision/payload identity.

A projection version is a rebuild marker, not a security or validity certificate. Summary/payload disagreement discovered during full reads repairs the projection or quarantines the conclusively invalid payload. Do not skip full validation because a stored flag says a record was validated in another process.

Cached summaries must never authorize destructive replacement or a new formal attempt. Query the relevant slot/formal ID authoritatively and validate applicable records; recheck the observed IDs/revisions/absence and epoch when installing the new session. Generation can run between these stages, so a final conflict must not overwrite a newly created save. Pending migration data is never equivalent to absence.

This design does not relax the existing complete validation on writes. Repeated validation of unchanged puzzle/history content during saving is a separate measured optimization, with its own ownership and cache-key proof, rather than an implicit part of the startup fix.

## Learning content

Generate a small Kotlin directory from the existing authored catalogue at build time: stable ID/order, title, introduction, variant, difficulty, and stage count. Generate per-lesson assets from the same source. Validate mathematical evidence in the existing build/test pipeline; verify directory-to-asset IDs, counts, and content versions there too. Do not author a second manual list of titles or counts.

The directory renders immediately without parsing all lesson boards. Load and structurally validate the selected lesson asset off the main thread; retain the current lesson and at most two recently used lessons. Static asset cache keys use the bundled content version, not the user's dataset epoch.

Read the small completion/cursor snapshot separately. Keep completion and cursor facts from the same epoch. A new, empty database yields known-zero progress; unresolved progress is unknown, not zero. Fixed progress regions retain their bounds, while personal recommendation text/actions wait for real progress. Opening a lesson may navigate immediately into its existing reserved layout; submissions/advancement wait for the durable cursor, preserving the no-skip rule.

Keep settings and progress portable formats unchanged. They are small enough that splitting each preference into a separate database entity is not presently justified.

## Shared observations and state ownership

Core/domain declares narrow typed read contracts for bootstrap, save summaries, daily status, records, and selected details. Core/data implements them with Room and owns shared query observations. Keep mutation ordering within the existing repository; do not split one save transaction across feature stores.

Features retain only presentation choices, visible results, and their workflow state. No feature imports another feature, and no global singleton retains every complete session/result for every page.

Use lifecycle-aware UI collection and narrow Room invalidations. The Records owner cancels superseded requests, batches migration invalidations, and retains at most 120 displayed rows; its active tab/filter alone determines the query. Home keeps one presence snapshot and one cancellable sheet query, with independent refresh generations. Learning serializes its small snapshot reads and keeps at most three immutable lesson assets; a new ViewModel starts with the static directory. Repository detail repair and maintenance share the same transactional consistency rules, while a single maintenance mutex prevents duplicate backfill runs. No global cache owns all games or serializes unrelated feature reads.

Every asynchronous delivery carries its epoch and request generation. Restore/clear invalidates personalized caches and pending pagination immediately; old completions cannot repopulate them. Source revision checks additionally protect selected-session reads. Ordinary updates retain usable current data during refresh; destructive dataset replacement must not keep the prior dataset's summaries visible as current.

Daily keys include the Beijing challenge date. Re-evaluate on foreground and at the date boundary while the sheet is visible. A date change invalidates daily status and current-streak calculations, not every historical payload or Home's entire action row.

## Migration without a heavy startup

Room v1-to-v2 performs schema creation only, with no all-record decode or native validation in the migration callback. Absence of a current-version summary for an existing payload means pending projection, not an empty/deleted save.

After the first frame, a single bounded backfill worker reads one pending record at a time, validates it, and commits its summary only if epoch and source identity still match. Prioritize selected records and active-slot/daily records over historical results. Check cancellation between records and yield to interactive engine work. Completion is durable because each committed projection records its version; process death resumes from missing/outdated projections.

Do not retry inconclusive records in a tight loop. Retain them, record the current job's unavailable state, continue unrelated rows where possible, and retry on explicit request or a later maintenance run. Quarantine only conclusively invalid rows. Backfill is opportunistic; correctness must not depend on it finishing before the process exits.

While legacy data is pending:

- Bootstrap inspects IDs/routing metadata and projection coverage without loading payloads. Home can open with an unknown save-presence state. Keep the existing action-row geometry reserved for that visit; show the existing Continue affordance as pending rather than declaring there are no saves. Do not resize the row when backfill finishes mid-visit. Subsequent visits use known presence normally.
- Continue may show bounded pending rows and resolve the selected ID on demand. Unknown difficulty/progress must not be fabricated. A pending active slot still prevents blind replacement.
- Daily formal-ID existence queries include legacy payload rows. Resolve the selected ID before deciding formal versus practice eligibility.
- Records may display ready rows with an explicit incomplete state. Overview must not display partial aggregates as final totals or claim zero history while pending results exist.
- A fresh installation and post-migration steady state do not use these exceptional migration placeholders.

Import already validates the complete backup: build summaries from those validated records before the atomic replacement transaction. Rebase session revisions and epoch as today; clear stale projections together with payloads. Export remains a consistent validated portable snapshot and never exports local projections. Preserve existing size limits, original results, and lesson-completion timestamps.

## Verification and rollout

Measure current and proposed cold starts, warm returns, first daily-sheet open, directory entry, first lesson, records tabs, and resume. Trace Room open, query, JSON decode, native validation, first frame, and action readiness separately. Report distributions on a named device/emulator with fixed build/configuration; do not invent a millisecond target without a baseline.

Use datasets with 0, 100, 1,000, and up to the accepted backup record limit, including long legal undo histories. Keep record count and per-record payload size as independent dimensions. Track bytes materialized, full-decode/native-validation call counts, allocations, and retained memory in addition to elapsed time.

Required observable outcomes:

- Normal Home startup performs zero full session/result decodes and zero native validations, regardless of completion-history size.
- Home no longer awaits learning data or engine readiness. A failing unrelated subsystem does not prevent Home navigation.
- Resume reads and validates only the chosen detail and any directly relevant conflict/eligibility records.
- Directory rendering does not parse lesson board assets. Static count, row order, and layout are stable before progress arrives.
- History reads one bounded page; overview does not fetch complete JSON. Aggregate semantics match existing independent fixtures.
- Pending versus empty, stale versus current, and unavailable versus corrupt are tested explicitly.
- Migration survives process interruption, concurrent save/replacement, epoch change, invalid payloads, and inconclusive validation without losing data or reporting false absence.
- Original results remain unchanged on replay; import/clear cannot accept stale read completions; backup round trips remain Web compatible.
- Slow-path UI tests exercise delayed feedback and stable bounds; fast-path tests detect transient spinners, false zero counts, and action-row flicker.

Implement in coherent stages after approval: instrument baseline; introduce schema/read contracts and atomic projections with migration tests; replace bootstrap and selected-game scans; switch records and learning to demand-driven reads; verify concurrency, compatibility, and device behavior. Remove obsolete full-snapshot loaders rather than layering the new paths alongside them indefinitely.

Implementation and verification are tracked in [the execution plan](../plans/2026-10-17-android-data-loading.md). Device tests distinguish query/decode isolation from end-to-end timing. No startup speedup in milliseconds is claimed without comparable measurements.

## References

- [Android client design](2026-10-16-android-client-design.md): current UI and persistence invariants; the bootstrap paragraph now follows this loading design.
- [Web architecture](../../architecture.md): browser ownership and portable contracts.
- [Room query projections](https://developer.android.com/training/data-storage/room/accessing-data): select typed subsets rather than entire entities.
- [Android startup measurement](https://developer.android.com/topic/performance/issues/launch-time): distinguish initial display from fully usable content.

The repository currently pins Room 2.8.5, coroutines 1.10.2, and Lifecycle 2.10.0. The initial design needs no new database or pagination dependency; verify APIs against those installed versions during implementation.
