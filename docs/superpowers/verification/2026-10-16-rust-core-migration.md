# Portable Sudoku Engine Migration Audit

Date: 2026-10-16. Implementation and verification are in the isolated `rust-sudoku-core` worktree. No push, publication or merge is part of this audit.

## Scope and status

The reusable `sudoku-core` crate owns Sudoku values, rules, arithmetic support, exact search, edits, human logic, hints, rating, seeded generation and mathematical validation. The separate `sudoku-wasm` crate owns checked browser DTO conversion and disposable prepared resources. Vue/Pinia own player facts, clocks, teaching copy, persistence and resource lifetimes. Production no longer imports the retired TypeScript engine; the sealed reference is test-only.

Current generation uses exactly 32 seed bytes and the specified BLAKE3/ChaCha8 v11 recipe. Current saved seed identity is canonical lowercase hex. Historical saved boards, rules, progress, results and opaque seed/version text remain authoritative; they are validated without regeneration or regrading. Browser WASM uses wasm-bindgen, not NAPI. Native callers can reuse the core without browser, JavaScript, serialization, async-runtime or OS-random dependencies.

The complete serialized audit passes every native and available-browser performance gate. One fresh independent whole-change review is complete; its verification gaps were corrected and the final 573-test suite passed. Firefox is unavailable on this host and is never counted as passed. A functioning Firefox run elsewhere is required before claiming full supported-browser release coverage.

## Measured result

The [raw audit JSON](2026-10-16-rust-core-migration.json) records 171 kernels, 2,241 complete generation outputs, 152 boundary outcomes, both deployment roots and the exact source/corpus/artifact fingerprints. The run lasted from 13:28:14 to 13:51:06 UTC on 2026-10-16. All payload checks passed before/after their measured calls.

| Runtime                             | Prepared exact speedup | Complete generation speedup | Highest main-thread p95 / max | Slowest measured real generation Worker |
| ----------------------------------- | ---------------------: | --------------------------: | ----------------------------: | --------------------------------------: |
| Native Rust versus Node TS          |                  4.51x |                       2.97x |                           n/a |                                     n/a |
| Chromium 156 WASM versus browser TS |                  3.13x |                       2.66x |                10.7 / 11.5 ms |                                300.3 ms |
| WebKit 27.2 WASM versus browser TS  |                  3.87x |                       4.69x |                    11 / 11 ms |                                  309 ms |

All 19 variant/tier combinations have no unresolved p95 regression greater than both 10% and 1 ms. Workers run the first qualifying input and the slowest observed input for each combination at both roots: Chromium has 38 requests per root, WebKit 37 after deduplication. Every measured generation request remains below 3,000 ms. These are corpus/host measurements, not universal language multipliers or physical-device results.

For the formerly blocking wide-cage operations, actual main-thread preview/post/receive/commit p95 is at most 0.2 ms in Chromium and 1 ms in WebKit; observed maxima are 0.6 and 1 ms. Raw full-budget arithmetic remains around 25–27 ms and is explicitly excluded from the main-thread acceptance gate because production dispatches it to a Worker. The highest overall synchronous cost is constructing/validating the complete 32-course catalogue. The representative eight-step Expert hint parses in p95 0.5 ms and independently validates in 0.6 ms in Chromium; all measured edit/review/hint paths satisfy the frame target.

`releaseReady` remains **false solely because Firefox coverage is unavailable**. Native prepared/generation, complete-corpus and every available-browser exact/generation/p95/deadline/interactive/allocator/resource-observation gate are true. The benchmark exits with code 2 deliberately for this incomplete release coverage; it still saves the complete results. No Firefox application pass or full supported-browser release acceptance is claimed.

## Artifact, initialization and resource observations

Both emitted deployment roots contain the same 1,310,577-byte WASM binary, SHA-256 `2d8746da95149eb0b563de8fa5a6b6391c9c0f50ce716be3769a45596efde3b3`. Local fresh-browser fetch/compile/instantiate measurements are 52.1/0.7/0.2 ms in Chromium and 3/2/0 ms in WebKit. Timer resolution explains zero-duration observations; they do not mean no work occurred. Subpath startup is labeled as the same-browser code-cache condition, not another cold sample. Preparation of all 171 benchmark layouts is recorded separately from those startup intervals.

