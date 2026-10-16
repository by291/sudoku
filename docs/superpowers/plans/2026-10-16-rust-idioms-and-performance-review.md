# Rust Idioms and Performance Review and Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. The user approved implementation on 2026-10-16 with “嗯，都修一下吧”. Do not commit without explicit user authorization.

**Goal:** Make the existing Sudoku implementation more idiomatic Rust and reduce allocation, repeated computation and unnecessary boundary conversion while preserving its mathematical and deterministic contracts.

**Architecture:** Retain the synchronous portable core, separate WASM adapter, explicit variant enums and current subsystem owners. Optimize bounded working data and ownership inside those boundaries. Keep algorithm changes that alter charged work or deterministic choices outside this refactor.

**Tech Stack:** Rust 1.98.0, edition 2024; wasm-bindgen 0.2.129; serde-wasm-bindgen 0.6.5; Tsify 0.5.8; the existing Vue/TypeScript Worker integration.

**Spec:** [Portable engine design](../specs/2026-10-16-rust-core-and-wasm-design.md), [core organization](../specs/2026-10-15-sudoku-core-organization-design.md), [feedback generation](../specs/2026-10-15-feedback-guided-generation-design.md), [async live analysis](../specs/2026-10-16-async-live-analysis-design.md), and [Web Architecture](../../architecture.md).

**Status:** Implementation completed on 2026-10-17. The original review findings and baseline evidence below are retained; final verification, measured costs/benefits and runtime gaps are in the [implementation report](../verification/2026-10-16-rust-idioms-and-performance.md). Optional full fixed topology and stable frontier IDs were evaluated and deferred; current ownership remains intentional. The user authorized a local implementation commit on 2026-10-17.

## Global constraints

- Keep core independent of bindings, serialization, browser APIs, storage, clocks, OS entropy and async runtimes; retain `#![forbid(unsafe_code)]`.
- Retain `sudoku-v11`, `sudoku-variants-v11` and `sudoku-rating-v2` only if all associated outputs, draw ordering and resource semantics remain unchanged.
- Preserve 32-byte seeds, exact phase framing, ChaCha8 word consumption and descending Fisher–Yates draw order.
- Preserve generation defaults of 40 layouts, 4,000,000 shared work units and 500 logical steps, plus the 6,561-visit regional terminal attempt cap.
- Preserve complete small-cage catalogues, at most four cells, 512 tuples per constraint and 8,192 tuples per layout, including charged overflow fallback.
- Preserve first-solution order, technique priorities, evidence and removal order, complete traces, stage accounting and exhaustion precedence.
- Preserve immutable preparation, fresh mutable state per board, owned results and the independent advanced-proof validator.
- Preserve storage facts/formats, plain-array DTO shapes, omitted/null distinctions, Worker envelopes, deadlines and async revision fencing.
- Rebuild generated WASM before checking frontend consumers; never hand-edit bindings or regenerate expected fixtures from Rust.
- The prior benchmark harness was intentionally removed. Use a temporary reproducible measurement setup; do not restore a permanent benchmark subsystem as an incidental change.

## Review focus

1. A queue interrupted by contradiction or exhaustion must not contaminate another search node or board.
2. Arrow permits a circle plus nine shaft cells; fixed constraint scratch must support ten cells and permitted repeated digits.
3. A frontier entry evicted from the ranked pool may still be a pending parent or continued sweep; ownership changes must preserve that lifetime.
4. Changing policy must preserve prefix-only continuation, reset behavior, trace ownership and the inclusive logical-step limit.
5. Invalid standalone inputs and directly contradictory givens must retain validation precedence and their existing free rejection path, including at zero budget.

## Scope and evidence

Reviewed baseline: `f53e6585e3e193ede08f5c7e62037161971c5c9d`. Production Rust under `sudoku/core/src` and `sudoku/wasm/src` totals 11,349 lines. Review covers values, rules, constraints, exact search, editing, logical deductions, independent evidence validation, hints, rating, generation and the WASM boundary, with relevant tests and frontend callers. The pre-existing modification to `src/router/index.ts` is unrelated and was left untouched.

