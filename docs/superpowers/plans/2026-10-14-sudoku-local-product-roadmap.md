# Sudoku Local Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user explicitly selects delegation. Deliver complete milestones and track their steps with checkboxes. Do not request a separate product decision for every small implementation detail.

**Goal:** Develop the existing application with deeper teaching, explainable advanced play, varied puzzles, and local data protection.

**Architecture:** Retain the pure TypeScript engine, production Workers, feature-owned Vue workflows, and transactional IndexedDB persistence. Share typed deduction evidence across hints, assessment, and lessons. Extend existing owners instead of adding a generic plugin framework or restoring the development CLI.

**Tech Stack:** Vue 3, TypeScript, Vite, Vue Router, Pinia, Naive UI, Web Workers, IndexedDB with idb, native CSS, pnpm, ESLint, Prettier, Vitest, and Playwright. Retain the repository-pinned dependency versions during these milestones.

**Spec:** [First-release design](../specs/2026-10-11-sudoku-design.md), [variant design](../specs/2026-10-11-sudoku-variants-design.md), and [generation and assessment design](../specs/2026-10-13-sudoku-generation-and-rating-design.md), including its continuation amendments. Follow [Web Architecture](../../architecture.md) and [Adding a Sudoku Variant](../../variant-extension.md).

**Status:** Approved by the user on 2026-10-14 with narrowed scope: retain milestones 1–4 and local data protection from milestone 5. Remove difficulty feedback, manual playtest calibration, and the independent release-acceptance milestone. Approval does not authorize commits, pushes, or remote publication.

**Progress (2026-10-14):** Milestones 1–3 are implemented and verified. See [Advanced and Learning Verification](../verification/2026-10-14-sudoku-advanced-and-learning.md). Milestones 4–5 remain pending.

## Product scope

The application remains a Chinese-language, statically hosted product with computation and data in the current browser. Keep casual play, guided learning, daily challenges, and personal records. Retain Classic, Diagonal, Jigsaw, Killer, Thermo, and Arrow; this roadmap adds depth to these six types.

The follow-up scope includes five complete milestones: engineering consistency, advanced Classic play, expanded courses, generation and difficulty evaluation, and local data protection. A milestone includes its player flow, validation, tests, and documentation.

Accounts, cloud or cross-device synchronization, friends, global leaderboards, telemetry, and PWA/offline installation are outside the product scope. Manual local backup files are a data-protection feature. This roadmap also excludes additional Sudoku types, a general puzzle editor, arbitrary third-party import formats, and unrestricted chains or guessing techniques.

Player difficulty feedback, manual playtest calibration, and a separate project for remote deployment, physical-device acceptance, and release performance targets are removed from this roadmap. Keep the automated correctness and interaction checks required for the retained changes.

## Global constraints

- Write repository documentation, identifiers, comments, and test descriptions in English; write player-facing copy in Chinese.
- Retain the existing stack and module dependency direction. Keep application composition in `src/runtime.ts`, computation in `src/worker/`, and persistence and editing ownership in `src/storage/`.
- Maintain the six existing types and the current Easy, Medium, and Hard technique policies. Add Expert only for Classic in this roadmap; other types continue to offer three supported tiers.
- Daily challenges remain Medium, update at midnight in `Asia/Shanghai`, and keep one formal attempt per type and date. Preserve assistance classification, replay rules, old-date resume, and completion eligibility.
- Preserve existing puzzle boards, session IDs, histories, lesson completion, results, and accumulated time. Never regenerate or regrade stored games during restoration.
- Current defaults remain `{ maxLayouts: 20, maxWork: 1000000, maxSteps: 500, fallbackWork: 1000000 }`, with a 15,000 ms Worker timeout. Any proposal to change these limits needs separate evidence and an explicit design amendment.
- Construction, uniqueness, assessment, and variant necessity share construction work; fallback validation uses its separate allowance. Exhaustion remains an explicit incomplete outcome.
- New random-call ordering or selection semantics requires a new generation identity. New techniques, grading policies, or workload definitions require a new assessment identity. Do not restore historical generators, cutoff routing, or frozen historical seed reproduction.
- Use typed static capability and definition maps with compile-time completeness checks. Reject unsupported type/tier combinations at UI, engine, Worker, and storage boundaries.
- Every new deduction needs a sound detector, typed evidence, Worker validation, Chinese explanation, accessible highlights, and an independent fixture oracle.
- Keep the removed Node CLI and `tooling/` directory absent. Use Vitest fixtures and real emitted Workers for corpus verification.
- Keep hints and automatic candidates independent of manual player notes. Assistance, time, and recorded completion are not undone by board history.
- Use Naive UI for common controls, preserve keyboard ownership and focus, and maintain the 360-pixel touch layout and paused-board concealment.
- Commits, pushes, and remote publication require an explicit user request. Planning does not authorize those actions.