Native peak process RSS is 72.14 MiB, including the benchmark fixture/preparation process. Retained audit-instance WASM linear memory is 5.1875 MiB before and after each 1,000-cycle prepare/free batch. Separate lifecycle observation creates/disposes 40 main instances and creates/terminates 80 real Workers per browser; all ownership counters return to zero active Workers. Process-tree RSS after the warmed second batch changes by +0.89 MiB in Chromium and 0 in WebKit. Chromium heap used after forced collection changes from 12,747,184 to 12,747,620 bytes between the two batches; backing storage remains unchanged. WebKit forced collection/heap observation is unsupported and is recorded as such.

Sampled browser-process-tree peaks are 1,380.52 MiB in Chromium and 232.81 MiB in WebKit. These include the full TypeScript/WASM comparison page, golden payloads, JIT and renderer/native resources after the large corpus; they are not the shipped game's standalone memory footprint. RSS sampling runs only during resource observation and is not an OS high-water mark or a proof of universal absence of leaks.

Root derivation cost is 4.48 us TS / 0.40 us WASM in Chromium and 3.30 / 0.50 us in WebKit. The independent phase-plus-256-word JS stream checksums match native Rust; complete raw stream timings and derivation checksums remain in the JSON. The test-only TS generator retains its original string input shape and decodes canonical root hex in its v11 adapter; Rust owns bytes directly. The mathematical draw sequence and charged work match, while representation/conversion costs remain part of each measured implementation.

## Correctness and integration evidence

| Verification                                     | Latest independently rerun evidence                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Rust values/rules/search/logic/rating/generation | 66 workspace tests, rustfmt, native/all-target and wasm32 Clippy pass                                  |
| Native differential contracts                    | 5,742 comparisons pass                                                                                 |
| Actual Chromium WASM differential contracts      | 4,262 comparisons pass                                                                                 |
| Actual WebKit WASM differential contracts        | 4,262 comparisons pass                                                                                 |
| Frontend contracts and workflows                 | 573 unit tests pass; all six type projects, ESLint and Prettier pass                                   |
| Actual player flows                              | 401 effective cases pass; 40 viewport-specific skips                                                   |
| Actual heavy-layout Workers                      | Root and `/sudoku/` jobs retain the full 1,000,000 action work; exhausted notes remain atomic          |
| Firefox                                          | Fresh pinned binary fails during launch: `Could not find profile folder`; no application assertion ran |

The native/browser suites compare complete deterministic outputs and work accounting, not just solved boards. They include prepared and standalone exact counting, support/candidate/conflict bounds, edits, advanced proofs, logical chains, rating/screening/cache behavior, layouts and continuation draws, 2,241 complete v11 generation outputs and 152 generation boundary cases. Browser contracts omit native-only checks deliberately; their different totals do not imply missing generated payload comparisons. Independent rule/solution/uniqueness/necessity/diversity checks and all 32 authored course contracts complement golden equality.

The frozen reference commit is `7c95fb7832e614d4ee8d5089f69bac71d4886c36`. Its source manifest remains sealed. Only the separately fingerprinted test adapter changes generation versions and random-byte framing using maintained independent JS primitives. Expected outputs are not regenerated from Rust. See [migration reproduction and coverage](../../../tests/migration/README.md).

The extended async integration run initially passed 120 of 123 cases. Two context-close failures came from concurrent Playwright runs clearing a shared artifact directory; one lease-takeover assertion failed transiently. The affected flows subsequently passed 8/8 in an isolated run with a separate output directory. The final complete configured run contained 380 passing cases, 40 intentional viewport-specific skips and 21 failures in the Node reference helper before Worker assertions. All 21 shared a cached v10/v11 graph mismatch. A new child-process regression reproduced it; exclusive recipe-tagged module URLs now isolate the graphs in both orders and under late-hook registration. All 33 affected Worker cases then passed, followed by 36 Worker/binding cases after the final infrastructure changes. This establishes 401 effective configured cases with affected rerun evidence; it does not relabel the first run as a single green run.