Fresh verification performed during this review:

| Check                                                                                 | Result                                                                      |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `cargo test --workspace --locked`                                                     | Passed, 66 tests                                                            |
| `cargo fmt --all --check`                                                             | Passed                                                                      |
| `cargo clippy --workspace --all-targets --locked -- -D warnings`                      | Passed                                                                      |
| `cargo clippy -p sudoku-wasm --target wasm32-unknown-unknown --locked -- -D warnings` | Passed                                                                      |
| `cargo tree -p sudoku-core -e normal`                                                 | Only portable hashing/RNG dependencies; no binding/browser/async dependency |
| `node tests/migration/run.mjs --suite all --engine native`                            | Passed, 5,742 complete comparisons, including 2,241 generated results       |

No new mathematical correctness defect was established. Native public-input handling in the reviewed paths did not demonstrate a reachable invalid-index panic. This does not certify every possible input. Existing computed-value assertions and documented step-application preconditions are not defects merely because they can panic when their invariants are violated.

Browser contracts, application E2E and performance were not rerun for this proposal. The [migration audit](../verification/2026-10-16-rust-core-migration.md) contains historical performance and browser evidence; its numbers are not measurements of any proposed optimization. In particular, its recorded Firefox limitation is historical, not a new determination about the current runtime.

## Assessment and approach selection

The architectural migration was sound. The strongest remaining TypeScript influence is dynamic, short-lived collection construction and ownership copied from object-reference workflows. Naming, explicit enums, ordinary loops, checked values and the subsystem split already fit Rust well.

| Approach                                        | Benefit                                                                                         | Cost and decision                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Targeted ownership and data-layout refactor     | Reduces repeated allocation/conversion while preserving the independent oracle and v11 identity | Recommended; implement and measure in small independently reviewable stages                                           |
| Broad native representation rewrite in one pass | Could compact topology, evidence and frontier state simultaneously                              | Larger native API and borrowing churn; harder attribution and rollback; defer until profiling warrants each part      |
| New solver/generator algorithms                 | Potentially larger search improvement                                                           | Can change work, incomplete outcomes, draw order and generated puzzles; needs a separate design and identity decision |

Priority labels below describe optimization order, not security or correctness severity. No specific speedup percentage is promised.

## Findings and proposed changes

### R1 — High: dynamic collections in logical detection

**Evidence:** `logic/pattern_facts.rs:7-23` returns newly collected digit and position vectors. `logic/basic_techniques.rs:26-37` expands a candidate mask merely to recognize a single. `logic/advanced_techniques.rs:76-79` expands digits to test membership. `logic/solver.rs:19-26` constructs the technique order for every deduction. Advanced combinations allocate a result vector for every pair/triple at `logic/advanced_techniques.rs:15-35`.

**Change:** Enrich `CandidateMask` with `contains(Digit)`, `count()`, `single()` and ascending `digits()` operations. `single()` returns `None` for both empty and multi-digit masks; zero must never become digit 17 through `trailing_zeros`. Use borrowed/filtered policy iteration and fixed-size pair/triple indices. A compact position buffer or nine-bit unit-position mask can serve local tests; collect owned evidence only when returning a deduction.

Retain unit/cell/digit traversal order, including the first unit witnessing a single. A position mask is not permission to reorder Jigsaw cells or a path. Replace former `BTreeSet` operations with ascending output only where the old result was explicitly sorted. Basic proof validation can share scalar mask operations, but advanced proof validation must remain independent of the detector.

**Expected benefit:** Fewer small allocations in repeated grading/hint/generation logic; magnitude unmeasured. Fixed-size buffers should be local and purpose-specific, not a general collection framework.

### R2 — High: evidence is constructed before a deduction exists

