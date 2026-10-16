# Portable Rust Sudoku Core and Browser WASM Implementation Plan

> Post-migration cleanup: the user requested removal of experiment and benchmark code. The completed benchmark tasks below describe historical work; their harnesses have been retired. Correctness suites and recorded audit reports remain maintained.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace production TypeScript Sudoku computation with a reusable native Rust core and a separate typed browser WASM adapter, adopting a new deterministic byte-seed generation contract while preserving mathematical/player behavior and saved facts.

**Architecture:** A Cargo workspace owns `sudoku-core` and `sudoku-wasm`; the core contains all mathematical rules, search, deductions, rating and generation. The browser shares compiled WASM code between independent main-thread and per-job Worker instances; TypeScript retains UI, session history, storage and transport ownership. The existing engine remains production dispatch until the complete Rust implementation passes its compatibility gates.

**Tech Stack:** Rust 1.98.0, edition 2024, Cargo resolver 3, wasm32-unknown-unknown, wasm-bindgen library/CLI 0.2.129, Serde 1.0.229, serde-wasm-bindgen 0.6.5, Tsify 0.5.8 with `js` enabled and default JSON mode disabled; existing Vue 3.5.43, TypeScript 6.0.3, Vite 8.3.4, pnpm 12.11.2, Vitest 5.0.3 and Playwright 1.64.0. Pin additional transitive dependencies through Cargo.lock and test compatibility before relying on APIs.

**Spec:** [Portable Rust Sudoku Core and Browser WASM Migration](../specs/2026-10-16-rust-core-and-wasm-design.md).

