# Rust Responsibility and Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved Rust architecture/readability review, including adapter presentation ownership, while preserving mathematical and persisted contracts.

**Architecture:** Retain three crates and their existing computation/adapter direction. Extract coherent private workflows and express correlated state through types. Keep independent proof verification separate from detection and move newly computed violation presentation to clients.

**Tech Stack:** Rust 1.98 / edition 2024, wasm-bindgen 0.2.129, Tsify 0.5.8, UniFFI 0.31.2, Vue/TypeScript and Kotlin.

**Spec:** [Rust Responsibility and Readability](../specs/2026-10-18-rust-responsibility-and-readability-design.md).

## Global Constraints

- Work in the authorized current checkout; do not commit, reset or overwrite unrelated work.
- Preserve `sudoku-v11`, `sudoku-variants-v11`, `sudoku-rating-v2`, 32-byte seeds, random draw order, stable tie ordering, full evidence and trace order, work charges including abandoned work, exact-search restoration and rating-prefix reuse.
- Generation defaults remain 40 layouts, 4,000,000 work units and 500 logical steps; the regional terminal cap remains 6,561 visits.
- Core remains synchronous, safe and independent of serialization, bindings, clocks, entropy and async runtimes.
- Existing stored assessment strings and backup formats remain readable and unchanged. Explicitly version changed transient bridge contracts.
- Repository prose, identifiers, comments and tests use English; player presentation uses Chinese.
- Use existing behavioral tests for refactors. Add meaningful regressions for new contracts; never regenerate expected outputs from Rust.
- Rebuild generated bindings; never hand-edit them. Do not introduce a generic plugin, callback context or new solver architecture.

## Review Focus

1. Failed/abandoned generation preparation still consumes slots and work; refactors must preserve exact corpus outputs.
2. Pending frontier parents remain alive after pool eviction; grouped state must preserve sweep inheritance and random continuation.
3. Malformed public steps and authored candidates must fail before mutation; internal detector results must preserve their existing work costs.
4. Hint shape normalization and teaching proofs remain distinct from ordered live replay and independent advanced proof checks.
5. Old stored issue strings and rating versions survive structured transient issue transport; invalid live DTOs remain runtime-validated.

## Task 1: Generation and rating workflows

**Files:** `sudoku/core/src/generation/{search,candidates,types,terminal_construction}.rs`, relevant `generation/variants/*.rs`, `rating/decoding.rs`, existing generation/rating tests.

**Interfaces:** Keep public generation/rating contracts. Add private `PendingProposal`, prepared edit-order state, explicit screening/acceptance outcomes and focused layout/proposal operations.

- [x] Run existing native generation/frontier/rating tests as the starting contract.
- [x] Group correlated frontier options and make proposal preparation explicit; preserve shared entry lifetime.
- [x] Extract layout preparation and proposal execution from scheduling; distinguish failure from successful acceptance.
- [x] Name fixed exploration/geometry limits and document their v11 ordering meaning; review logical paragraphs throughout touched workflows.
- [x] Separate summary count/action/technique checks while preserving failure precedence.
- [x] Run focused native tests and sealed native generation/budget/assessment suites; self-review the diff and record exact evidence. Do not commit.

## Task 2: Hint, logic and public workspace contracts

**Files:** `sudoku/core/src/hint.rs` or `hint/`, `logic/{hint_validation,types,workspace,advanced_techniques}.rs`, focused new logic proof modules, `search/propagation.rs`, `rules/types.rs`, callers/tests/examples.

**Interfaces:** Hint types retain accessible native paths. Hint-chain coordination calls logic-owned single-step validation. Expose `LogicalWorkspace::board()` and `candidates()` read-only access, a checked authored-state constructor, and fallible public `apply_step`; internal validated application remains crate-private.

- [x] Pin malformed public actions and authored candidate states with independent boundary tests before implementing their checks.
- [x] Separate hint-chain orchestration from step shape, clue binding, teaching and proof validation. Preserve normalization and independent advanced proofs.
- [x] Replace public mutable workspace fields with read access and an explicit candidate-state constructor; update all callers without private test backdoors.
- [x] Separate naked/hidden triple selection and Simple Coloring stages without changing visitation or charges.
- [x] Clarify propagation stages while retaining queue priority and restoration; document instance identity in `same_layout` and public ownership semantics.
- [x] Run native hint/teaching/logic/search/cancellation tests and corresponding sealed migration suites. Record evidence and self-review; do not commit.