**Evidence:** `logic/advanced_techniques.rs:39-65` creates an owned 81-domain snapshot. Triple/fish/wing/coloring detection constructs it before `elimination` discovers whether there are any removals, for example `:149-175` and `:228-247`. `logic/variant_techniques.rs:148-151` constructs clue evidence even before checking whether an equation has exactly one unknown; combination visits also construct evidence before testing their action.

**Change:** Compute a small internal action/pattern first. If it has no placement/removal, return without building evidence. Once a step is selected, materialize its complete owned evidence exactly once. Prefer named pattern/action structures to a callback-heavy abstraction. Keep the same successful evidence content, sort order, premises and full 81-domain snapshot.

**Expected benefit:** Removes discarded proof allocations, especially on unsuccessful advanced-pattern probes. Do not reduce or compress the public proof as part of this change.

### R3 — High: arithmetic support uses allocation-heavy local state

**Evidence:** `constraints/support.rs:12-19,98-118` builds `Vec<Vec<u8>>`, assignments and support vectors per query. `:25-33` checks all assigned pairs with peer-list membership on each candidate. `:44-58` repeatedly recomputes prefix sums and suffix bounds. The catalogue-query path also allocates effective domains at `:235-244`. A complete result copies cells again at `:127-133`.

**Change:** Use nine-bit domains, bounded assignment/support scratch, a depth cursor, incremental partial sums and query-local suffix minima/maxima. Only compare the newly proposed digit with the already accepted prefix; the previous pairs are known valid. Use compact local peer membership without changing its mathematical relation. Internal consumers already own the constraint geometry, so they can consume masks paired with that geometry rather than allocating another cells vector. Keep the exported `SupportSnapshot` as an owned boundary result.

The maximum local arity is **ten**, from Arrow's circle plus up to nine shaft cells (`rules/definitions/arrow.rs`). Distinctness is constraint-specific: do not impose cage all-different semantics on non-peer Arrow positions.

**Compatibility limit:** Preserve DFS variable order, ascending digits, each charged candidate visit, and the precise complete/exhausted result. Do not introduce stronger pruning, full-support early termination, empty-domain shortcuts or a new catalogue/enumerator selection rule in this stage. New layout preparation cannot be made free; derive local membership within existing charged preparation or retain query-local work under the current query semantics.

### R4 — High/medium: repeated search queue allocation

**Evidence:** Every `visit` calls `propagate`; `search/propagation.rs:115-122` constructs new cells/unit/constraint queues, and `OrderedQueue::new` allocates membership storage at `:16-20`.

**Change:** Give each exact-count probe reusable propagation scratch. Clear its pending entries and membership flags before re-entry after every outcome. Propagation finishes before recursion begins, so a single probe-owned buffer set can be reused across nodes; it need not be allocated per depth. Start with capacity reuse in standard `Vec`/`VecDeque`, not a new queue library or a fixed ring with an assumed bound on duplicate cell visits.

Retain the existing cell LIFO queue with duplicate visits, FIFO deduplicated unit/clue queues, immediate membership removal on pop, and append-on-reinsert behavior. Retain `TrailGuard` and immutable returned solutions. Reusing allocations across separate board probes is a later option; first establish correctness with a fresh probe owner.

### R5 — Medium: repeated policy construction and deep trace copying

**Evidence:** `rating/assessment.rs:130-134` reconstructs supported policy vectors on every candidate evaluation. `rating/policies.rs:39-65` allocates fixed catalogue data; actual execution order is separately reconstructed. `logic/solver.rs:71` deep-clones previous steps when rating resumes another policy.

**Change:** Compile immutable allowed/execution policy sequences once, using static slices for the fixed variant/tier catalogue or the existing assessor's immutable preparation. Retain public `policy(...) -> Vec<Technique>` and `hint_techniques(...) -> Vec<Technique>` wrappers for native source compatibility; hot internal callers use borrowed policy sequences. Keep one owned trace through internal policy continuation. Add an internal ownership-taking continuation, for example `analyze_workspace_owned(..., previous_steps: Vec<LogicalStep>) -> LogicResult`; retain the existing public borrowed API and its owned-snapshot contract.