## Interactive regression and approved correction

A valid Killer layout with nine row cages of nine cells/sum 45 passes content validation, yet raw candidate/conflict/note enumeration exhausts the unchanged one-million-work allowance in roughly 26 ms. Initial actual Chromium p95 was 26.2 ms candidates, 26.6 ms conflicts and 25.9 ms generated notes, failing the 16.67 ms interaction target. Ordinary generated layouts and the original 57 constraint probes met that target.

The user approved the [focused asynchronous design](../specs/2026-10-16-async-live-analysis-design.md). Rust now classifies large-cage enumeration as heavy; the main facade prevents synchronous full computation on those layouts. It returns only a sound zero-arithmetic-work preview while isolated Workers perform full conflicts or generate notes. Preparation is separately bounded/reported and cannot increase action work. Main editing, completion, review and measured cheap storage validation remain synchronous.

Session/puzzle identity, layer revisions and independent abort generations fence late results. Input, note changes, history, pause, replacement, ownership loss, dataset reset and disposal cancel pending notes. Clock/selection and assistance-only changes do not restart work. Completed notes commit atomically against the latest assistance facts; exhaustion/failure/cancellation preserves layers, history and assistance. Chinese pending/failed feedback never claims preview established validity.

The final benchmark retains raw heavy-kernel timings as evidence, then gates actual main-thread preview, request posting, response handling and note-commit blocking separately. Full Worker work/results match the same raw Rust operation. The empty wide-cage board still exhausts exactly 1,000,000 work; the valid one-blank board completes conflicts in 10 work and notes in 90 work. Each operation runs 40 times per fixture/browser, including successful note installation.

## Performance methodology

Run `pnpm bench:core` after builds and correctness checks finish. The harness performs setup before timing, verifies complete payload equality before each measured operation and rejects a deliberately wrong payload nonzero. It records source/corpus/toolchain/artifact fingerprints, 171 retained kernel inputs, all 2,241 v11 outputs, all 19 supported variant/tier combinations, 152 boundary outcomes, actual emitted Workers at both deployment roots, startup conditions, memory and repeated disposal.

Same-v11-recipe comparisons measure language/binding differences with unchanged mathematical work. Earlier [native](2026-10-16-rust-core-benchmark.md) and [browser WASM](2026-10-16-wasm-core-benchmark.md) v10 prototype reports remain historical product diagnostics; their different seeded work must not be treated as v11 generation speedups.

Native optimized timings exclude fixture parsing, layout setup, result projection and correctness assertions. Native and Node are measured in separate sequential phases; browser kernel/generation comparisons alternate engine order. This conditioning difference limits native attribution, rather than invalidating the matching-work corpus result. Browser binding timings include the call and owned result conversion. Generation comparisons include complete engine generation and its original work/step/layout limits, with full payload verification outside the timer. Worker deadlines include remaining initialization, transport and validation. Fresh-browser startup and same-browser code-cache startup are labeled separately. Native peak process RSS includes the fixture/preparation process; WASM allocator numbers describe linear-memory capacity; the independent process-tree and optional heap observations above provide separate lifecycle evidence. Neither is a proof of universal absence of leaks.

The serialized results below cover the complete corpus; no available-browser performance gate failed. Required gates remain at least 2x aggregate prepared exact improvement, no aggregate generation regression, no unresolved reproducible p95 regression greater than both 10% and 1 ms, measured generation jobs under 3,000 ms, main-thread p95 under 16.67 ms and representative maxima under 50 ms. No work allowance is reduced to make a gate pass.

## Independent review and implementation decisions

