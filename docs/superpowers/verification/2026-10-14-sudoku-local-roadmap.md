# Local Product Roadmap Verification

The approved [roadmap](../plans/2026-10-14-sudoku-local-product-roadmap.md) delivers LF consistency, six advanced Classic deductions/Expert, 32 complete course units, broader variant construction, a reproducible corpus, and browser-local backup/restoration. Accounts, cloud synchronization, PWA, player feedback, manual calibration and a separate remote/physical-device acceptance project remain excluded.

## Delivery and ownership

Milestones 1–3 were locally committed by explicit user request in `59668e5` after complete verification; LF controls were previously committed in `26a1791`. See [Advanced and Learning Verification](2026-10-14-sudoku-advanced-and-learning.md). The user then authorized grouped local commits: milestone 4 is `26c51f2`, and milestone 5 plus final recovery fixes is `378d465`. Public documentation and this delivery record form a separate commit. No new branch, worktree, push or remote publication was used for this continuation.

[Generation Corpus Verification](2026-10-14-sudoku-generation-corpus.md) records the exact 64-seed/19-combination corpus and unchanged production limits. Diagonal, Jigsaw, Killer, Thermo and Arrow have respectively 26, 29, 22, 24 and 23 independently distinguished terminal-family lower bounds, compared with one per variant at baseline. All 1,216 requests are uniquely solvable, independently structured/necessary, correctly graded and checked step by step against independent solution facts. Fallback changes from 257 to 234; Killer Hard remains concentrated in its verified authored fallback. Timing is host/runtime-specific.

[Local Backup](../../local-backup.md) documents the format, limits, committed export, atomic replacement, preview, active-slot validation, legacy facts, epoch/revision/lease handling and cross-tab behavior. File downloads and restoration preserve notes, history, time, assistance, original daily results, optional assessment availability, course completion and incomplete cursors.

## Verification commands

| Check                                                                 | Result                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                      | Passed all four configured TypeScript/Vue projects                                                    |
| `pnpm lint`                                                           | Passed, including enforced module dependencies                                                        |
| `pnpm format:check`                                                   | Passed                                                                                                |
| `pnpm test:unit`                                                      | 667 tests across 59 files passed                                                                      |
| `pnpm build` and `pnpm build:subpath`                                 | Passed; emitted real Worker at both roots                                                             |
| Complete corpus, `SUDOKU_CORPUS_PHASE=current`                        | 1,216/1,216 ready; independent uniqueness, topology, necessity, trace and matching-tier checks passed |
| Forced fallback/exhaustion                                            | All 19 supported combinations passed                                                                  |
| Full desktop/mobile Chromium and Firefox, `--workers=2`               | 317 passed, one expected touch-only skip                                                              |
| Full WebKit, `--workers=1`                                            | 105 passed, one expected touch-only skip                                                              |
| Final recovery regressions on fresh builds, all four browser projects | 20 passed                                                                                             |
| Final complete 32-unit course flow, all four browser projects         | Four passed; every required stage, retry and durable progress verified                                |

Browser launches use the verified project cache `.superpowers/playwright-browsers`. Preview ports are owned by one Playwright invocation at a time. The serial WebKit configuration and production work/time limits are unchanged. Complete logs/raw corpus remain in the ignored roadmap workspace.

The complete browser runs passed 422 tests with two expected skips. After the final settings/consumer recovery additions described below, fresh root/subpath builds passed the affected recovery and complete-course flows (24 tests across all four browser projects). The complete browser suite was not repeated after those final additions. Final type checking, lint and the complete 667-test unit suite passed against the resulting source.

Before the grouped commits, type checking, lint, formatting and all 667 unit tests across 59 files were run again and passed (unit duration 26.64 s). Staged changes were checked separately for each group. The already completed browser and full-corpus evidence above was retained without another unchanged run.

## Whole-roadmap review and fix pass