Keep Classic catalogue priority, variant caller priority, prefix-only continuation and resetting both workspace and trace for non-prefix policies. Previous steps still count toward the step limit. A successful trial still uses the original successful trace and `RatedTrial::complete`, with no second solve or additional work charge. Do not replace final acceptance checks with an inference from screening.

### R6 — High for the assessment boundary: trace serialization is discarded

**Evidence:** `src/sudoku/workerEngine.ts:59-66` calls the full `assess` binding, then discards its trace. `wasm/src/conversion/rating.rs:70-78` converts all steps and nested evidence before JS receives that result.

**Change:** Add a named `assess_summary` WASM operation returning `Ts<AssessmentSummaryWorkDto>`, with a concrete transparent `AssessmentSummaryWorkDto(WorkResultDto<AssessmentOutcomeDto>)` wrapper assembled through the existing `work_response!` macro. Reuse the existing summary-only `AssessmentOutcomeDto`; Tsify 0.5.8 erases generic ABI arguments, so do not export a bare generic work response. Factor common input decoding, assessment execution and failure mapping so the two exports cannot drift. Compute the same internal trace needed for grading/workload, then avoid converting/serializing it for the summary-only caller. Keep full `assess` for full-trace contracts and consumers. Switch only the production Worker caller.

The Worker envelope and saved/player outcome can remain identical. Update bridge identity/export validation and generated declarations deliberately; this is an additive binding contract, not a rating-version change. Equal summary, failure outcome and total work between both exports is required.

### R7 — Medium: dynamic ownership in a tiny generation frontier

**Evidence:** `generation/candidates.rs:144-157` uses `Rc<RefCell<FrontierEntry>>` shared by the pool, pending parent and continuing sweep. `:386-425` allocates and sorts solved/stalled lists; `:436-486` allocates eligible/ranked/tied lists per selection. This reference identity is deliberate and already documented; the code is not incorrect because it uses `Rc<RefCell>`.

**Change in two steps:** First retain current ownership and remove temporary ranking allocations with bounded entry-reference/index scratch and stable ordered scans. Retain/ranking scratch must hold `MAX_CHECKPOINTS + 1`, or nine entries, because insertion precedes truncation. If retained allocations/runtime borrows remain material, use one frontier owner with stable `EntryId`s and explicit liveness. Do not use shifting vector indices as identities or retain every historical entry in an unbounded arena. At most eight entries are in the retained pool, but pending/sweep references and insertion temporaries must be included in the storage bound.

Preserve reservations for solved/stalled checkpoints, novelty after eviction, inherited sweep cursors, stable ties, and the random draw skipped for continued sweeps. Keep `BTreeSet<GivenMask>`: it is not automatically the bottleneck and avoids introducing a hasher/entropy policy into this refactor.

### R8 — Medium: duplicated topology preparation and temporary copies

**Evidence:** `search/exact.rs:58-63` compiles a full uncharged topology to reject direct contradictions, then prepares it again on valid input. `rules/context.rs:38-58` uses 81 tree sets for relationships; `:68-85` clones unit/constraint cell lists into temporary groups. `generation/variant.rs` calls standalone Classic counting during necessity validation, so the standalone path is not test-only.

**Change:** Preserve validation and the free direct-contradiction path using a lightweight scan of validated rule groups, then construct the full topology only in the existing preparation phase. Classic can reuse its current free immutable singleton. Do not charge first and refund or reuse uncharged preparation with synthetic charges. Completed invalid arithmetic boards must preserve their existing rejection path too.

Use borrowed cell slices for group traversal. Accumulate finite peer sets in an 81-cell bitset while retaining every existing charged nested-loop visit, including self visits; emit ascending peers exactly as the tree set did. Benchmark `u128` against paired machine words on WASM rather than assuming native code generation transfers. Preserve original ordered cell lists for units, paths and evidence.

Only after measuring preparation should internal full units move to `[CellIndex; 9]`, fixed cell-indexed outer arrays or flat adjacency storage. Public metadata can retain its current owned dynamic snapshot. Do not introduce free global caches for previously charged variants.

