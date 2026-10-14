# Local Backup Format and Recovery

The records page exports committed browser-local data as UTF-8 JSON. A file contains `backupVersion: 1`, an exact ISO UTC `exportedAt`, and four collections: `sessions`, `results`, `lessons`, and one `settings` object. The file remains on the player's device; the application does not upload it.

## Collection contracts

| Field      | Contents                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessions` | Format-2 session records, including puzzle versions/seeds/rules, difficulty, entries, notes, undo/redo history, time, assistance, optional assessment, completion and metadata |
| `results`  | Format-2 original completed-session snapshots, including formal/practice daily facts                                                                                           |
| `lessons`  | Stable lesson IDs and original completion instants                                                                                                                             |
| `settings` | Theme, timer/conflict preferences, current lesson and optional incomplete exercise cursors                                                                                     |

Export normalizes supported legacy format-1 records through the existing decoders. Missing assessment metadata stays absent; unsupported or corrupt optional metadata retains explicit unavailability. Neither export nor restoration regenerates a puzzle, changes its difficulty, requests a new assessment, or rewrites first-completion facts. A result cannot become formal unless its original date/type/session identity already meets the domain contract.

Editing leases, tab IDs, workers, transient phases/save status and the dataset epoch are not portable collections. Stored revisions appear in the file but are rebased to 1 during replacement. Restored games are loaded paused and require explicit resume.

## Limits and validation

| Limit                                                          | Maximum   |
| -------------------------------------------------------------- | --------- |
| UTF-8 file                                                     | 25 MiB    |
| Combined session/result/lesson records                         | 10,000    |
| Undo plus redo moves per session or result                     | 2,000     |
| Combined history moves across exported records                 | 10,000    |
| Parsed values/property values traversed before domain decoding | 2,000,000 |
| Nesting depth                                                  | 32        |

The UI checks file bytes before reading. Storage checks UTF-8 bytes again, bounds the whole object and histories before domain decoding, and validates every collection before opening a replacement transaction. It rejects unsupported versions, malformed JSON/rules/history, duplicates within a collection, multiple free sessions of one type, multiple learning sessions, incomplete results and contradictory session/result identity or completion facts. Multiple daily sessions and historical results remain legitimate. Shared IDs may occur across sessions/results because those collections serve different purposes; matching puzzle/metadata identity must agree. An unfinished snapshot can coexist with its retained first result. Unknown old lesson completion IDs remain historical facts through the existing lesson decoder.

Export first pauses/settles the current game, cancels computation, flushes its saves and pending settings writes, then reads all four collections and exclusion counts in one readonly transaction. Failed current writes prevent a download until retry succeeds. Already quarantined records and newly excluded invalid records are counted separately in player feedback. Export leaves invalid source records in place; ordinary record recovery remains their owner. A dataset exceeding the format limits produces an explicit error instead of an unusable file.

## Replacement and concurrency

The preview shows format, original export time, collection counts and per-type session/result counts. Confirmation initially focuses Cancel and explains that restoration replaces the entire current dataset. Cancelling does not change storage.

Confirmation settles the current game/settings and passes the preview's observed dataset epoch to storage. In one readwrite transaction, restoration checks that epoch, replaces all player collections, clears quarantine and leases, rebases revisions and advances the local epoch. An abort rolls all changes back. A competing clear/restore invalidates the preview; normal edits before confirmation are part of the dataset the player explicitly replaces.

Old leases and epoch-fenced settings/lesson writes cannot recreate replaced records. Generation captures the dataset epoch before computation and rejects leases from a different epoch; the repository checks that same lease epoch atomically during creation. Daily eligibility reads retain their pre-computation fence. A job started without an available epoch remains memory-only while storage is unavailable and cannot adopt newly recovered storage. Current and peer views cancel late Worker installation, discard old in-memory queues, reload preferences/progress/catalogues, and retain games as paused snapshots. Mounted exercises invalidate pending answers on a dataset generation change and resume their restored cursor only after progress reload; ordinary stage writes keep explicit Next interaction. BroadcastChannel prompts immediate peer reset; transaction-level epoch checks protect writes even when a notification is delayed or unavailable.

Initial preference updates merge only the player's explicit patches into committed settings. They cannot overwrite unread restored metadata with default values. A dataset conflict requires reloading settings before further writes; retry does not borrow the new epoch for an old snapshot. Course cursors carry their own expected dataset epoch, and mounted exercises wait for canonical preferences/progress after recovery before accepting another answer.

## Verification

Storage round trips cover all 19 supported type/tier combinations, all modes, original daily eligibility, legacy identities, optional assessments, notes, both history stacks and course cursors. Tests cover invalid/oversized files, consistent export/exclusion counts, atomic rollback, stale preview epochs, queued writes delivered after restoration, and late Worker responses. Browser checks download an actual file, restore it after clearing/refreshed storage, verify old lesson progress and paused game recovery, exercise Cancel focus, and replace a hidden peer editor on Chromium, Firefox and serial WebKit.