**Review status:** Approved for execution by the user on 2026-10-16 with “ok，先提交计划然后继续吧”. Execute directly in the current session with the executing-plans workflow. The plan uses the [byte seed contract](../specs/2026-10-16-rust-core-and-wasm-design.md#byte-seed-and-deterministic-generation-contract), with no production legacy seed adapter. Production migration starts after committing this plan and its design/evidence documents.

## Global Constraints

- Two production crates: `sudoku-core` and `sudoku-wasm`; no browser/JS/OS/storage/async-runtime dependency in the core.
- Generate only `sudoku-v11` and `sudoku-variants-v11`; preserve `sudoku-rating-v2`. Old string-seeded outputs are not a compatibility target; historical stored snapshots remain loadable without regeneration.
- Use `Seed([u8; 32])`, byte-only generation requests, strict 64-character lowercase hex persistence, BLAKE3 derivation and ChaCha8. Pin `rand_chacha` 0.10.0, `rand_core` 0.10.1 and `blake3` 1.8.7 with no OS entropy/threading features. Use the spec's exact contexts, fixed-width tags/indices, little-endian order and one-u32-to-f64 draw mapping.
- Preserve 40 layouts, 4,000,000 work units and 500 steps; generation timeout 3,000 ms, hints/assessment timeout 15,000 ms; lower caller budgets retain their meaning.
- Preserve six variants, 19 supported type/tier combinations, explicit variant data, random-call order, evidence order, work accounting, catalogue fallback and saved facts.
- Keep catalogue bounds at 512 tuples per cage and 8,192 per layout, compiled only for cages of at most four cells; partial catalogues never escape.
- Keep generation bounds at two active layouts, eight checkpoints, 4,096 seen masks, 32 proposals and eight stagnant evaluations, with existing sharing/scheduling semantics.
- Keep schema 1, format-2 sessions/results, format-1 backup behavior, old daily identities, 32 lesson IDs and optional assessment distinctions.
- Use copies at the binding boundary, generated TypeScript declarations and fallible runtime conversion; no handwritten pointer protocol, silent TS fallback or JS calls inside algorithm loops.
- Keep English source/docs/comments and Chinese player-facing copy. Preserve explanatory ownership, seed-order, budget and trail comments.
- Use fixed independent facts and observable contracts. For behavior-preserving porting, reuse existing contract tests; add regressions for uncovered invariants and new boundaries.
- Keep authored fixtures separate from generation; no authored replacement puzzle or hidden retry budget.
- Core uses `#![forbid(unsafe_code)]`; untrusted input errors are explicit. Apply rustfmt/Clippy and existing TS checks without disabling checks to suppress failures.
- Root and `/sudoku/` must load actual emitted WASM and Worker assets. Shared components remain independent of browser services/runtime.
- Pin verification inputs in the repository. Ignored `.superpowers/` artifacts may seed a checked baseline but cannot be a CI dependency.

## Review Focus

- Byte seeds must retain all 32 bytes across native/WASM/Worker boundaries, reject wrong lengths and malformed current-version hex, and resist caller mutation; Tasks 2, 10 and 13 pin these contracts while historical metadata stays opaque on restore.
- Nearly exhausted budgets, abandoned preparation and partially consumed caller budgets must never become successful uniqueness/assessment results; Tasks 4, 5 and 8 pin these outcomes.
- A failed initialization, mismatched asset or disposed instance must preserve saved data and expose retryable failure; Tasks 10–12 pin lifecycle and failure behavior.
- Semantic validation must remain synchronous after initialization inside IndexedDB workflows, preserving transaction/epoch/lease ordering; Task 13 pins corruption and cross-tab races.
- Late hints, teardown and arithmetic-heavy live board operations must preserve current-board ownership, keyboard responsiveness and bounded execution; Tasks 11, 12 and 15 pin these cases.

## Ownership and common contracts

Create `crates/sudoku-core/src/{types,board,budget,random,puzzle,editing,hint}.rs` and responsibility modules under `rules/`, `constraints/`, `search/`, `logic/`, `rating/` and `generation/`. Use `mod.rs` only for explicit module declarations and deliberate public contracts; do not re-export every subsystem through a facade.

Create `crates/sudoku-wasm/src/{lib,dto,conversion}.rs` for exports, wire shapes and checked conversions. Use wasm-bindgen byte-slice parameters for seed input, not a custom string wrapper. Keep portable domain types in the core; the adapter's DTOs derive Serde/Tsify and map to those types. Tests can use dev-only fixture decoders without introducing an upward dependency from core to the WASM crate.

Create `packages/sudoku-wasm/package.json`, `pnpm-workspace.yaml` and `scripts/build-sudoku-wasm.mjs` for the generated local package `@sudoku/wasm`. Generated files live in ignored `packages/sudoku-wasm/pkg/`. Exclude `experiments/rust-core-benchmark` from the root Cargo workspace so its existing standalone reproduction remains valid. Ignore root `target/` and generated package outputs in the appropriate Git/lint/format configuration.

The following names are shared between tasks; domain result fields mirror their explicit current TypeScript owner unless an adapter-only representation is stated:

| Owner                  | Types and operations                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.rs`             | `Board` owns `[u8; 81]`; validated `Digit`, `CellIndex`, `CandidateMask`; `Difficulty`; `EngineError`; `CoreResult<T> = Result<T, EngineError>`; `Bounded<T> = Complete(T) or BudgetExhausted`. `Board::try_from(&[u8]) -> CoreResult<Board>` and `Board::values() -> &[u8; 81]`.                                              |
| `budget.rs`            | `WorkStage`, `WorkBudget`, `WorkAccounting`; `WorkBudget::new(limit: u64)`, `used() -> u64`, `remaining() -> u64`, `consume(units: u64) -> bool`, `with_stage<T>(stage, operation: impl FnOnce(&mut WorkBudget) -> T) -> T`. Rejecting a charge changes no counters.                                                           |
| `random.rs`            | `Seed([u8; 32])`; `Seed::from_bytes([u8; 32]) -> Seed`, `TryFrom<&[u8]>`, `as_bytes() -> &[u8; 32]`, `Seed::derive(&[u8]) -> Seed`; `SeededRandom::new(&Seed)`, `next_u32() -> u32`, `next_f64() -> f64`. All 32-byte values are valid; no implicit string constructor.                                                        |
| `rules/types.rs`       | `SudokuVariant`, `PuzzleRules`, `Cage`, `Arrow`, `Unit`, `RuleConstraint`, `PreparedRules`, `RuleMetadata`; variants and ordered geometry match current `rules/types.ts`. Metadata contains owned plain-data topology for display.                                                                                             |
| `rules/context.rs`     | `compile_rules(&PuzzleRules) -> CoreResult<PreparedRules>` and `prepare_rules(&PuzzleRules, &mut WorkBudget) -> CoreResult<Bounded<PreparedRules>>`; static Classic topology retains its current free preparation behavior.                                                                                                    |
| `constraints/types.rs` | `PreparedComputation` owns `PreparedRules` and immutable prepared support; candidate/conflict/support results mirror current contracts. `prepare_computation(&PuzzleRules, &mut WorkBudget) -> CoreResult<Bounded<PreparedComputation>>`.                                                                                      |
| `search/types.rs`      | `SearchResult` preserves complete/exhausted status, count, optional first solution, nodes and work. `search::exact::count_solutions(&Board, &PreparedComputation, &mut WorkBudget, node_limit: u64) -> SearchResult`.                                                                                                          |
| `editing.rs`           | `BoardLayers { entries, notes }`, `BoardEdit` (enter, erase, toggle note, generate notes), `EditOutcome` (complete layers/changed/completion or exhausted). `edit_board(&Board, &BoardLayers, &BoardEdit, &PreparedRules, &mut WorkBudget) -> CoreResult<EditOutcome>`. First board is immutable givens.                       |
| `logic/types.rs`       | Port `Technique`, `LogicalStep`, `RuleEvidence`, `AdvancedEvidence`, `LogicalWorkspace`, `StepOutcome`, `LogicResult` and limit types from current `logic/types.ts` without renaming serialized identities.                                                                                                                    |
| `rating/types.rs`      | Port assessment inputs/results, workload, identities, target feedback and screening outcomes. `RatedTrial` owns trace and original board; `complete(self) -> RatedAssessment` consumes that ownership without another policy search or charged work.                                                                           |
| `generation/types.rs`  | Port `GenerationInput`, `GenerationLimits`, `GenerationMetrics`, `GenerationResult`, `GenerationExhaustionCause` and layout outcomes. Input uses `Seed` and current typed `GenerationVersion`; `GeneratedPuzzle { content: Puzzle, seed: Seed, puzzle_version: GenerationVersion }` carries output identity.                   |
| `puzzle.rs`            | `Puzzle { givens, solution, rules, difficulty }` and `validate_puzzle(&Puzzle) -> CoreResult<()>`; validate complete solution/rules/given consistency without seed parsing, regeneration, regrading or uniqueness search. Historical metadata belongs to the storage wrapper; generated identity belongs to `GeneratedPuzzle`. |

Counters use native integer types; wire conversion checks exact JS-safe numbers and configured limits. No accidental JS BigInt is permitted. Internal `GivenMask(u128)` never enters DTOs. Generated TypeScript preserves existing discriminators, board/evidence arrays, optional fields and null distinctions. The intentional request change is `GenerationInput.seed: Uint8Array`; generated puzzle wire metadata uses 64 lowercase hex characters, while historical snapshot seed strings are retained verbatim outside the core content type.

## Execution and verification conventions

Run each task's focused tests first, observing meaningful failures for new contracts before implementing them. Complete its checks, review logical grouping/comments, and make one focused commit before the next dependent task. Do not commit unrelated working-tree changes. Existing experiment files/reports are the current task's prior artifacts, not permission to stage every untracked file.

`pnpm test:migration -- --suite <name> --engine <typescript|native|wasm>` is a test-only driver created in Task 1 and extended as consumers exist. Unchanged primitive suites use frozen v10 fixtures; `generation` uses independently created v11 fixtures and a separately manifested JS seed/version adapter, never the old seeded payloads. Native adapters use a test fixture runner under core `examples/`, not a production CLI. Browser tests exercise the generated package and real Workers. Fixtures and adapters compare complete observable JSON projections with explicit permitted field-order normalization only.

The plan dependency chain is 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Task 11 depends on 10; Tasks 12–14 consume 11; Task 15 follows all functional tasks. Do not parallelize writes to shared types/DTOs or split a transaction across independent implementers.

---

## Task 1: Freeze a self-contained baseline and migration test driver

**Files:** Create `tests/migration/{freeze-reference,reference-loader,build-golden,v11-random,run}.mjs`, `tests/migration/{reference,v11-random}.test.ts`, `tests/reference/typescript-engine/`, `tests/reference/tsconfig.json`, and `tests/fixtures/engine-contracts/{manifest,inputs,random,rules,constraints,exact,logic,hints,assessment,editing,validation}.json` plus `generation-v11-{full,targeted,feedback,hard058}.jsonl.gz`. Modify `package.json`, pin test-only `@noble/hashes`/`@noble/ciphers` released versions in `pnpm-lock.yaml`, and check frozen sources through their own alias configuration rather than the production alias.

**Interfaces:** Produces immutable baseline source/fixture manifests and `pnpm test:migration`. Source snapshot is `7c95fb7832e614d4ee8d5089f69bac71d4886c36`; include its 58 production core files plus `src/worker/hintEvidence.ts` and `src/features/game/model/session.ts`. `run.mjs` dispatches named suites and rejects a deliberately corrupted expected result with nonzero exit status.

- [x] Write `reference.test.ts` cases `rejects_a_changed_reference_source`, `rejects_a_corrupted_expected_result`, and `resolves_frozen_imports_without_the_production_engine`; assert hash mismatches fail, corrupting one expected solution fails, and the frozen loader still runs when current engine paths are unavailable to it.
- [x] Run `pnpm exec vitest run tests/migration/reference.test.ts`; confirm these contracts fail before the driver exists.
- [x] Snapshot sources from the fixed commit with per-file hashes. Use `docs/superpowers/verification/2026-10-15-sudoku-core-organization.json` to verify historical input-file hashes and promote its 1,216 full, 256 targeted, 768 feedback and one recovery request identities into repository-owned fixtures. Preserve unchanged primitive topology/budget/editing/logic/rating/storage facts and historical v10 measurements separately; old seeded generation payloads are not v11 expected outputs. Do not import prototype topology as the Rust rules oracle.
- [x] Implement the test-only v11 adapter using maintained JS BLAKE3 and ChaCha8, with the spec's exact stream framing, zero nonce/counter, little-endian word decoding, draw mapping and generation identities. Verify the published upstream primitive vectors and hand-assembled framing bytes before generating fixtures. Patch only generation input/version/seed-output conversion and random stream creation in the frozen loader; record the patch/dependency manifest and fail if other reference code changes. Use plain `chacha8`, not a reseeding convenience RNG.
- [x] Map each generation case to `Seed::derive`'s independently implemented JS equivalent over ASCII `migration:<family>:<zero-based-row>`, where family is `full`, `targeted`, `feedback` or `hard058`. Store the resulting 32 bytes and new v11 identity explicitly in each input fixture. Produce complete v11 result/assessment/trace fixtures with this JS reference and independently validate successful puzzles. Include all-zero, ascending 0..31, all-255 and invalid-length seeds in primitive contracts. Implement canonical projection and comparison in `run.mjs`; generation adapters must not reinterpret old strings as new seeds.
- [x] Run `pnpm test:migration -- --suite all --engine typescript`, reference/byte-stream unit tests and `pnpm typecheck`; expect all 2,241 v11 generation/full-assessment cases and selected unchanged primitive contracts to match. Verify a fresh checkout needs no `.superpowers/` and that a changed stream byte, tag or expected result fails nonzero.
- [x] Commit only the frozen baseline, fixtures, test driver and its configuration as `test: freeze sudoku migration contracts`.

## Task 2: Establish the workspace, validated values, budgets and deterministic random primitives

**Files:** Create root `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`; both crate manifests; core `src/{lib,types,board,budget,random}.rs`, WASM `src/lib.rs`; core `tests/{values,budgets,random}.rs` and `examples/fixture_runner.rs`; package/build files listed above. Modify `.gitignore`, `.prettierignore`, ESLint generated-artifact ignores and `package.json`.

**Interfaces:** Produces the common values/budget/random contracts, `engine_info()` with bridge version 1 and algorithm versions, and `pnpm wasm:build`. Fixture runner supports named JSONL contracts without importing the WASM crate. Set workspace resolver 3 and exclude the prior experimental crate. Core has no JS/platform dependencies; fixture serialization is dev-only.

- [x] Add native tests `rejects_invalid_board_digit_length_and_mask`, `rejected_charges_do_not_change_used_or_stage_totals`, `nested_stage_attribution_is_exclusive`, `byte_seed_rejects_wrong_lengths_without_text_decoding`, and `matches_chacha8_and_blake3_reference_vectors`. Assert 80/82-cell boards, digit 10 and a mask containing bit 9 are invalid; a 2-unit budget rejects a 3-unit charge without mutation; nested stage sums equal used work; 0/31/33-byte seeds fail; zero/high-bit/non-UTF-8 32-byte seeds pass; committed raw words and f64 projections match independent fixtures exactly.
- [x] Run `cargo test -p sudoku-core --test values --test budgets --test random`; confirm missing or stub behavior fails before implementation.
- [x] Implement the types and byte seed primitives with pinned BLAKE3/ChaCha8 dependencies and no entropy/threading features. `Seed::derive` uses the spec's exact root context; `next_f64` consumes one `next_u32` divided by 4294967296.0. Keep descending Fisher–Yates and its draw-site order. Do not implement FNV, Mulberry32, UTF-16 seed storage or string constructors. Name board, unit, bit-mask and budget constants.
- [x] Build the minimal `sudoku-wasm` library exposing `engine_info()`, create the generated package/build script with matching CLI version checks, and add `tests/e2e/wasm-contract.spec.ts` smoke coverage. The build script invokes Cargo incrementally and wasm-bindgen, fails on compiler/binding errors, and never reuses a failed build as success. No application dispatch changes.
- [x] Run native tests, `cargo tree -p sudoku-core --edges normal`, `cargo fmt --check`, native Clippy with warnings denied, `pnpm wasm:build`, and the actual-browser `engine_info` smoke test. Expect no wasm-bindgen/js-sys/web-sys dependency under core. Verify the standalone experiment still builds with its own manifest.
- [x] Commit as `feat(core): add portable sudoku workspace and primitives`.

## Task 3: Compile all six rule types and validate puzzle snapshots in Rust

**Files:** Create core `rules/{mod,types,topology,context}.rs`, `rules/definitions/{mod,classic,diagonal,jigsaw,killer,thermo,arrow}.rs`, `puzzle.rs`, and `tests/{rules,puzzles}.rs`. Extend the fixture runner and native migration adapter in `tests/migration/`.

**Interfaces:** Produces `PuzzleRules`, `PreparedRules`, `RuleMetadata`, `compile_rules`, `prepare_rules`, `Puzzle`, `validate_puzzle`, `board::is_complete(&Board, &PreparedRules) -> bool`, and `board::base_candidates(&Board, &PreparedRules) -> [CandidateMask; 81]`.

- [x] Write tests `matches_all_ordered_topology_contracts`, `arrow_relation_is_not_a_duplicate_peer`, `jigsaw_replaces_boxes`, and `puzzle_content_validation_does_not_require_generation_metadata`. Assert whole units/peers/memberships/related-cell arrays against frozen fixtures, reject malformed path/partition/sum/index geometry, and validate stored mathematical content without a seed/version while rejecting contradictory terminal/givens.
- [x] Run `cargo test -p sudoku-core --test rules --test puzzles`; observe failures for the unimplemented Rust compiler and validators.
- [x] Port the current six focused definitions and topology construction, preserving group ordering, immutable preparation ownership, charged variant compilation and free static Classic preparation. Keep full nine-digit units, duplicate exclusion and related highlights distinct. Return owned metadata snapshots.
- [x] Implement content-only `Puzzle` validation with current supported-difficulty and stored-solution semantics; generation identity remains in `GeneratedPuzzle`. Do not add a uniqueness search, seed decoding or current-version requirement to content validation. Task 13 retains historical metadata validation at the storage owner.
- [x] Run rule/puzzle tests and `pnpm test:migration -- --suite rules --engine native`; compare runtime acceptance, complete ordered topology, candidate masks and completion results, including malformed and historical snapshots.
- [x] Commit as `feat(core): compile variant rules and validate puzzles`.

## Task 4: Port bounded constraint support, catalogues, candidate refinement and conflicts

**Files:** Create core `constraints/{mod,types,support,cage_catalogue,computation,candidates,conflicts}.rs`, `tests/{constraint_support,constraint_evaluation}.rs`, and native fixture projections for these results.

**Interfaces:** Produces `PreparedComputation`, `prepare_computation`, `SupportResult`, `CandidateResult`, `ConflictResult`, structured violation codes, `evaluate_candidates(&Board, &PreparedRules, &mut WorkBudget) -> CandidateResult`, and `evaluate_conflicts(&Board, &PreparedRules, &mut WorkBudget) -> ConflictResult`. Prepared and raw support paths remain explicit; callers retain their current charging mode.

- [x] Add `catalogue_overflow_discards_partial_support`, `large_cages_use_bounded_fallback`, `last_work_unit_cannot_publish_incomplete_support`, `partial_conflicts_remain_marked_incomplete`, and `prepared_geometry_cannot_be_mutated_by_results`. Assert exact masks/charges/status at full and one-unit-short limits, zero/512/8,192 tuple capacity cases, and Arrow non-peer repetition.
- [x] Run `cargo test -p sudoku-core --test constraint_support --test constraint_evaluation`; verify unimplemented support fails the known-mask expectations.
- [x] Port enumeration, combination/permutation ordering, filtering, raw/prepared dispatch and refinement convergence. Preparation remains charged even on overflow/fallback; incomplete support is never cached or returned as complete.
- [x] Return semantic violation facts rather than Chinese strings; add explicit canonical projection that reconstructs the current text for differential tests. Preserve existing conflict ordering and partial-result semantics.
- [x] Run constraint tests and `pnpm test:migration -- --suite constraints --engine native`; compare complete outcomes and budget totals. Re-run all existing native tests.
- [x] Commit as `feat(core): port bounded arithmetic support and analysis`.

## Task 5: Port exact search and pure Sudoku editing

**Files:** Create core `search/{mod,types,exact,propagation}.rs`, `editing.rs`, and `tests/{exact,editing}.rs`. Extend native migration projections.

**Interfaces:** Produces prepared `count_solutions`, standalone `count_with_rules(&Board, &PuzzleRules, &mut WorkBudget, u64) -> CoreResult<SearchResult>`, `BoardLayers`, `BoardEdit`, `EditOutcome` and `edit_board`. Editing owns entry/note effects and completion facts, not IDs/history/assistance/time.

- [x] Add `counts_zero_one_two_and_preserves_first_solution`, `late_exhaustion_restores_every_branch`, `insertion_order_preserves_work_and_nodes`, `editing_cleans_only_duplicate_peer_notes`, and `exhausted_generate_notes_preserves_layers`. Assert all frozen search fields, no borrowed result state, unchanged givens, Arrow repetition and atomic unchanged notes on exhaustion.
- [x] Run `cargo test -p sudoku-core --test exact --test editing`; observe contract failures before completing search/edit implementations.
- [x] Port singleton/hidden-single/arithmetic propagation, ordered deduplicated unit/clue queues, duplicate-permitting cell stack, MRV tie order, ascending digits and branch restoration. Reuse studied prototype concepts but preserve actual charged preparation and standalone semantics from current production.
- [x] Implement board edits with current peer-note removal and completion behavior. Keep caller board/layers immutable and return owned changed layers; generic history recording remains TypeScript.
- [x] Run exact/editing tests and native migration `exact`/`editing` suites, including all 220 benchmark boards and 1,320 probes. Validate counts using existing independent JS references outside production Rust. Run the full native suite.
- [x] Commit as `feat(core): port exact counting and board editing`.

## Task 6: Port logical workspaces, basic deductions and variant deductions

**Files:** Create core `logic/{mod,types,techniques,workspace,evidence,pattern_facts,basic_techniques,variant_techniques,solver}.rs` and `tests/logic.rs`.

**Interfaces:** Produces all logical domain types from the common contract table; `create_workspace(&Board, &PreparedRules) -> LogicalWorkspace`, `apply_step(&mut LogicalWorkspace, &LogicalStep)`, and `find_step(&mut LogicalWorkspace, &[Technique], &mut WorkBudget) -> StepOutcome`. Workspaces may borrow immutable prepared support; returned evidence always owns data.

- [x] Write `basic_and_variant_steps_match_ordered_evidence`, `incomplete_support_is_never_memoized`, and `new_clue_masks_never_reuse_reduced_domains`. Assert full authored steps/premises, not just placements; mutate returned evidence in JS/native fixtures and retry; exercise finite step/work exhaustion and overlapping clues.
- [x] Run `cargo test -p sudoku-core --test logic`; confirm missing deduction behavior fails independently known placements/removals.
- [x] Port the technique catalogue, logical state/application, five basic detectors, variant support/memo contracts and ordered scheduler. Keep technique names, action kinds, priority and every work charge. Add no generic detector framework.
- [x] Extend native migration `logic` projection for the supported basic/variant techniques and owned evidence; advanced fixtures remain pending Task 7, explicitly selected by fixture technique IDs.
- [x] Run logical tests, native migration `logic-basic` and all existing native contracts. Preserve independent known-solution facts for every removal/placement.
- [x] Commit as `feat(core): port basic and variant logical deductions`.

## Task 7: Port advanced deductions, proof validation and hint orchestration

**Files:** Create core `logic/{advanced_techniques,advanced_evidence}.rs`, `hint.rs`, `logic/hint_validation.rs`, and `tests/{advanced_logic,hints}.rs`. Reference `src/core/sudoku/logic/{advancedTechniques,advancedEvidence}.ts`, `hint.ts` and `src/worker/hintEvidence.ts`.

**Interfaces:** Produces `validate_advanced_step(&LogicalWorkspace, &LogicalStep) -> bool`, `HintResult`, `analyze_hint(&Board, &Board, &PreparedRules, max_steps: u32, &mut WorkBudget) -> HintResult`, and `validate_hint_evidence(&HintResult, &PuzzleRules, Option<&Board>) -> CoreResult<HintResult>`.

- [x] Add tests `rejects_forged_fish_wing_and_coloring_premises`, `matches_full_elimination_to_placement_hint_chain`, `reviews_first_incorrect_entry`, and `hint_exhaustion_is_not_an_unsupported_claim`. Assert existing advanced witnesses and malicious unit/domain/clue changes are rejected without using the stored solution as proof.
- [x] Run `cargo test -p sudoku-core --test advanced_logic --test hints`; observe rejection/trace failures with the missing logic.
- [x] Port all current advanced techniques and their separate proof validators. Preserve basic/variant replay-and-clue-matching validation; do not turn it into a new proof algorithm as an incidental port change.
- [x] Port hint selection, first wrong entry, logical-step application and complete/unsupported/exhausted distinctions. Maintain owned trace/evidence and one shared caller budget.
- [x] Run `pnpm test:migration -- --suite logic --engine native` and `--suite hints --engine native`, advanced/hint tests, and the full native suite. Compare all step arrays and evidence fields.
- [x] Commit as `feat(core): port advanced proofs and hint computation`.

## Task 8: Port assessment, screening and persisted-summary semantics

**Files:** Create core `rating/{mod,types,policies,input,assessment,workload,decoding}.rs` and `tests/{assessment,assessment_decoding}.rs`; extend native migration adapters.

**Interfaces:** Produces assessment input/result/workload types and `prepare_assessment(&PuzzleRules, limits: AssessmentLimits) -> CoreResult<PreparedAssessment>`. Its methods are `assess(&self, &Board, &mut WorkBudget) -> AssessmentResult`, `screen(&self, &Board, &mut WorkBudget) -> TrialAssessmentResult`, and `screen_target(&self, &Board, Difficulty, &mut WorkBudget) -> TargetScreenResult`. Ordinary preparation defers charged support construction until evaluation; the generation path explicitly borrows an already charged `PreparedComputation`. `RatedTrial::complete` owns deferred trace replay. `decode_puzzle_assessment` preserves absent versus unavailable outcomes from current decoding.

- [x] Add `policy_prefix_reuse_preserves_full_trace_and_charges`, `changed_priorities_reset_workspace`, `trial_completion_does_not_repeat_policy_search`, and `summary_absence_is_not_corruption`. Assert full authored/frozen assessments at exact and one-short work/step limits, matching/below/stalled target outcomes, and every existing saved-summary unavailability reason.
- [x] Run `cargo test -p sudoku-core --test assessment --test assessment_decoding`; verify missing assessment/screen behavior fails.
- [x] Port policy order, validation, workspace-prefix continuation, trace statistics, screening and checked summary decoding. Give deferred completion an owned Rust result with no JS closure in the core. All prior deductions count toward the current policy's 500-step limit.
- [x] Integrate the prepared-computation borrowing path used by generation without charging preparation twice or sharing domains across boards.
- [x] Run native `assessment` and `validation` migration suites, the complete native tests, and compare complete outputs/traces/work on all selected authored fixtures and generated boards.
- [x] Commit as `feat(core): port grading and target screening`.

## Task 9: Port generation geometry, clue exploration and final generation scheduling

**Files:** Create core `generation/{mod,types,input,random,classic,terminal_construction,variant,variant_strategies,layouts,candidates,search,generate}.rs`, `generation/variants/{mod,diagonal,jigsaw,killer,thermo,arrow}.rs`, `tests/{generation_random,generation_candidates,generation}.rs`; canonical authored geometry presets live in `tests/fixtures/engine-contracts/geometry.json` and a focused core data module if production needs those presets.

**Interfaces:** Produces `generation::random::for_phase(&GenerationInput, RandomPhase, layout_index: u32, proposal_index: u32) -> SeededRandom`, `GivenMask`, `CandidateFrontier`, constructed/prepared layout types and `generate_puzzle(&GenerationInput, &GenerationLimits) -> CoreResult<GenerationResult>`. `CandidateFrontier` exposes `retain`, `next`, `record_evaluation` and read-only counters with the existing semantics.

- [x] Add `phase_stream_matches_v11_byte_vectors`, asserting exact material bytes, derived keys, first raw u32 words and f64 values from Task 1's independent fixtures for every variant/difficulty/phase and representative layout/proposal indices. Add `v10_generation_requests_are_rejected`, `candidate_failure_does_not_replace_future_geometry`, `checkpoint_capacity_is_shared_without_forgetting_seen_masks`, and `layout_limit_does_not_discard_existing_frontiers`; keep the original frontier invariant assertions with explicit new byte inputs.
- [x] Run the three generation integration tests and verify random/geometry/frontier/scheduling contracts fail before implementation.
- [x] Implement the spec's fixed-width binary/BLAKE3 phase derivation and current v11 input validation; there is no JSON seed recipe or old-version dispatch. Port terminal construction including the 6,561-visit per-attempt cap, variant geometry and legal transforms, retaining static exhaustive capabilities and draw-site ordering. No OS randomness enters this path.
- [x] Port the 81-bit mask/frontier implementation and scheduling, retaining all named bounds, separate solved/stalled shares, same-layout lineage, work-based turns and stage metrics. Compose the already verified screening/exact owners for final acceptance and rule necessity. Preserve zero-budget and abandoned-layout outcomes.
- [x] Run `pnpm test:migration -- --suite generation --engine native`, requiring all 2,241 complete v11 results and full assessment traces/work to match the independently created v11 reference. Run independent structure/uniqueness/rule-necessity/diversity validation and the complete native suite. Resolve differences at the first changed deterministic stage; never replace expected payloads with Rust output or require v10 seeded fingerprints to match.
- [x] Commit as `feat(core): port deterministic puzzle generation`.

## Task 10: Complete the typed WASM API and verify actual WASM parity

**Files:** Expand WASM `src/{lib,dto,conversion}.rs`, `tests/migration/wasm-adapter.mjs`, `tests/e2e/wasm-contract.spec.ts`, `tests/wasm-contract-types.test.ts` and package/build declarations.

**Interfaces:** Exports `engine_info`, `derive_seed(material: js_sys::Uint8Array) -> Vec<u8>`, standalone `count_solutions` and `analyze_logic`, `generate(seed: js_sys::Uint8Array, options: Ts<GenerationOptionsDto>)`, `assess`, `hint`, content-only `validate_puzzle`, `validate_assessment`, `validate_hint_evidence`, `transform_rules` and an owned `PreparedPuzzle` class with `metadata`, `candidates`, `conflicts`, `is_complete`, prepared `count_solutions` and `edit`. `GenerationOptionsDto` contains version/variant/difficulty/limits, not text seed. Generated puzzle output flattens `GeneratedPuzzle` to existing puzzle fields with canonical hex metadata. Exported functions use named DTOs and fallible conversion. Prepared instances expose generated `free()`; resources cannot be used in another WASM instance.

- [x] Write browser cases `preserves_all_32_seed_bytes_and_hex_output`, `rejects_text_wrong_seed_lengths_and_v10_requests`, `caller_seed_mutation_cannot_change_owned_request`, `omitted_null_and_numeric_array_contracts_match`, `malformed_conversion_fails_without_retaining_resources`, and `returned_arrays_do_not_alias_prepared_state`. Check zero/ascending/high-bit/non-UTF-8 seeds; 0/31/33-byte inputs; invalid rules; disposed/double-disposed wrapper handling; repeated invalid inputs and stable memory after warmup.
- [x] Run the browser contract test before exposing complete adapters; verify missing conversion/export behavior fails, including string input to byte-only generation.
- [x] Convert byte slices to validated owned `Seed`, call the core's derivation/generation and convert outputs to canonical current-generation metadata. Do not introduce `BoundarySeed`, `JsString` preservation or legacy hashing. Add strict TS consumer assertions for `Uint8Array` inputs and plain board/evidence arrays; handle conversion errors explicitly.
- [x] Derive DTO Serde/Tsify definitions using JS mode and fallible `Ts<T>` conversion. Convert DTO numbers, discriminators, arrays and optional fields explicitly; return plain arrays where current decoders require them. No expensive procedure uses JSON strings as its production transport. Internal trial/frontier state stays inside Rust.
- [x] Run actual WASM `rules`, `constraints`, `exact`, `editing`, `logic`, `hints`, `assessment`, `validation` and all 2,241 `generation` migration cases, generated TS consumer checks and malformed/memory cases in available browsers. Compile native core independently; run wasm32 Clippy with warnings denied.
- [x] Commit as `feat(wasm): expose typed portable sudoku operations`.

## Task 11: Add browser loading, readiness and resource-owned main-thread access

**Files:** Create `src/sudoku/{contracts,guards,seed,wasmModule,mainEngine}.ts`, `src/sudoku/{seed,wasmModule,mainEngine}.test.ts`, `src/shared/model/sudokuPresentation.ts`, and `src/shared/components/EngineLoadingState.vue`. Modify `src/{main,runtime}.ts`, `src/App.vue`, `vite.config.ts`, `package.json`, `.github/workflows/ci.yml` and module-boundary tests/configuration.

**Interfaces:** Produces type-only `contracts.ts`, `loadSudokuModule(): Promise<WebAssembly.Module>`, `createMainEngine(module: WebAssembly.Module): Promise<MainSudokuEngine>`, and an idempotent `MainSudokuEngine.dispose()`. `MainSudokuEngine` wraps prepared puzzle resources, synchronous validators and `deriveSeed(material: Uint8Array): Uint8Array`. Pure `seed.ts` owns `encodeSeed(seed: Uint8Array): string`, `decodeSeed(value: unknown): Uint8Array`, and content equality with strict lengths/hex; it contains no hash/PRNG. `GameRuntime` gains `engine`, readiness and `createSeed(): Uint8Array` using 32-byte `crypto.getRandomValues`, keeping `createId` independent; root App owns loading/retry and disposal.

- [x] Add `failed_or_mismatched_module_blocks_semantic_actions`, `retry_cannot_publish_a_disposed_generation`, `dispose_is_idempotent`, `seed_hex_codec_rejects_noncanonical_input`, and `shared_components_cannot_import_engine_runtime`. Assert stale init cannot install resources, errors do not touch storage, readiness precedes semantic actions, all 32-byte fixtures round-trip, and uppercase/whitespace/prefix/non-hex/wrong-length encodings fail.
- [x] Run `pnpm exec vitest run src/sudoku tests/module-boundaries.test.ts`; confirm missing loading/ownership behavior fails.
- [x] Load the module asynchronously once per runtime, validate bridge/algorithm metadata, instantiate independent owned memory and prepare narrow sync contracts. Expose a readable loading/failed/ready lifecycle; create the feature runtime only after a ready engine exists. Keep the root loading/retry component under existing Naive UI/theme providers; use Chinese copy `正在加载数独引擎…` and `数独引擎加载失败，请重试。` with `重试`.
- [x] Extend Vite/package scripts so dev/typecheck/unit/build/subpath and CI prepare the generated package. Package JS/WASM asset URLs must be managed by Vite. Initial Rust-source edits require restarting `pnpm dev`, documented explicitly; do not add a custom live compiler scheduler. Keep shared imports limited to type contracts and pure presentation; keep features/storage/worker dependent on narrow runtime services or explicit input data.
- [x] Run four type projects, module-boundary tests, unit tests, lint/format and root/subpath builds. Add real browser tests for unavailable asset, bridge mismatch, repeated retry and disposal; verify no ignored scratch or manually copied WASM is required.
- [x] Commit as `feat(web): load and own the sudoku wasm runtime`.

## Task 12: Switch production Worker computation to WASM

**Files:** Modify `src/worker/{sudoku.worker,client,protocol,environment.d}.ts`, `src/worker/{sudoku.worker,client,protocol}.test.ts`, `tests/e2e/workerHarness.ts`, and `tests/e2e/{worker,generation-loading,rating}.spec.ts`.

**Interfaces:** Preserve the public `SudokuWorkerClient.generate/assess/hint/dispose` operations and job kinds/outcomes, with `generate` input deliberately changing to an owned 32-byte `Uint8Array` seed and v11 identity. Add a separate `WorkerControl` init/ready/error protocol carrying the compiled module and bridge version. `createSudokuWorkerClient` receives the loaded module through runtime composition. `requestId`, engine outcomes and cancellation/timeout remain distinct; response seed equality decodes canonical hex and compares byte contents, never array identity or bytes-to-string coercion.

- [x] Add `request_waits_for_ready_without_losing_deadline`, `abort_during_wasm_initialization_settles_once`, `late_reply_cannot_revive_a_terminated_job`, `idle_worker_computes_no_puzzle`, and `worker_seed_identity_uses_owned_byte_contents`. Assert one settlement/termination, original 3,000/15,000 ms timers, failed-load recovery, unchanged current save, correct structured-clone identity and rejection of a response with one changed seed byte.
- [x] Run focused client/Worker/protocol tests; verify readiness/init races fail before replacing dispatch.
- [x] Initialize wasm-bindgen with shared compiled code in each isolated Worker, route generate/assess/hint to the typed exports, and post existing outcomes. Preserve an idle ready Worker and per-job termination; do not use queued cancellation messages as interruption of a running synchronous WASM function.
- [x] Replace mathematical hint validation with core validation through the main adapter while retaining cheap structural envelope guards and existing advanced-proof semantics. Preserve request/input identity checks on returned puzzles and assessments.
- [x] Run real emitted Worker tests at `/` and `/sudoku/` across Chromium desktop/touch, WebKit and a working Firefox runtime. Verify complete payload/assessment/evidence against frozen contracts and record unavailable runtimes explicitly. Re-run unit/type checks for changed owners.
- [x] Commit as `feat(worker): execute sudoku requests through wasm`.

## Task 13: Migrate live board, session and persistence semantic callers

**Files:** Modify `src/features/game/model/{session,daily,variants}.ts`, `src/features/game/composables/useGameEntry.ts`, `src/features/game/stores/{useGameStore,sessionTransitions}.ts`, `src/features/game/views/GameView.vue`, `src/storage/{records,repository,backup}.ts`, their colocated tests, and `tests/e2e/{game,variants,storage,backup,daily,ux}.spec.ts`.

**Interfaces:** `GameRuntime.engine` supplies scoped `PreparedPuzzle` adapters and semantic validators. Pure session helpers accept explicit `EditOutcome`/completion results rather than a global WASM singleton; `commitBoardEdit(session, outcome, action)` records the existing history/assistance facts. Storage receives `PuzzleSnapshotValidator` and `AssessmentSnapshotValidator` narrow synchronous contracts from runtime. Existing repository public transactions and record formats remain unchanged.

- [x] Add `same_actions_preserve_entries_notes_history_and_assistance`, `exhausted_notes_keeps_unsaved_layers`, `semantic_validation_awaits_ready_before_opening_transaction`, `corrupt_backup_or_peer_epoch_change_cannot_replace_current_save`, `historical_seed_metadata_restores_without_decoding_or_regeneration`, and `new_seed_retry_and_daily_identity_are_stable`. Assert complete/edit/history traces, storage fences, opaque historical strings including lone surrogates, strict v11 hex validation, same bytes on retry, fresh bytes for a new free puzzle, fixed-date daily reproducibility and existing formal attempt precedence.
- [x] Run game/session/storage/backup unit suites; confirm old direct engine imports or uninitialized validators fail the new boundary tests.
- [x] Route Sudoku edits/notes/conflicts/completion and stored-puzzle semantics through Rust. Keep undo/redo arrays, assistance counters, clock, save queue, leases and revisions in their present owners. Pass owned metadata for selected-cell related highlights; views stop compiling rules. Map structured violations to existing Chinese messages in the game presentation owner.
- [x] Complete module initialization before repository transactions; invoke synchronous semantic validation inside existing decoding workflows without `await` or a Worker round trip in a transaction. Keep pre-computation epoch captures and save-before-install ordering intact. Type-only DTO guards do not replace Sudoku validation.
- [x] Replace UUID-as-seed generation with `runtime.createSeed()`; capture/copy it for one request/retry. Derive daily bytes through `engine.deriveSeed` over exactly ASCII `daily:YYYY-MM-DD`, leaving Beijing date selection and formal IDs in the existing pure model. Supply derived bytes explicitly to pure daily request assembly; status lookup uses formal IDs without invoking seed derivation. Store new seed hex and v11 version; pass only mathematical content to Rust when validating saved puzzles. Retain historical seed/version strings without a generator adapter or rewriting backups.
- [x] Run affected unit/type tests and actual player/storage/backup/daily browser flows, including malformed old versions, format-1 normalization, format-2 restores, partial save failures and cross-tab import/reset races. Measure candidate/conflict/validation main-thread tails before considering this cutover complete.
- [x] Commit as `refactor(web): use rust board and persistence semantics`.

## Task 14: Migrate teaching and presentation consumers and retire production TS computation

**Files:** Modify `src/features/learning/model/{lessons,examples,exerciseStages,variantExamples}.ts`, learning composables/stores where they construct exercises, `src/features/game/model/techniquePresentation.ts`, `src/shared/model/boardGeometry.ts`, `src/shared/components/{SudokuBoard,NumberPad}.vue`, and `tests/e2e/{learning,expert,learning-navigation}.spec.ts`. Update generated contracts/guards and remove superseded production `src/core/sudoku/` implementations only after all runtime consumers are migrated.

**Interfaces:** Core validates lesson steps and transforms variant rules. Teaching data, stable exercise/lesson IDs, Chinese explanations, drawing and display-only mask formatting stay in TS. Shared components accept DTOs/owned metadata and never load WASM. Independent reference solvers remain test-only.

- [x] Add `all_32_lesson_identities_and_expected_deductions_are_preserved`, `lesson_rule_transforms_obey_variant_capabilities`, and `production_graph_contains_no_typescript_solver`. Assert old lesson completions/cursors restore, correct/incorrect answers retain behavior, and all static/dynamic production imports exclude test reference sources and old solver algorithms.
- [x] Run focused learning/presentation and module-boundary tests; observe failures from remaining direct calculation imports or missing Rust transformation/validation.
- [x] Construct/validate teaching examples through explicit engine results at their workflow owner. Preserve datasets and exercise readiness fences. Keep cell geometry formatting and technique explanations pure; move only display-only digit/mask helpers into `sudokuPresentation.ts`.
- [x] Remove every production TS rule compiler, candidate evaluator, proof validator, solver, rater and generator after replacing its consumers. Port meaningful current engine tests to core/WASM contract coverage before deleting their obsolete TS locations. Retain test-only baseline/reference data without adding a shipped fallback or hidden double engine.
- [x] Run all Rust tests, migration suites, four TS type projects, lint/format, module-boundary tests, root/subpath builds and learning/expert/player browser flows. Inspect emitted assets/import graphs to verify no reference engine ships.
- [x] Commit as `refactor(web): complete portable engine cutover`.

## Task 15: Validate release performance, portability and maintainability

**Files:** Create `benchmarks/sudoku-core/{run,browser}.mjs` and `docs/superpowers/verification/2026-10-16-rust-core-migration.{md,json}` (use the actual completion date if later). Update `.github/workflows/ci.yml`, `AGENTS.md`, `docs/{architecture,variant-extension}.md`, README and implementation checkboxes. Keep prior experimental reports unchanged as historical measurements.

**Interfaces:** `pnpm bench:core` records source/corpus/toolchain/artifact fingerprints, complete generation metrics, native/browser paired samples, initialization/memory and main-thread tails; correctness/deadline jobs are part of CI, controlled-machine timing is a release audit. Verification report distinguishes independently rerun checks from equality-based reuse of historical evidence.

- [x] Add harness tests `rejects_a_payload_mismatch_before_timing`, `does_not_time_setup_or_overlap_external_checks`, and `requires_real_emitted_wasm_at_both_roots`. Assert a deliberately wrong result fails nonzero and benchmark metadata records cold/ready conditions separately; no browser launch is labeled passed when unavailable.
- [x] Run harness tests, then implement the retained 171-board kernel comparison and 19-combination complete generation/Worker/interactive benchmarks using the TS reference with the same independently checked v11 byte-stream recipe. Include all 2,241 v11 deterministic outputs and exhausted/slow inputs; measure seed derivation/RNG cost and preserve historical v10 latency as a separately labeled product diagnostic. Measure sequentially after all builds and tests finish.
- [x] Run full native tests, core dependency inspection, native/wasm32 Clippy, rustfmt, every migration suite, all four TS type projects, whole lint/format, root/subpath builds and configured player tests. Require functioning Firefox verification elsewhere before claiming full supported-browser release coverage; do not count host launch failure as a pass.
- [x] Audit the spec gates: at least 2x aggregate prepared exact improvement; no aggregate full-generation regression; resolve reproducible p95 regressions greater than both 10% and 1 ms; measured generation requests below 3,000 ms; synchronous operation p95 below 16.67 ms and no representative operation above 50 ms. Record binary size, initialization, retained/peak memory and repeated disposal. Do not relax work/step/layout limits. If an interactive gate fails, stop release and propose an explicit fenced asynchronous redesign rather than silently changing behavior.
- [x] Complete one fresh independent whole-change review covering core algorithms, byte-seed framing/vector parity, same-input work equivalence, actual WASM loading, persistence and readable ownership/comments. Resolve important findings and repeat only affected verification. Update architecture, contributor commands, Rust guidance, actual extension checklist, v11 identity/hex rules and CI artifact generation; remove temporary scaffolding only after durable fixtures and independent tests replace it.
- [x] Commit the validated documentation/tooling cleanup as `test: verify portable sudoku engine release`; integrate/push/create a PR only as authorized by the user. Report achieved results and remaining unavailable validation precisely.

## Plan self-review

- Every design section maps to a task: native ownership/types (2–9), complete binding/schema (10), loading/lifetime/assets (11), Worker interruption (12), synchronous/storage/session callers (13), teaching/presentation and old-engine removal (14), performance/review/docs/CI (15).
- The original reference source hash stays pinned (1); the isolated test-only v11 seed/version patch has its own manifest and uses maintained independent JS primitives. No later task may regenerate expected outputs from Rust. Original v10 historical evidence is distinct from new v11 generation fixtures.
- Seeds use `[u8; 32]`, explicit binary/BLAKE3 phase framing and ChaCha8. WASM requests carry bytes; new stored metadata uses strict lowercase hex. Tasks 2/9/10 cover primitive/phase/browser parity; Task 13 covers retries, daily IDs and opaque historical restore without a legacy generator.
- Interfaces use one `PreparedRules`/`PreparedComputation` ownership model, one shared budget, and consistent `SearchResult`/`EditOutcome`/assessment/generation types. Expected exhaustion never becomes a transport exception or a success-shaped default.
- Each Review Focus item has a named owning test. Corpus, types, runtime/persistence and benchmark checks have concrete commands and required outcomes.
- The user approved plan submission followed by continued execution. Execute directly in the current session; this document records design decisions and tracks implementation separately from verification evidence.