### R9 — Low/medium: avoid intermediate WASM conversion copies

**Evidence:** `wasm/src/conversion/values.rs:80-81` takes `Vec<usize>`, forcing borrowed evidence converters to clone a vector before allocating the final DTO vector. `wasm/src/conversion/rules.rs:149` deep-clones metadata through `PreparedRules::metadata`, then converts it. Notes also pass through a temporary vector before becoming an 81-mask array in `wasm/src/prepared.rs:234-242`.

**Change:** Accept slices or simple integer iterators for borrowed conversion. Consume owned results where no caller needs them afterward. Add narrow read-only prepared metadata accessors so the adapter constructs the final owned DTO directly, while retaining `metadata()` for callers requiring an independent snapshot. Validate fixed-size notes directly into the final array.

Retain fallible integer conversion, runtime checks, ordinary owned JS arrays and independent output snapshots. Normal 81-cell copies are inexpensive and provide a clear ownership contract; raw-memory views or a handwritten ABI are unjustified here. Metadata conversion is usually a preparation cost, not an exact-search hot path.

### R10 — Lower priority: bounded terminal scratch and build configuration

**Evidence:** `generation/terminal_construction.rs:89-115` allocates assignments and regional positions bounded by nine. `generation/variants/arrow.rs` clones partial path prefixes. The workspace uses default release settings; `scripts/build-sudoku-wasm.mjs` requests `--release` without a project-specific profile.

**Change:** Replace terminal scratch with local arrays plus lengths, shuffling only active slices. Consider push/pop path construction if profiling shows it matters. Retain strict-less MRV replacement, early regional scan termination, exact shuffle draws and visit accounting.

After source changes are measured, separately compare default release with thin LTO and one codegen unit, plus size-oriented optimization only as an explicit throughput/size experiment. Record build time, binary/compressed size, initialization and warmed latency. Do not assume smaller WASM means faster generation or set `panic = "abort"` as a cosmetic performance change.

## Rust API direction and changes to avoid

The desired ownership shape is immutable prepared layout, mutable probe/workspace scratch, and owned returned evidence/results. Use typed `CellIndex`, `Digit` and constraint identities at meaningful validated boundaries; do not spread fallible conversions through already validated inner loops merely to use a wrapper everywhere.

Keep `Board([u8; 81])`, nine-bit `CandidateMask`, explicit enums, `Bounded`, RAII budget/trail restoration, portable seeded RNG and first-party serialization tools. `PreparedRules`, `PreparedConstraintSupport` and `PreparedComputation` clones share immutable `Arc` data; they are not deep geometry copies. Do not replace them with `Rc` just to remove atomic reference counts and weaken native sharing. Keep `Box` where it makes result enums compact unless measurements justify a coherent alternative; allocation removal is not an absolute rule.

No generic plugin system, per-subsystem crates, async core, parallel solving, SIMD/unsafe implementation, universal collection wrapper or mechanical conversion of loops into iterator chains is proposed. Do not replace the current solver with DLX or stronger pruning under the existing identity.

One separate architectural issue exists: `wasm/src/conversion/rating.rs:13-39` formats Chinese violations and duplicates frontend presentation. Fully moving that ownership requires a structured issue DTO and explicit bridge compatibility decision. Keep existing strings for the main performance refactor; resolve this separately without reinterpreting historical stored strings.

## Implementation sequence

### Task 1: Freeze a current performance baseline

**Files:** Use existing `tests/fixtures/engine-contracts`, native `fixture_runner` contracts and a disposable measurement checkout; create a focused report under `docs/superpowers/verification/`.

**Interfaces:** Existing public Rust/WASM operations and sealed fixture inputs; no production interface changes.