## Delivery sequence

| Milestone | Deliverable                                                       | Dependencies                                      | Completion evidence                                                                                                                              |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Consistent Windows/Linux development and a trustworthy baseline   | Current application                               | Formatting, type, lint, unit, build, and every configured browser project pass with recorded commands                                            |
| 2         | Six advanced deductions and complete Classic Expert play          | 1                                                 | Independent proofs, transport validation, rated unique fixtures, generated or verified fallback Expert games, complete session and records flows |
| 3         | A 32-unit course catalogue with guided and transfer exercises     | 2                                                 | Every unit has validated exercises; keyboard/touch completion and persisted old/new progress work                                                |
| 4         | Broader variant construction and a reproducible difficulty corpus | 2; course fixtures from 3 where useful            | Independent uniqueness and geometry checks, diversity evidence, budget/fallback statistics, current-version determinism                          |
| 5         | Versioned local backup and restore                                | 1; final course and assessment contracts from 2–4 | Atomic restoration, malformed-file rejection, concurrency protection, and preserved records                                                      |

Teaching and generation share completed engine contracts. Backup design can proceed independently, but its final verification uses the expanded course and assessment data. Keep one consolidated scope and report progress at milestone boundaries.

## Milestone 1 Engineering consistency

**Files:** Create `.gitattributes` and `.editorconfig`; update `.prettierrc.json`, README, and `.github/workflows/ci.yml` only where verification identifies a need. Normalize existing tracked text without changing its content. Use the existing boundary suite and browser configuration.

**Contract:** Git, editors, and Prettier use LF for repository text on Windows and Linux. Existing application behavior and pinned packages remain unchanged.

- [x] Add `* text=auto eol=lf` to `.gitattributes`, `end_of_line = lf` and UTF-8 to `.editorconfig`, and explicit `endOfLine: 'lf'` to Prettier configuration. Keep binary detection intact and avoid changing global Git settings.
- [x] Normalize current tracked text, inspect the content diff, and retain unrelated work. Add no new behavior tests for a line-ending-only change.
- [x] Verify the pinned Node/pnpm runtime, production browser assets, and the documented project-local Firefox cache workaround. Establish commands that reproduce the baseline on the development host.
- [x] Run all configured checks and inspect actual GitHub Actions jobs. Separate setup failures from application failures; fix confirmed test races at their cause.
- [x] Record the baseline in a verification report, including Worker assets, browser projects/concurrency, warnings, and environment constraints.

**Acceptance:** `pnpm format:check` passes on the unmodified working tree after the normalization. Types, ESLint, all unit tests, both deployment builds, and desktop/mobile Chromium, Firefox, and serial WebKit tests pass. Do not weaken checks or increase the production timeout to obtain a green result.

## Milestone 2 Advanced Classic play

