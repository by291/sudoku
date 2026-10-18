# Android data loading and persistence

Room stores canonical player records and derived compact projections. Current local schema is **3**, and the current projection marker is **3**. These versions are independent of portable backup v1 and session/result v2. Read [Android architecture](architecture.md) for owners and [local backup](../local-backup.md) for the portable contract.

## Read ownership and startup

`RoomReadRepository` coordinates focused reads. `SummaryQueries` owns compact querying, `SummaryCoverageDao` owns durable coverage, `SummaryProjection` validates projections, `SummaryMaintenance` owns cancellable backfill, and `RecordDetails` validates and repairs selected complete records. `SchemaMigrations` owns schema changes. The existing repository retains one write mutex/transaction owner.

Home bootstrap reads only settings, dataset epoch and unfinished-save presence. It does not parse session/history payloads, load lesson boards or await native readiness. Setup/Continue and daily status load only when requested. Essential storage failure remains retryable at startup; unrelated computation failure does not block directory browsing.

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

## Shared observations and state ownership

Core/domain declares narrow typed read contracts for bootstrap, save summaries, daily status, records, and selected details. Core/data implements them with Room and owns shared query observations. Keep mutation ordering within the existing repository; do not split one save transaction across feature stores.

Features retain only presentation choices, visible results, and their workflow state. No feature imports another feature, and no global singleton retains every complete session/result for every page.

Use lifecycle-aware UI collection and narrow Room invalidations. The Records owner cancels superseded requests, batches migration invalidations, and retains at most 120 displayed rows; its active tab/filter alone determines the query. Game entry keeps one presence snapshot and cancellable sheet queries with independent refresh generations. Learning serializes its small snapshot reads and keeps at most three immutable lesson assets; a new ViewModel starts with the static directory. Repository detail repair and maintenance share the same transactional consistency rules, while a single maintenance mutex prevents duplicate backfill runs. No global cache owns all games or serializes unrelated feature reads.

Every asynchronous delivery carries its epoch and request generation. Restore/clear invalidates personalized caches and pending pagination immediately; old completions cannot repopulate them. Source revision checks additionally protect selected-session reads. Ordinary updates retain usable current data during refresh; destructive dataset replacement must not keep the prior dataset's summaries visible as current.

Daily keys include the Beijing challenge date. Re-evaluate on foreground and at the date boundary while the sheet is visible. A date change invalidates daily status and current-streak calculations, not every historical payload or Home's entire action row.

## Compact projections and pagination

Summaries contain identity, mode, variant, difficulty, timestamps, elapsed milliseconds, assistance, source revision and filling counts, with daily/lesson metadata where applicable. They exclude boards, notes, history and evidence. Validate enum membership, bounded/finite counts, timestamps and mode/formal-ID relationships before displaying facts.

Persist coverage by projection version and dataset epoch. Missing/outdated coverage means pending, never empty. Paired writes preserve coverage; replacement, clear and import change it atomically. Invalid projections are removed or repaired under the captured generation; an appended page returns a revision conflict after invalidation rather than combining snapshots.

Pages contain at most 30 rows, ordered by descending timestamp and stable ID. Cursors retain the typed query, filters, dataset epoch and projection generation. Features retain at most 120 displayed rows and restart from the first page when a cursor is incompatible. Detail reads load only the chosen canonical record and any directly relevant conflict/eligibility record.

Free-play bests use SQL aggregates over compact projections. Daily statistics iterate indexed compact rows in batches of 128 and reuse the shared `Asia/Shanghai` calendar rule, including historical daylight saving. Late formal completions count in totals but not the challenge date's streak. This is bounded-memory work over relevant rows, not constant-time work or a whole-payload scan.

## Schema migration and maintenance

The v1-to-v2 upgrade creates projection tables without decoding all records or invoking native validation. The explicit v2-to-v3 migration adds versioned coverage metadata and a daily ordering index without copying canonical payload tables. Index creation visits compact rows once.

Old coverage becomes pending and triggers one-time, cancellable projection backfill outside schema migration. Maintenance validates one owned payload at a time and fences each commit against epoch, revision and source identity. Selected-detail validation can repair records before maintenance finishes. Process interruption leaves committed progress reusable.

An unavailable validator preserves the source and exposes retry; only conclusive corruption permits quarantine. Do not retry inconclusive rows in a tight loop. Missing projection data cannot authorize destructive replacement or a fresh formal attempt. While coverage is pending, summary counts/progress remain explicitly unknown and incomplete aggregates are never presented as final totals.

Import validates the complete bounded backup first, derives projections from that validated data and replaces collections in one transaction. Export captures a consistent validated portable snapshot and excludes local projections. Original completion timestamps/results remain authoritative.

## Learning and lifecycle

Generate a small Kotlin directory and per-lesson assets from the shared authored catalogue. Directory metadata renders independently of personal progress and native readiness. Load only the selected lesson, decode off the main thread and retain at most three immutable assets. Content cache identity is the bundled content version, separate from the player's dataset epoch.

Read completion and cursor facts from one epoch. Unknown progress has no personal recommendation action, and its layout reservation remains stable. Submissions and Next depend on durable progress readiness. Runtime structural validation remains; mathematical teaching validation gates packaging. See [learning content](../learning.md).

Observe visible workflows while STARTED, cancel superseded requests and fence every delivery. Ordinary refresh retains compatible data; restore/clear immediately invalidates old-epoch facts and pagination. Re-evaluate daily keys on foreground and at the Beijing date boundary without scanning historical payloads.