- [x] Record source/fixture/toolchain/artifact fingerprints and the exact temporary harness source or retained Git commit plus adaptation patch. Reuse the archived measurement source at `c3dfbcb` if useful; do not recreate its permanent repository integration.
- [x] Run correctness outside timed regions; reject wrong payloads before trusting timing. Record core preparation, support, exact, logic, rating, generation and boundary conversion separately.
- [x] Establish sequential paired native/browser measurements and allocation/resource diagnostics, stopping this audit's competing build/test work. Keep cold and warm conditions distinct. The final report records host-sharing noise instead of claiming host-wide idleness.

**Exit:** A reproducible current baseline and a ranked profile, not only the old Rust-versus-TS audit. Subsequent optimization measurements compare Rust before/after.

### Task 2: Remove logical temporary allocations and discarded evidence

**Files:** `sudoku/core/src/types.rs`, `sudoku/core/src/logic/{pattern_facts,basic_techniques,advanced_techniques,variant_techniques,solver}.rs`; relevant tests in `sudoku/core/tests/{values,logic,advanced_logic,hints}.rs`.

**Interfaces:** Checked mask operations and internal bounded pattern/action data. Existing public `LogicalStep`, evidence and hint contracts remain.

- [x] Add mask edge cases and ordering coverage only where existing contracts do not cover the new API; use existing complete logic/advanced/hint fixtures as the primary refactor oracle.
- [x] Replace membership/count/single queries, pair/triple scratch and per-step order collection; materialize evidence after discovering a real action.
- [x] Run Rust checks and native migration suites `logic`, `advanced`, `hints`, `hint-chains`, `assessment-screening` and `generation`; compare allocation and wall time.

**Exit:** Identical steps/evidence/work, with fewer transient allocations in the measured workloads.

### Task 3: Optimize support scratch and exact propagation

**Files:** `sudoku/core/src/constraints/{support,cage_catalogue,types}.rs`, `sudoku/core/src/search/propagation.rs`, relevant `sudoku/core/tests/{constraint_support,logic,exact}.rs`.

**Interfaces:** Internal bounded support masks paired with existing constraint geometry; probe-owned resettable propagation buffers. Existing public support/search results remain owned.

- [x] Pin ten-cell Arrow, allowed repeat, fixed digit, empty-domain and exact lower-budget cases; preserve existing catalogue fallback tests.
- [x] Change support representation/incremental uncharged computations without changing the DFS visit tree or charge sites.
- [x] Reuse propagation buffers; test pending cells/units/constraints after a contradiction before the next sibling node. Separately test exhaustion followed by a fresh count probe: exhaustion terminates the current count and must never resume its siblings. Preserve existing trail restoration and board isolation tests.
- [x] Run `support`, `constraints`, `exact`, `exact-prepared`, `assessment-screening`, `generation-boundaries` and full `generation` comparisons, then benchmark wide cages and near-exhaustion inputs.

**Exit:** Exact supports, first solutions, node counts and work boundaries match; no partial support is memoized and no queue state leaks.

### Task 4: Make rating continuation own its trace and fixed policies

**Files:** `sudoku/core/src/rating/{assessment,policies,types}.rs`, `sudoku/core/src/logic/solver.rs`, `sudoku/core/tests/assessment.rs`, existing changed-priority unit test.

**Interfaces:** Immutable policy slices/prepared policy order; internal `analyze_workspace_owned` continuation. Preserve the public snapshot wrapper as needed.

- [x] Keep prefix/non-prefix, exact step-limit and original successful-trace tests as gates; add returned-trace independence coverage if not already exercised.
- [x] Move the internal trace across policy trials and reuse fixed policies through internal borrowed helpers; retain public owned policy wrappers and explicit fresh-workspace reset semantics.
- [x] Run `assessment`, `assessment-screening`, `assessment-generated`, `hints` and `generation` comparisons. Measure rating and full generation, not just policy lookup.

**Exit:** Full trace/work equality and a simpler ownership path without repeated deep trace copies.

### Task 5: Reduce WASM output work for production assessment