**Files:** Extend `src/core/sudoku/{techniques,logic,hint,ratingPolicies,rating,generation,classicGeneration,types}.ts`; place advanced detectors and their tests under `src/core/sudoku/` when they form a coherent responsibility. Extend `src/worker/{hintEvidence,protocol,client,sudoku.worker}.ts`, game difficulty presentation/setup/session owners, record aggregation, and storage decoders. Update independent rating/deduction fixtures and real Worker browser tests.

**Contract:** Add six Classic techniques: naked triples, hidden triples, X-Wing, Swordfish, XY-Wing, and simple coloring. Simple coloring supports single-digit color trap and color wrap with strong links justified by complete nine-digit units. Keep the existing five Classic techniques first in deterministic policy order. Advanced policies initially apply to Classic only.

Classic retains Easy, Medium, and Hard and gains Expert (`expert`), displayed as "专家". Expert means that existing Hard cannot complete the puzzle, while Hard plus the six new techniques can. Extend the domain union to `easy | medium | hard | expert`, with an exhaustive capability map that enables Expert only for Classic. A search answer never supplies a hint or a difficulty grade. Variants expose and accept only their current three tiers; daily remains Medium.

Use explicit evidence variants for subsets, fish, wings, and coloring. Evidence must identify the actual units, candidate domains, links, removed candidates, and any required premises. The Worker validates those premises against the current puzzle state rather than trusting object shape or the claimed technique name.

- [x] Author independent positive and negative deduction fixtures before implementation. Cover false fish patterns, misplaced wing peers, incomplete units, contradictory coloring graphs, no-op eliminations, and already-filled cells. Replay conclusions without production detectors or candidate helpers as the sole oracle.
- [x] Implement bounded, deterministic detectors, evidence, explanations, and highlighting. Charge work for combinations and graph traversal; preserve cancellation and explicit exhaustion.
- [x] Introduce an exhaustive type/tier capability map and carry it through requests, policy dispatch, saved data, setup choices, record summaries, and learning practice. An unsupported Expert variant is an actionable validation error.
- [x] Add independent Classic Expert fixtures and authored fallback puzzles. Reuse construction and uniqueness checks; accept only a matching complete Expert assessment.
- [x] Version the assessment and affected generation policies together. Keep old boards/results and the stored difficulty intact; older assessment metadata follows explicit supported/unavailable decoding without automatic regrading.
- [x] Verify the complete Expert player flow: selection, real Worker delivery, notes, hints, undo/redo, pause, save/resume, restart, completion, assistance, and separate personal bests.

**Acceptance:** Each technique has an independently justified conclusion and rejected near-miss cases. Expert requires a deduction beyond the unchanged Hard policy and a uniquely solvable full puzzle. Actual production Workers agree with fixture facts at `/` and `/sudoku/`. Existing three-tier and daily behavior remains covered.

## Milestone 3 Complete learning paths

**Files:** Extend `src/features/learning/model/{lessonIds,lessons,examples,variantExamples}.ts`, the exercise composable, progress store, and learning/lesson views. Add course-specific fixture files beside those owners when their responsibility warrants it. Update lesson progress decoding, keyboard tests, and `tests/e2e/{learning,learning-navigation}.spec.ts`.

**Contract:** Deliver 32 course units: 12 Classic units and four units for each of the five variants. Preserve the identifiers and completion facts of all 11 existing units; add 21 units. Keep units freely selectable, with type navigation, next/resume/review actions, and saved progress.

| Course              | Units                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Classic foundations | Rules, naked singles, hidden singles, locked candidates, naked pairs, hidden pairs       |
| Classic advanced    | Naked triples, hidden triples, X-Wing, Swordfish, XY-Wing, simple coloring               |
| Diagonal            | Rules, diagonal singles, diagonal/unit intersections, combined diagonal reasoning        |
| Jigsaw              | Rules, regional singles, region/row/column intersections, combined regional reasoning    |
| Killer              | Rules, cage remainder and distinctness, cage candidate combinations, cage/unit reasoning |
| Thermo              | Rules, ordered bounds, path/unit interactions, combined ordered-path reasoning           |
| Arrow               | Rules, direct equations, circle/shaft combinations, arrow/unit reasoning                 |