A fresh `gpt-6-astra` reviewer inspected the whole migration, async supplement and release tooling read-only, without running tests or timing. It found no Critical issue or additional concrete production correctness defect. Two Important evidence gaps were addressed: ordinary edits/review/hint parsing/proof validation and successful heavy-note commits now have required interactive profiles; two batches of 20 main/Worker lifecycles now have independent process-tree RSS observations and Chromium heap observations after forced collection. Regression checks rejected missing coverage/resource evidence before implementation, then passed with the complete 573-test suite and actual-browser smoke audit. There was no second reviewer pass; the author verified fixes.

The loader hook-order issue was promoted from Minor because mixed reference versions would undermine the oracle. Its deterministic late-v10-registration regression failed, then passed with exclusive recipe ownership. A stale TypeScript-assessor README sentence was corrected during the already-required documentation update. No review minor remains deferred.

The serialized speedup/deadline/resource gates below pass for native, Chromium and WebKit. Firefox runtime correctness remains unavailable here, and browser touch emulation does not establish physical-device responsiveness. Those limits are retained explicitly.

Implementation rulings and their costs are recorded in the appendix below; none changes the approved byte identity, mathematical quotas or saved-data behavior.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
cargo test --workspace --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo clippy -p sudoku-wasm --target wasm32-unknown-unknown --locked -- -D warnings
node tests/migration/run.mjs --suite all --engine native
node tests/migration/run.mjs --suite all --engine wasm-chromium
node tests/migration/run.mjs --suite all --engine wasm-webkit
pnpm build
pnpm build:subpath
pnpm exec playwright test --project desktop --project mobile --project webkit --grep-invert @performance
pnpm bench:core
```

Install the matching Playwright browsers and run Firefox contracts/player checks on a host where Firefox launches. CI includes all four configured player projects plus actual Chromium/Firefox/WebKit WASM contracts. Controlled-host timing is a release audit rather than a shared-runner CI threshold.

## Implementation ruling record

- Ruling: Execute directly in this session — user requested committing the plan and continuing; native execution avoids a new coordination choice — cost if wrong: fewer independent intermediate reviews; final fresh review remains required.

- Ruling: Keep Tasks 11–14 on one unreleased feature branch and switch composition coherently; move small request-type/seed call-site prerequisites earlier when a focused task needs them — new byte requests otherwise break old callers between those tasks — cost if wrong: larger frontend integration commit; all affected player/type tests must pass before cutover.

- Ruling: Expose v11 version constants with engine_info in Task 2; Task 9 adds generation validation using those same constants — resolves the plan's forward dependency — cost if wrong: a changed identity requires refreshing reference fixtures explicitly.

- Baseline: 78 files / 1006 tests passed. Task 1 RED: three reference-integrity tests failed before driver implementation. Ruling: independent byte-stream helper uses typed .ts instead of .mjs so strict TS tests can consume its contract directly without declaration shims — same responsibility — cost if wrong: Node 26 strip-types remains required, already the project floor.

- Task 1: Ruling: store complete generation JSONL as deterministic gzip archives and read through Node zlib — uncompressed payloads exceed 100 MB; compression preserves every field and keeps ordinary primitive fixtures readable — cost if wrong: baseline inspection requires decompression, documented in the migration README.

- Task 2 browser RED: Chromium rejects the generated empty binding because engine_info is absent. Ruling: extend the existing pnpm-workspace.yaml instead of replacing it; keep minimumReleaseAgeExclude entries — the plan incorrectly listed that existing file as a creation — cost if wrong: dependency release-age policy could change, so preserve the original bytes beneath the new packages entry. Rating identity lives under rating/types.rs, avoiding a future lower-layer dependency on generation.

- Ruling: store fixed-width four-cell catalogue rows rather than allocating one Vec per tuple — the fixed max arity is four and iteration order/work remain identical in all 148 cases — cost if wrong: future larger-cage catalogue support must explicitly revise the row contract instead of extending it silently.

- Ruling: pure edit changed flags describe board layers only, with completion describing the resulting board; TypeScript composes assistance counters and session completion guards — keeps application facts outside the reusable core — cost if wrong: frontend integration must explicitly preserve generate-notes assistance and no-op/session history behavior.

- Task 10 interface ruling: expose standalone count_solutions and prepared count_solutions through the owned WASM class — actual exact/parity/benchmark suites require named count APIs, omitted from the plan export list — cost if wrong: keep these heavy APIs off the synchronous MainSudokuEngine facade.

- Ruling: box the owned completed edit result to keep the success/exhaustion enum compact under Clippy — array-valued layers otherwise create a 246-byte variant gap — cost if wrong: one small allocation per edit, measured with live-board operations at Task 15.

- Ruling: workspace geometry and optional support are private immutable preparation, so cage memo keys need only the clue index and current domains — callers cannot change sum/geometry/context in-place as raw TS tests could — cost if wrong: changing layout requires a fresh workspace, intentionally preventing stale proof reuse.

- Ruling: introduce rating-owned hint policy selection in Task 7, ahead of full rating implementation — hints require the existing variant hard policies — cost if wrong: Task 8 must extend this owner rather than create another policy source.

- Ruling: make RatedTrial::complete return CoreResult<RatedAssessment> while consuming ownership — preserves the source completion failure path as an explicit Rust error instead of an internal panic — cost if wrong: acceptance callers must handle a possible replay invariant error; it still cannot repeat search or consume work.

- Ruling: keep stored-summary wire shape errors in a typed StoredAssessment envelope and validate mathematical counts in core — no serde/JSON or JS value enters the reusable crate — cost if wrong: Task 10 must preserve raw version-first error precedence while converting DTOs; metadata absence stays Option::None. Assessment conflict issues retain typed violations and are rendered only by the adapter.

- Ruling: losslessly compress assessment screening JSONL — the readable projection exceeds 20 MiB while gzip is 145 KiB — cost if wrong: corpus inspection requires documented decompression; no fields or trace steps are omitted.

- Ruling: batch native migration comparisons in groups of 128 — full generation/assessment responses otherwise retain large temporary stdout buffers — cost if wrong: extra cached Cargo invocations affect migration-driver duration, never measured algorithm timings or expected payloads.

- Ruling: retain only the canonical Jigsaw region preset in production generation, while preserving the example-selection, symmetry, digit-map/complement draws — all five existing variant/tier example arrays contain one item, arithmetic/path teaching clues are always discarded and rebuilt for a fresh terminal, and their teaching boards never affect generation — cost if wrong: all 190 layout continuation probes and 2241 full v11 outputs must match; any future preset-count change requires revising the generation identity and extension checklist.

- Ruling: use a private acyclic Rc<RefCell<FrontierEntry>> owner for the bounded pool/pending-parent/sweep references — preserves reference identity across sorting/eviction without retaining an unbounded arena; no Rc escapes the frontier and no board domains are shared — cost if wrong: one small retained-checkpoint allocation, covered by final full-generation performance/memory gates. Reviewed official Rc/RefCell documentation; used only APIs stable before pinned Rust 1.98.

- Ruling: use checked js_sys::Uint8Array ABI parameters for generation/derivation rather than unchecked &[u8] glue — wasm-bindgen slice glue can coerce strings/array-like inputs before Rust sees them — cost if wrong: the binding must check ArrayBuffer.isView plus Uint8Array identity before reading/copying, while native core still owns fixed byte seeds and generated TS remains Uint8Array. No legacy seed wrapper is introduced.

- Task 10 interface ruling: expose analyze_logic alongside count_solutions and explicit WorkResultDto<T> responses carrying actual caller-budget consumption — raw logical/candidate/hint parity cannot infer work from assessment traces, and no mutable JS budget crosses WASM — cost if wrong: the Worker/main facade unwraps the named result while preserving all existing player/result discriminators; these heavy standalone operations remain outside the synchronous MainSudokuEngine facade. Raw metadata uses serde-wasm-bindgen preserve only at the adapter so undefined/null and non-number input kinds can be checked before constructing portable StoredAssessment facts.

- Ruling: use transparent concrete Tsify response wrappers — pinned Tsify 0.5.8 erases generic ABI arguments and produces implicit any under skipLibCheck; a strict no-any consumer test failed before this fix — cost if wrong: generated wrappers add declarations, never transport allocations or handwritten TS schemas. Base candidates and compact summary/outcome parsing have named reusable exports so WASM parity never substitutes TS math.

- Ruling: generate a binding factory with TypeScript 6.0.3's compiler API from pinned self-contained wasm-bindgen web glue — the upstream ESM singleton cannot own separate memories, and cache-busting ESM instances retain memory for the page lifetime. The generated closure uses no eval, no custom pointer ABI and no hand-maintained DTOs. Fresh factory calls have distinct memories and can be collected after scoped disposal — cost if wrong: changes to upstream glue imports fail the build explicitly and require revisiting this small build adapter.

- Ruling: keep synchronous runtime injection in a RuntimeScope subtree and preserve the existing themed application in ReadyApplication — providers must run during setup, after the ready runtime exists, while pending initialization has no storage or stores. App owns initialization and final shutdown; ReadyApplication keeps the original save-before-dispose workflow idempotent — cost if wrong: three focused root composition components, covered by bootstrap/old-theme/teardown tests.

- Ruling: give Node-backed unit fixtures a separate tsconfig.test.json — new actual-WASM tests read compiled bytes from disk, but production browser code must not acquire Node globals. Existing app/node/worker/e2e/reference checks remain, with a sixth explicit unit project — cost if wrong: one additional fast type-check command, without weakening strict checking.

- Task 11 production diagnosis: the initial component-only provider passed old tests because their Pinia fixture already supplied an app-level runtime, but real Pinia 4.0.3 executes store setup in app.runWithContext and cannot see that component provider. Actual emitted-root/subpath tests exposed GameRuntime must be provided. Superseding the RuntimeScope ruling: main now supplies an explicit typed app.provide callback; App publishes the ready runtime there before mounting ReadyApplication. Removed the unnecessary RuntimeScope component and added a real-Pinia application-context regression. Actual Chromium/WebKit loading, two failed retries, identity rejection, no pre-ready IndexedDB opens and root/subpath delivery all pass (8 cases). UI skill lookup yielded only general semantic/progress guidance, so the small loading screen follows the existing theme plus general status/error/keyboard accessibility rules.

- Ruling: advance only generation byte plumbing and daily request assembly from Task 13 into Task 12 — a byte-only Worker cannot leave production callers sending UUID strings, and no temporary legacy overload is permitted — cost if wrong: this commit also owns the tightly coupled caller/fixture contract updates; live editing and persistence semantic cutover remain Task 13.

- Ruling: expose Rust shape-only hint parsing and geometry validation, and accept unknown JS values at semantic validator entry points — Worker envelope guards must not retain TypeScript mathematics or falsely assert that untrusted data already has a valid DTO. Explicit Rust DTO decoding remains fallible before any core operation; generated results stay concrete — cost if wrong: two small named exports and corresponding contract checks, without a generic dispatch protocol.

- Task 14 ruling: teaching state validation is candidate-relative and validates an authored unit deduction independently of the detector's first traversal result. Transposing valid examples changes which unrelated pattern the detector encounters first; five preserved transfer examples exposed that distinction. Existing live hint validation retains exact replay/work ordering; teaching gets explicit direct unit proof checks and order-independent arithmetic removal comparison. Earlier candidate eliminations remain a documented caller precondition. Native regressions cover an alternate hidden single and a valid/forged pair removal.

- Final: Ruling: re-grade the loader ownership edge from Minor to Important because mixed reference versions undermine differential evidence; enforce exclusive recipe ownership and test both orders/concurrent plus deterministic late registration — cost if wrong: fixture tooling needs a resolver correction, sealed sources/expected outputs remain unchanged.

- Final: Ruling: the stale README TypeScript-assessor sentence is corrected within the already-required unfinished Task15 documentation update; no new product behavior — cost if wrong: documentation-only correction.