**Files:** `sudoku/wasm/src/{lib,prepared}.rs`, `sudoku/wasm/src/conversion/{values,logic,rules,rating}.rs`, `sudoku/wasm/src/dto/{operations,rating}.rs`, `sudoku/core/src/rules/types.rs`, `src/sudoku/{workerEngine,guards,contracts}.ts`, `tests/wasm-contract-types.test.ts` and `tests/e2e/wasm-contract.spec.ts`.

**Bridge fixtures:** Update version expectations in `src/worker/{sudoku.worker,readiness,client}.test.ts`, `src/sudoku/wasmModule.test.ts` and `tests/e2e/workerHarness.ts` together with the Rust/TypeScript bridge identity. Preserve tests that reject mixed old/new assets.

**Interfaces:** Additive named `assess_summary -> Ts<AssessmentSummaryWorkDto>`, the concrete wrapper over existing `AssessmentOutcomeDto`, borrowed conversion helpers and narrow read-only metadata access. Preserve the full `assess` export and existing Worker result.

- [x] Add actual-WASM parity between full and summary-only assessment for rated, ungraded, invalid and exhausted results, including equal work and unchanged number/absence semantics. Add a generated TypeScript assertion for the concrete summary/work return type and absence of a trace in its rated result.
- [x] Factor shared assessment execution, implement summary-only output, switch the Worker caller and remove unnecessary conversion intermediates. Update the bridge/export checks together.
- [x] Rebuild via `pnpm wasm:build`; run all type projects, binding/Worker tests, full available-browser migration contracts and the affected assessment/player flows at root and subpath deployments.

**Exit:** Identical production assessment outcomes with the trace absent before JS serialization; full-trace consumers and disposal behavior continue to work.

### Task 6: Optimize preparation and bounded generation structures

**Files:** `sudoku/core/src/rules/{context,topology,types}.rs`, `sudoku/core/src/search/exact.rs`, `sudoku/core/src/generation/{candidates,terminal_construction}.rs`, relevant rules/exact/frontier/random/layout tests.

**Interfaces:** Borrowed group traversal, finite peer-set accumulation, lightweight direct-contradiction scan and bounded temporary ranking/terminal scratch. Stable frontier IDs are a conditional follow-up, not a prerequisite.

- [x] Pin invalid-rule precedence, zero-budget direct contradictions, completed invalid arithmetic boards and charged preparation exhaustion before removing duplicate compilation.
- [x] Preserve peer/membership order and every preparation charge while eliminating temporary topology copies/tree sets where the profile warrants it.
- [x] Replace frontier ranking temporaries and terminal scratch. Add an explicit evicted-pending-parent/sweep continuation test before any ownership redesign; account for transient entries as well as the retained eight.
- [x] Run full native contracts, independent generation checks and actual-WASM contracts; compare seeded outputs, layout continuations and near-limit failures. Retain changes only when the complexity/performance trade-off is supported by measurements.

**Exit:** No full corpus/identity/work change; a documented performance benefit or a clear ownership simplification. Optional compact topology and stable-ID redesign should remain separate reviewable changes.

### Task 7: Final measured acceptance and documentation

**Files:** The verification report, core/WASM READMEs and architecture/extension documentation only where interfaces actually changed; Cargo profile only if the separate experiment succeeds.

**Interfaces:** No new mathematical behavior. Review native API source changes separately from unchanged JS/storage contracts.

- [x] Run the final correctness matrix below and an independent whole-change review; do not silently bless changed reference outputs.
- [x] Publish paired per-workload results, remaining slow cases, resource/size/build costs and unavailable runtime evidence. Separate improvements from neutral readability changes.
- [x] Document ownership, scratch reset, ten-cell constraint capacity, stable frontier lifetime and unchanged work/draw invariants immediately where they matter.

**Exit:** Verified contract preservation and demonstrated costs/benefits. No commit, push or integration action is implied by completion of the plan.

## Measurement and acceptance matrix

