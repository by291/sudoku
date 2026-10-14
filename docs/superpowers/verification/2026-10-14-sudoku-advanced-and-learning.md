# Advanced Classic Play and Learning Verification

This report covers milestones 1–3 of the approved [local product roadmap](../plans/2026-10-14-sudoku-local-product-roadmap.md). Variant terminal/geometry breadth, the full generation corpus, and local backup/restore remain the next milestones.

## Delivered contracts

Classic offers Expert in addition to the unchanged Easy, Medium, and Hard policies. Expert uses naked triples, hidden triples, X-Wing, Swordfish, XY-Wing, and simple coloring after the existing five techniques. Variants retain three supported tiers; daily remains Medium. The capability map covers 19 type/tier combinations and rejects unsupported Expert combinations in generation, transport, saved puzzles, and player entry URLs.

The assessment identity is `sudoku-rating-v2`; Classic generation is `sudoku-v3`, while variant generation remains `sudoku-variants-v2` until milestone 4. Stored puzzle boards, difficulty, session IDs, assistance, completion, and formal daily facts remain authoritative. Older optional assessment versions become explicitly unavailable without regrading.

Advanced deductions carry subset, fish, wing, or coloring proofs with candidate snapshots and actual units/links. Worker clients replay the requested board, check earlier actions, and validate advanced implications directly. Search answers never produce a hint or assign a technique grade. Combinations and graph traversal consume bounded work. Generation diagnostics report construction/fallback work and abandoned layout attempts without resetting budgets.

Learning has 32 units: 12 Classic and four for each variant. Preserve the original 11 IDs and completion facts. Every unit has two exercises with different inference targets; each combined variant exercise has three ordered stages. Arithmetic guidance shows domains and equations, and advanced guidance names units, pivots, colors, and strong links. Incomplete cursors use optional `settings.lessonStages`; database schema 1 and completion record formats remain unchanged. Final completion is visible only after its write commits.

## Independent evidence

The authored Expert fallback is independently unique, stalls under Hard, and finishes under Expert with explained coloring. Separate unit construction and candidate/action replay check its strong-link facts and conclusions. Pattern fixtures cover false fish, a fourth Swordfish cover, misplaced wing peers, triple near misses, ineffective removals, filled cells, odd strong-link cycles, conflicting colors, and work exhaustion. All course candidate states admit a valid assignment, and an independent solver rejects each forbidden conclusion; the sparse introductory Jigsaw state uses a separately checked complete witness.

Player tests exercise all 32 units with wrong answers, retry, ordered completion, refresh, direct routes, and course navigation. Every course opens its supported full-board practice tier. Expert tests cover actual Worker delivery at `/` and `/sudoku/`, notes, hints, undo/redo, pause, resume, restart, completion, assistance, and separate bests.

Save/reset regressions cover stale course responses, failed stage writes, failed completion writes, interrupted final cursor cleanup, and the last-visited/stage-save ordering found by WebKit. Lesson input stays busy until its initialization and visit write settle. Unsupported Expert URLs show recovery choices instead of throwing or silently generating another tier.

## Verification status

All final checks passed on 2026-10-14. Full logs remain under the ignored `.superpowers/sdd/2026-10-14-sudoku-local-product-roadmap/` directory.

| Check                               | Command                                                                                      | Result                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Types                               | `pnpm typecheck`                                                                             | Passed: Vue, application, Node, Worker, and browser-test configurations |
| Lint                                | `pnpm lint`                                                                                  | Passed                                                                  |
| Format                              | `pnpm format:check`                                                                          | Passed                                                                  |
| Unit suite                          | `pnpm test:unit`                                                                             | 568 passed across 53 files                                              |
| Root build                          | `pnpm build`                                                                                 | Passed                                                                  |
| Subpath build                       | `pnpm build:subpath`                                                                         | Passed                                                                  |
| Desktop/mobile Chromium and Firefox | `pnpm exec playwright test --project=desktop --project=mobile --project=firefox --workers=2` | 296 passed, one expected touch-only skip                                |
| Serial WebKit                       | `pnpm exec playwright test --project=webkit --workers=1`                                     | 98 passed, one expected touch-only skip                                 |

Browser total: 394 passed and two expected skips. The full WebKit run exposed the visit/stage ordering race before the fix; the final complete rerun passed, including all 32 units (2.0 minutes) and every unit's full-board practice (46.0 seconds). No failing run was treated as passing evidence. Final builds emit a 742.37 kB main script (217.98 kB gzip) and a 42.85 kB Worker. Both deployment roots exercised real emitted assets.

## Host and limitations

The development host uses Windows, Node.js 26.10.0, and pinned pnpm 12.11.2. Git attributes, EditorConfig, and Prettier enforce LF without changing global Git configuration. Firefox uses the documented `.superpowers/playwright-browsers` cache. Playwright invocations run sequentially by project group so one invocation cannot stop another's reused preview server; WebKit uses one worker, other projects two.

Production defaults remain `{ maxLayouts: 20, maxWork: 1000000, maxSteps: 500, fallbackWork: 1000000 }`, with a 15,000 ms Worker timeout. Vite still reports a main-chunk size warning; jsdom reports its existing unimplemented `scrollTo` notices. These checks cover local production builds and browser emulation, without claiming physical-device or remote-deployment acceptance.

The remote CI and Dependabot jobs for the preceding LF commit `26a1791` were inspected and completed successfully. They do not validate these unpushed feature changes. [Previous-commit CI](https://github.com/by291/sudoku/actions/runs/38443252538).