Every unit includes a Chinese explanation, a guided example, and two original validated exercises: one isolates the target inference and one transfers it to a different position. Each variant's final unit includes an ordered exercise with at least three meaningful deduction stages. Classic advanced units link to Expert practice; foundations and variants retain an appropriate supported tier.

Reuse typed deduction evidence for explanations. Multi-stage exercises declare their board/candidate states, expected placements or eliminations, and explanations explicitly. A wrong answer retains the current stage for retry. Save completion only after all required exercises succeed, and never report durable progress before its write commits.

- [x] Extend stable lesson IDs and declarative course paths. Preserve existing completion and last-visited behavior; explain newly added units when a previously complete course has more work available.
- [x] Implement guided and transfer exercise progression behind a typed exercise-stage model. Keep keyboard, touch, and submit actions aligned; preserve cleanup, route changes, and full-board practice ownership.
- [x] Author and independently validate each exercise's premises and expected facts. Arithmetic lessons show numeric domains/equations; regional lessons show their actual unit intersections.
- [x] Expand the catalogue to the 32 specified units and connect practice to the supported tier/type. Keep detailed guidance beside the lesson workflow rather than splitting each small operation into a separate feature.
- [x] Verify every unit end to end, including a wrong answer, retry, completion, refresh, direct navigation, and returning to its course path. Verify old progress alongside newly added units.

**Acceptance:** All 32 units are functional, every exercise has independent proof facts, and multi-stage answers cannot skip required stages. Both keyboard and touch can complete the courses. No existing completion, active practice game, or route ownership is lost.

## Milestone 4 Generation diversity and difficulty evaluation

**Files:** Extend `src/core/sudoku/{generationStrategies,variantGeneration,variantTemplates,search,budget}.ts` and the five variant modules. Keep reusable bounded construction in the engine; leave the common dispatcher responsible for identity and acceptance. Extend independent reference solvers, terminal/geometry diversity helpers under `tests/support/`, seeded generation tests, rating fixtures, and Worker browser tests. Save corpus definitions and aggregate reports with verification documentation.

**Contract:** Broaden complete solutions and rule geometry for the current five variants while preserving unique solutions, logical completion at the requested tier, meaningful variant rules, bounded work, verified fallback, and deterministic seeded identity.

| Type     | Construction direction                                                    | Independent structural checks                                                                          |
| -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Diagonal | Construct complete boards using row, column, box, and both diagonal units | Both diagonals; unique solution; additional rules materially affect solving                            |
| Jigsaw   | Construct connected nine-cell regions and a compatible complete board     | Nine disjoint connected regions covering all cells; irregularity; correct regional constraints         |
| Killer   | Use broader Classic complete boards and seeded cage partitions            | Connectivity, distinct cage digits, exact totals, and varied cage shapes/sizes                         |
| Thermo   | Use broader Classic complete boards and generate ordered paths            | Legal path geometry, strict increase, length/direction distribution, and actual candidate restrictions |
| Arrow    | Use broader Classic complete boards and generate compatible sum paths     | Circle/shaft sums, legal geometry, and permitted repeated shaft digits under Sudoku units              |

Diagonal is the first integration because its units are fixed. Jigsaw follows because region construction and solution construction must agree. Killer, Thermo, and Arrow can consume bounded Classic terminals before constructing compatible clues. An abandoned construction attempt consumes the same request budget; it never resets work.

Do not count digit relabeling, rotation, reflection, or a changed givens mask alone as evidence of broader complete-grid families. Use independently checked terminal invariants and canonical rule-geometry signatures with each type's legal transforms. Unequal invariants can prove a diversity lower bound; equal ones do not prove equivalence. No uniform-sampling claim is required.