| Workload           | Required observations                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation        | Classic cached versus variant cold; topology/catalogue cost and allocations                                                                        |
| Support/exact      | Prepared and standalone; catalogue/fallback, ten-cell Arrow, hard wide cages, low/near-exhaustion budgets; first solution, nodes and work equality |
| Logic/rating/hints | Basic/advanced/variant, full traces, unsuccessful pattern visits, policy continuation; allocations and p50/p95/max                                 |
| Generation         | All 19 supported variant/tier combinations and the existing 2,241 fixed requests; ready/exhausted distribution, payloads, draws and stage work     |
| WASM boundary      | Rust computation versus DTO conversion/serialization; full versus summary-only assessment; plain arrays and ownership                              |
| Real application   | Cold and idle-prepared Worker latency; root/subpath; heavy live notes/conflicts, hints, pause/cancel, persistence and disposal                     |
| Resources/build    | Allocation count/bytes, retained/peak memory, WASM artifact and compressed sizes, startup and release build time                                   |

Use repeatable release builds and alternating sequential comparisons, with fixture parsing/assertions excluded from kernel timing and normal output conversion included in binding timing. Diagnostic allocator instrumentation must remain outside shipped core code; measure uninstrumented wall time separately. Do not run competing timing processes. Native improvements do not establish WASM improvements.

Preservation is a hard gate: identical complete results, evidence/trace order, first solutions, statuses, deterministic work and random continuations. An algorithm that performs fewer charged visits needs a separate budget/identity design; synthetic charges are not an acceptable compatibility workaround.

For the changed Rust implementation, require no aggregate generation regression and investigate any repeatable per-combination p95 regression greater than both 10% and 1 ms. Retain the existing measured production limits: generation under 3,000 ms, main-thread p95 below 16.67 ms and representative maxima below 50 ms. These are controlled-corpus acceptance targets, not universal guarantees. A source cleanup can be retained for an explicit maintainability benefit when performance is neutral, but must not be described as a measured speedup.

Final checks:

```sh
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo clippy -p sudoku-wasm --target wasm32-unknown-unknown --locked -- -D warnings
cargo tree -p sudoku-core -e normal
node tests/migration/run.mjs --suite all --engine native
node tests/migration/run.mjs --suite assessment-generated --engine native
node tests/migration/run.mjs --suite generation --engine native --independent
pnpm wasm:build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
node tests/migration/run.mjs --suite all --engine wasm-chromium
node tests/migration/run.mjs --suite all --engine wasm-webkit
node tests/migration/run.mjs --suite all --engine wasm-firefox
pnpm build
pnpm build:subpath
pnpm test:e2e
```

Run browser cases serially where artifact directories are shared. An unavailable browser is an explicit gap, not a pass. Affected physical touch/device responsiveness is separate from emulation. Review the final native public API, generated declarations, persistence format, Worker protocol and complete seeded outputs before declaring the refactor complete.

## References and version applicability

The reviewed repository pins Rust 1.98.0 and the adapter dependencies listed above. The proposed integer bit operations, slices, arrays, borrowed access, `Vec::clear` and ordinary ownership transfer predate that compiler; no toolchain upgrade is required. Live standard-library documentation can describe a newer release, so implementation must continue compiling against the pinned version.

- [Rust API Guidelines: type safety](https://rust-lang.github.io/api-guidelines/type-safety.html) and [private representation](https://rust-lang.github.io/api-guidelines/future-proofing.html): use semantic types and protect prepared-state invariants.
- [Rust integer bit operations](https://doc.rust-lang.org/std/primitive.u16.html): candidate counting, membership and ordered bit iteration.
- [Vec capacity and clearing](https://doc.rust-lang.org/std/vec/struct.Vec.html#method.clear): reuse allocation while explicitly resetting logical queue membership.
- [Rust collections](https://doc.rust-lang.org/std/collections/index.html): choose finite membership and ordered traversal representations for the actual workload.
- [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html): measure LTO/codegen/size options independently of source changes.
- [serde-wasm-bindgen 0.6.5](https://docs.rs/serde-wasm-bindgen/0.6.5/serde_wasm_bindgen/): keep maintained structured conversion and explicit owned DTOs.