## Task 3: Adapter conversion ownership

**Files:** `sudoku/wasm/src/{conversion,prepared,lib,dto}*`, `android/ffi/src/{conversion,prepared,lib,control,dto}*`, focused boundary tests.

**Interfaces:** Preserve existing DTO contracts in this task. Extract typed edit input conversion and Android assessment metadata conversion. Task 4 subsequently changes live assessment issue DTOs.

- [x] Extract metadata/edit conversion from public entry points; preserve malformed-mask-versus-length error precedence.
- [x] Derive technique key count/capacity from `ALL_TECHNIQUES`; keep unknown/missing/duplicate checks.
- [x] Fix cancellation, incomplete-result, identity and copied JS-only documentation; review public visibility and unused adapter DTOs without removing a public API blindly.
- [x] Add uncovered mask/length and metadata precedence boundary tests; run native adapter tests, WASM build and browser boundary tests.
- [x] Record diff/evidence for review; do not commit.

## Task 4: Structured assessment issues and client presentation

**Files:** Both Rust adapters' rating DTO/conversion/export modules; Web `sudoku` contracts/validation and game presentation models; Android domain/engine and game presentation; bridge identities; migration adapters and boundary/presentation tests.

**Interfaces:** New live issues distinguish plain diagnostic messages from `RuleViolation` facts. Stored `PuzzleAssessment::Unavailable.issues` retains strings. Clients own formatting; adapters contain no Chinese violation formatting. Version the changed live bridge explicitly.

Keep the historical string-outcome parser available and add a separate live parser/output contract. Use WASM bridge 3 and native bridge 2. Android live assessment results should distinguish rated/ungraded/invalid outcomes from persisted `PuzzleAssessment`; the game presentation owns any conversion to stored strings. Do not add a new player workflow merely to consume this API.

- [x] Add independent tests for structured duplicate/cage/thermo/arrow issues, exact client rendering, historical stored strings, and unsupported rating-version precedence.
- [x] Introduce explicit live issue DTOs with exhaustive checked conversions and runtime validation. Keep historical metadata decoding separate.
- [x] Move Chinese rendering into client presentation owners and adapt consumers without introducing lower-layer imports of feature presentation.
- [x] Preserve sealed expected files; compare structured facts independently and use explicit test-only presentation projection for historical string-shaped comparison where needed.
- [x] Regenerate WASM/UniFFI bindings; run focused Web/Android contract and presentation tests, then application checks.

## Task 5: Repository conventions, integration and verification

**Files:** `AGENTS.md`, `docs/architecture.md`, `docs/variant-extension.md`, core/adapter README files, this plan and an English verification report.

- [x] Document Rust logical grouping, correlated state, typed outcomes, visibility, public contracts and version-sensitive comments with official references.
- [x] Update architecture/extension steps for final hint ownership, checked workspace APIs and issue presentation.
- [x] Run workspace native tests, rustfmt, native/all-targets and wasm32 Clippy and inspect normal core dependencies.
- [x] Run all sealed native and available-browser contracts, Web type/lint/format/unit/build/E2E checks, and Android `qualityCheck :app:assembleDebug` plus relevant runtime/interoperability checks.
- [x] Review the complete uncommitted diff independently, resolve actionable findings, record exact results and remaining environment limitations, and mark plan tasks complete only with evidence.

All five tasks are complete. The [verification report](../verification/2026-10-18-rust-responsibility-and-readability.md) records the final checks, the resolved E2E harness finding, the serial Android gate and unavailable Firefox coverage.

## Execution decisions

- The user's request authorizes implementation of the entire preceding proposal. Additional design/plan confirmation is unnecessary; this document preserves that scope.
- The checkout is clean at `4cf692c`. Work remains in place, uncommitted, so the user can inspect all changes directly.
- Native baseline from the preceding review: 85 tests, rustfmt, both Clippy targets and normal dependency inspection passed at the unchanged source revision.