Establish a versioned corpus with 64 fixed seeds for each supported type/tier combination: 19 combinations after Classic Expert, totaling 1,216 generation requests. Use a four-seed subset per combination for regular regression and the complete corpus for milestone verification. Reports record constructed/fallback counts, explicit failures and exhaustion, independent uniqueness, logical tier, technique counts, work, terminal/geometry diversity, and timing separately.

Compare the current and proposed generator on the same corpus and limits. A seed has no historical reproduction requirement after a version change. Record the new version's repeatability, retained saved attempts, and current daily identity rules.

- [ ] Define the corpus and independent diversity/structure checks before changing generation. Measure the existing baseline under identical limits.
- [ ] Implement broader Diagonal and Jigsaw construction and independently validate terminals, regions, necessity, and fallback paths.
- [ ] Implement broader Killer, Thermo, and Arrow terminal/geometry construction. Exercise forbidden digit transforms, arithmetic collisions, incomplete construction, and budget consumption.
- [ ] Provide verified fallback coverage for all 19 supported type/tier combinations and advance affected generation identities. Verify saved-attempt precedence and unchanged formal daily eligibility.
- [ ] Run the complete corpus and real Worker subset at both deployment roots. Require valid matching assessments for every delivered puzzle and explicit outcomes for incomplete requests.
- [ ] Publish the per-type/tier corpus report. The initial diversity gate is at least four independently distinguished terminal families per variant across its corpus, plus multiple legal geometry signatures where geometry varies. Keep the seed set fixed when judging the gate.

**Difficulty evaluation:** Technique tiers remain the primary grade. Workload vectors describe differences within a tier; clue count or machine search time does not assign human difficulty. Review unusually long/short traces and concentration in one technique against authored fixtures and independently checked deduction traces. Numeric scoring, player-feedback collection, and human calibration are outside this scope.

**Acceptance:** Independent constraints and uniqueness checks agree for the corpus; delivered assessments match requested tiers; diversity gates exclude cosmetic transformations; work remains bounded and reproducible. Compare fallback/failure rates with the recorded baseline and investigate regressions before completing the milestone. Timing reports name the device/browser and do not alter seeded acceptance.

## Milestone 5 Local data protection

**Files:** Add a cohesive backup owner under `src/storage/` with runtime decoding and transactional import/export tests. Expose it through the runtime/repository contract. Extend records/settings presentation and its feature store for backup preview, download, restore, and error recovery. Extend storage/browser tests; avoid a generic data-tools feature.

**Contract:** Provide a JSON envelope with `backupVersion: 1`, an ISO `exportedAt`, and the collections `sessions`, `results`, `lessons`, and `settings`. Preserve IDs, puzzle versions, boards, notes, history, accumulated time, assistance, original result facts, and lesson completion. Omit editing leases, tab ownership, runtime workers, and transient save status. Keep the existing session/result record format unless its actual data contract requires a version change.

Keep IndexedDB schema version 1 and its existing stores; backup and restore need no additional store. Preserve all existing records, and use the existing dataset epoch to fence stale writes when restoring data.

Export captures a consistent committed snapshot and settles the current game before taking that snapshot. If the current game cannot be saved, show the failure and offer retry; do not describe a stale committed snapshot as a complete backup of current edits. Inform the player of quarantined or excluded records explicitly.

Restore has a preview of format/version, export time, type counts, and collection counts. Validate the whole file before mutation, with bounded bytes, records, history, and parser work. Unknown versions, malformed puzzles, disconnected histories, duplicate IDs, or inconsistent completion facts produce an error without changing current data. Valid older optional assessment metadata retains explicit availability semantics.

The first restore mode replaces the local dataset after confirmation. Commit all imported collections and the advanced dataset epoch atomically. Invalidate leases and stale writes across tabs, rebase storage revisions, reload views, and restore active games as paused. A transaction failure leaves the original dataset intact. Do not implement implicit merging or import foreign daily results into a new formal attempt.