One fresh-context reviewer assessed committed and current working-tree changes against `0211129`, including every Review Focus condition and applicable continuation amendment. It found three material issues, all reproduced before the fix pass:

1. Without a timely reset broadcast, old computation could acquire new-epoch leases and replace a restored save. Generation now captures its dataset epoch before Worker execution, carries daily eligibility's fence, rejects mismatched fresh leases and relies on atomic repository token checks. Regressions cover free/learning/daily jobs with no broadcast, acquisition/write race windows and actual cross-tab Worker delivery without BroadcastChannel.
2. A file containing duplicate free-type or learning slots could restore successfully and block future creation. Whole-file validation now rejects these conflicts before mutation while retaining legitimate daily sessions/results.
3. A mounted lesson retained its old stage/answers after peer restoration. Dataset/reset readiness generations now invalidate local state and pending answers, then resume the imported cursor after reload. Ordinary progression still requires Next, and passive peer reload preserves imported last-visited settings. Regressions cover restored cursors, late answers and a real combined lesson in another tab.

The focused post-review regression suite passed 83 tests across five files, followed by the then-current 660-test suite. Review fixes were implemented by the primary executor; no second reviewer was dispatched. No Minor findings were deferred.

The primary executor's recovery audit also found that initial preference updates could persist unread defaults, and a retry after a dataset conflict could attach stale settings to the new epoch. Updates now merge explicit initial patches into the committed settings base; conflicts require canonical reload. Lesson cursor writes carry their expected epoch, and mounted exercise readiness waits for preferences/progress recovery. Four preference and three learning regressions were observed failing before the fixes and then passed. The final unit suite includes all 667 tests.

Earlier WebKit failures are retained in the execution record: programmatic file upload bypassed a disabled selector while records were loading, and an added high-work Worker test incorrectly expected an internal engine `source` field in the transport envelope. Tests now wait for the actual enabled selector and assert the documented delivered puzzle/assessment contract. These were test defects; no production timeout was increased or browser project skipped.

## Decisions and scope boundaries

The executor's ledger records these decisions and their cost if wrong:

- Work directly on main, as the user required; there is no isolation checkout, so uncommitted changes stay visible in the shared workspace.
- Use native Windows verification logs and review packaging instead of Bash helpers that assume Task headings and automatic commits; a package must explicitly include untracked work.
- Treat the approved continuation roadmap as the current amendment over historical designs; valid saved facts remain authoritative rather than being regenerated or regraded.
- Exclude accounts, cloud/cross-device synchronization, social features, telemetry and PWA installation, as requested; introducing them later would need a new scope decision.
- Exclude player-feedback collection, human calibration and universal difficulty scoring; technique tiers/workloads do not establish universal human difficulty.
- Exclude remote deployment, physical-device certification and independent release targets; local automated evidence cannot certify those environments.
- Exclude historical seed reproduction and old generator routing; stored boards/results remain portable facts, but old seeds cannot reconstruct historical generators.
- Exclude additional variants, arbitrary third-party formats, unrestricted chains and advanced variant techniques; supported-format malformed imports are still validated and rejected.
- Make no uniform-sampling or minimum-clue/minimality guarantee; family lower bounds and unique matching-tier solutions establish the promised generation contract.

## Warnings and practical limits

Vite continues to report a main chunk above 500 kB; the current measured main JS is 756.31 kB (221.91 kB gzip), with a 44.17 kB Worker. No code-splitting claim is made. jsdom reports its existing unimplemented `scrollTo` notice in unit tests; browser console/application-error assertions remain enforced.

Backups stay local and are limited to 25 MiB, 10,000 combined records, 2,000 history moves per record and 10,000 combined history moves, with parser work/depth bounds. Larger datasets fail explicitly rather than produce an unrestorable file. Browser-local persistence still depends on committed writes; abrupt termination can lose pending edits and uncheckpointed time. Manual backup files need to be retained separately from cleared browser storage.