Importing a result must not inflate an existing daily attempt or turn a practice result into a formal one.

- [ ] Define and document the backup format, collection boundaries, and validation limits. Test round-trip fixtures for every type, Classic Expert, all modes, old lesson progress, and optional assessment outcomes.
- [ ] Implement consistent export and error feedback, including pending saves and quarantined records.
- [ ] Implement full-file validation and transactional replacement behind a narrow storage contract. Test rollback and dataset epoch fencing before adding restore controls.
- [ ] Add accessible download/restore preview and confirmation controls, with explicit Cancel focus and clear local-storage consequences.
- [ ] Verify restore during another tab's editing, a pending Worker response, a queued save, hidden-page pause, and a failed transaction. Verify unsupported and oversized files without partial writes.

**Acceptance:** Backup/restore preserves domain facts and can recover a refreshed or empty browser-local dataset. Failed or invalid imports leave data intact; old tabs cannot recreate the replaced dataset. No backup data leaves the browser automatically.

## Verification across milestones

Use the relevant unit and production-Worker browser tests while implementing each retained milestone. Verify keyboard and touch operation, accessible explanations, modal ownership, pause concealment, save/resume, daily eligibility, and backup recovery where the change affects them.

Before completing the approved scope, run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, and `pnpm build:subpath`, then every configured Playwright project against the local production preview. Use two workers for desktop/mobile Chromium and Firefox, and `--workers=1` for WebKit as documented by CI. Inspect every exit code and the final diff; record warnings and environment limitations explicitly.

Milestone 4 includes the complete generation corpus. Update README, the active ownership map, extension documentation, and verification reports to the delivered contracts. Local automated evidence does not imply physical-device or remote-deployment acceptance; those projects are outside this approved follow-up scope.

## Review focus

| Failure condition                                                                                | Expected behavior                                                                       | Owning milestone |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------- |
| Expert selected for a variant or introduced by malformed transport/data                          | Explicit rejection with a usable recovery action; no unrelated fallback tier            | 2                |
| A visually plausible advanced pattern has invalid candidate premises or exceeds budget           | No deduction; explicit incomplete outcome when appropriate                              | 2                |
| A course was complete before more units were added or an exercise is interrupted mid-stage       | Existing completions remain; new work is explained and progression resumes correctly    | 3                |
| Different seeds produce rotated/relabelled copies or construction repeatedly abandons candidates | Report true terminal/geometry diversity and all consumed work; retain verified fallback | 4                |
| Restore races with a peer tab, a queued save, a late Worker response, or transaction failure     | Atomic replacement or no replacement; epoch fencing prevents resurrection               | 5                |

## Definition of done

The roadmap is complete when all five milestone checklists and acceptance criteria have evidence. The target product has six types, 19 supported type/tier combinations, 32 functional course units, reproducible uniquely solvable puzzles, sound explainable hints, local backup and restore, and verified local production-build/browser flows.

Keep archived plans and reports historical. Update the active README, ownership map, variant checklist, and applicable designs to the delivered contracts. Preserve the user's excluded scope rather than reintroducing it as a future backlog. New techniques beyond the six named here or new Sudoku types require a new scope decision after this roadmap.

## References

- [Git attributes and line endings](https://git-scm.com/docs/gitattributes)
- [Prettier end-of-line option](https://prettier.io/docs/options#end-of-line)
- [HoDoKu naked subsets](https://hodoku.sourceforge.net/en/tech_naked.php)
- [HoDoKu hidden subsets](https://hodoku.sourceforge.net/en/tech_hidden.php)
- [HoDoKu basic fish](https://hodoku.sourceforge.net/en/tech_fishb.php)
- [HoDoKu wings](https://hodoku.sourceforge.net/en/tech_wings.php)
- [HoDoKu simple coloring](https://hodoku.sourceforge.net/en/tech_col.php)

Use these technique descriptions to review premises. Author project-specific fixtures, explanations, and tests, and verify them independently.
