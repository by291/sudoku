# Rust Idioms and Performance Verification

## Scope and result

This implements the [approved review plan](../plans/2026-10-16-rust-idioms-and-performance-review.md) against baseline `f53e6585e3e193ede08f5c7e62037161971c5c9d`. Verification uses an immutable snapshot of this refactor over `995022a`, with separate test origins; concurrent Android changes in the shared checkout are preserved and excluded. The branch is `feature/rust-idioms-performance`; the user authorized a local implementation commit on 2026-10-17. Push and pull request creation are outside that authorization. Unrelated home/router changes were preserved and committed separately by another task.

The portable synchronous core, native owned result contracts, sealed TypeScript oracle, v11 seed identities, rating v2, random draws and charged work remain. The additive WASM summary export deliberately advances the bridge to version 2. Stored data and Worker result envelopes remain unchanged.

During this audit, a parallel Android implementation changed four other core files and rebuilt the shared package. The affected preliminary timing runs were discarded. Final performance and browser evidence use the isolated refactor snapshot; separate supplemental native integration checks cover the shared workspace. The root changes from that task were preserved.

Status: implemented and verified. The audit started on 2026-10-16 and concluded on 2026-10-17. Preliminary mixed-workspace measurements were discarded after concurrent Android changes were detected. The raw evidence bundle is an audit artifact, not a restored benchmark subsystem.

## Implemented changes

| Area                          | Change and ownership                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Values and logical deductions | Checked mask membership/count/single/ascending iteration; bounded pair/triple and pattern scratch; complete owned evidence built only for a selected action. Advanced proof validation stays independent.                                                                             |
| Arithmetic support            | Ten-cell scratch covers Arrow's circle plus nine shaft cells. Incremental sums, suffix bounds and prefix-peer checks reproduce the same ordered DFS and charges. Public support snapshots stay owned; interrupted support is never cached.                                            |
| Exact search                  | One fresh probe owns reusable propagation queues. Every entry clears pending cells, FIFO entries and membership flags; trail restoration and exhaustion behavior remain.                                                                                                              |
| Rating                        | Borrowed fixed policies and internal ownership-taking trace continuation remove repeated allocation/deep copying. Public policy vectors and borrowed-trace snapshot APIs remain source-compatible.                                                                                    |
| Rule preparation              | Borrowed groups, paired `u64` relationship sets and a lightweight validated contradiction scan remove tree sets, temporary geometry copies and duplicate full preparation. All original preparation visits remain charged.                                                            |
| Generation                    | Bounded stable ranking, ordered scans, nine-element terminal scratch and Arrow path push/pop remove temporary lists/copies. Shared frontier references retain their intentional pending-parent/sweep lifetime.                                                                        |
| WASM                          | `assess_summary` shares assessment execution/failure mapping with full `assess`, skips trace DTO conversion, and is used by production Workers. Borrowed metadata/index conversion and direct fixed note validation remove intermediate copies while returning independent JS arrays. |
| Release                       | Thin LTO and one code generation unit were selected using separate native and actual-WASM experiments; no limits or panic strategy were changed.                                                                                                                                      |

Full fixed topology storage and stable frontier IDs were conditional options in the plan. They were not needed for these improvements and would add representation/lifetime complexity. The existing Chinese assessment issue strings remain compatible; moving them to a structured presentation contract is a separate bridge change.

## Correctness and review

No expected oracle output was regenerated from Rust. Existing contracts compare complete results, including first solutions, evidence/trace order, random continuation, stage work, nodes and incomplete outcomes. Matching pre-existing independent evidence is equality-based reuse, not a new independent proof.

The isolated builds reproduce all 25 content-hashed asset identifiers at each deployment root from the successful player build logs, and reproduce its complete WASM SHA-256. The recorded 404-pass player run is reused for that same refactor build. The independent generation proof is reused by equality of the complete puzzle/rule/solution payloads; generation timing rechecks those payloads before and after each invocation. The browser contract logs completed before the concurrent package rebuild.

New regression coverage includes mask edge cases, ten-cell Arrow support, invalid-input precedence, zero-budget direct contradictions, completed arithmetic rejection, public trace snapshot ownership and summary/full assessment parity. Summary tests include validation-stage exhaustion with explicit null difficulty, logic exhaustion, invalid and ungraded outcomes.

The named dirty-sibling test pins sealed Killer/Thermo/Arrow first solutions and literal `(nodes, work)` pairs `(3, 15444)`, `(7, 793)` and `(7, 596)`. Isolated copied-source mutations omitting all queue resets, or just cells, units or constraints clearing, each failed that test. The complete-reset mutation reached the next branch with five pending cells, eight units and nine constraints. The separate empty-domain test pins raw and forced-fallback Cage/Arrow outcomes at zero and one work unit.

An independent whole-change review found no actionable production defect. Its two initial explicit coverage follow-ups were closed by the tests and mutation evidence above. A scoped follow-up reviewed the release configuration and final visual-test change.

The first complete player run exposed a test race: three independent geometry reads straddled a `ResizeObserver` update after viewport resizing. The test now reads one layout snapshot, asserts visibility and positive sizes, and retries the original geometric conditions with unchanged tolerances. No product layout was changed to accommodate the test.

A subsequent complete run exposed an existing mobile takeover-test ordering assumption: it clicked takeover immediately after clicking Home, before asynchronous navigation had finished saving and releasing ownership. The original isolated test failed seven of eight repetitions. Waiting for the final home URL (committed after the awaited leave guard) passed eight of eight. No storage or navigation implementation was changed.

| Final check                                                                           | Result                                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `cargo fmt --all --check`                                                             | Passed                                                                                             |
| `cargo test --workspace --locked`                                                     | 73 tests passed                                                                                    |
| `cargo clippy --workspace --all-targets --locked -- -D warnings`                      | Passed                                                                                             |
| `cargo clippy -p sudoku-wasm --target wasm32-unknown-unknown --locked -- -D warnings` | Passed                                                                                             |
| Normal core dependency tree                                                           | Portable hashing/RNG only; no serialization, binding, browser, entropy or async runtime dependency |
| Native complete migration contracts, final release profile                            | 5,742 passed                                                                                       |
| Native generated assessment, full traces                                              | 2,241 passed                                                                                       |
| Native independent generation                                                         | 2,241 passed; structure, uniqueness, rule necessity and 19-combination diversity passed            |
| Chromium complete WASM contracts, final binary                                        | 4,262 passed                                                                                       |
| WebKit complete WASM contracts, final binary                                          | 4,262 passed                                                                                       |
| Frontend type checking                                                                | All six configured projects passed after rebuilding WASM                                           |
| ESLint, Prettier, unit tests                                                          | Passed; 595 unit tests in 54 files                                                                 |
| Root and `/sudoku/` release builds                                                    | Passed                                                                                             |
| Complete desktop/mobile/WebKit player E2E                                             | 404 passed, 40 existing project-specific skips, no failures                                        |
| Isolated mobile takeover after navigation wait                                        | Eight of eight passed; the original test failed seven of eight                                     |
| Independent source review and scoped follow-ups                                       | No remaining actionable finding                                                                    |

Firefox is a runtime gap: fresh launches failed before application assertions with `Could not find profile folder`, including a retry with a fresh `/private/tmp` profile location. It is not counted as a pass. Browser/mobile emulation does not establish physical-device responsiveness.

After the parallel Android commits, supplemental checks at shared HEAD `7c75d6997474fb73c3b215817175503d122d5a73` also passed: workspace rustfmt, 85 native tests including the FFI crate, native/all-targets and wasm32 adapter Clippy with warnings denied, all 5,742 native migration contracts, and the normal core dependency inspection. These confirm native coexistence; browser and performance claims above remain scoped to the isolated refactor. The four concurrent core files and workspace manifests are fingerprinted in the bundle.

## Measurement method and reproducibility

The audit used Rust 1.98.0 on ARM64 macOS 27.0.1, Node 26.11.1, pnpm 12.11.2, wasm-bindgen 0.2.129 and the installed Playwright browsers. Exact browser versions and SHA-256 source/fixture/artifact fingerprints are in the evidence bundle.

The temporary harness adapts the archived release probe from `c3dfbcb`; it does not add a production dependency, benchmark command or shipping allocator. The baseline source/bindings were captured before implementation. The native input contains 171 exact kernels and all 2,241 independently sealed generation requests across all 19 supported variant/difficulty combinations. All generation payloads are verified before and after their timed invocation. Parsing, assertion/projection and fixture conversion are outside native timing; normal Rust-to-JS conversion is included in binding timing.

Native comparisons use three alternating sequential rounds; browser comparisons use two. This audit stops its build/test jobs before timing; other tasks share the host, so host-wide idleness is not guaranteed. Kernel groups have repeated samples. Generation distributions are reported per combination as well as for the full corpus. Allocation instrumentation runs separately from wall-time measurements, through a temporary standalone `System` allocator wrapper; its unsafe delegation is absent from the application and core. Allocation calls include reallocations, bytes are cumulative requested bytes, and peak is extra live requested bytes above the operation's starting live set, not RSS.

Preparation and direct native support/logic/advanced/rating probes use existing sealed fixtures and project results outside timing. The browser full/summary assessment comparison includes ordinary DTO serialization and avoids describing its difference as pure serialization cost. Live conflict measurements include the authored constraints and a wide nine-cell-per-cage Killer case with a finite one-million-unit allowance. Prepared handles are explicitly freed; WASM linear-memory capacity after repeated free cycles is a limited resource diagnostic, not a proof of GC or RSS behavior.

Real emitted Workers are tested at both `/` and `/sudoku/`, with first and observed slow requests per combination. Cold Worker timing includes creation/initialization but starts with a compiled module already available; fetch and compilation are recorded separately. Ready-worker timing starts after the ready handshake. Each worker is terminated and each completed payload is checked against the independent expected puzzle/assessment. These are measured cases, not universal deadline guarantees.

### Complete generation corpus

Each round contains the same 2,241 ready requests. Native totals use three complete sweeps; browser totals average the two complete alternating sweeps. p50/p95/max pool the recorded rounds. The final result includes both source changes and the adopted release profile. The corpus deliberately includes additional difficult Classic and Killer requests, so per-combination results are also shown.

| Runtime  | Total before → final (s) | Reduction | p50 before → final (ms) | p95 before → final (ms) | Max before → final (ms) |
| -------- | ------------------------ | --------- | ----------------------- | ----------------------- | ----------------------- |
| Native   | 48.23 → 18.81            | 61.0%     | 13.15 → 5.79            | 73.69 → 29.34           | 604.20 → 184.98         |
| Chromium | 46.93 → 24.36            | 48.1%     | 12.90 → 7.40            | 67.20 → 37.00           | 310.20 → 174.80         |
| WebKit   | 46.07 → 26.00            | 43.6%     | 12.00 → 8.00            | 67.00 → 39.00           | 309.00 → 176.00         |

Native sweep totals were 43.86 / 57.73 / 48.23 seconds before and 21.13 / 18.81 / 18.42 seconds after. That spread limits the precision of the 61.0% median reduction; every paired sweep improved, and the two browser sweeps provide the more stable deployment-specific comparison. The exact allocation counts below are independent of scheduler noise.

| Combination     | Requests | Native p95 before → final (ms) | Chromium p95 before → final (ms) | WebKit p95 before → final (ms) |
| --------------- | -------- | ------------------------------ | -------------------------------- | ------------------------------ |
| classic:hard    | 321      | 69.55 → 40.00                  | 66.60 → 45.40                    | 64.00 → 45.00                  |
| classic:expert  | 448      | 52.62 → 26.02                  | 54.90 → 31.80                    | 52.00 → 32.00                  |
| killer:hard     | 448      | 100.90 → 29.69                 | 98.80 → 42.30                    | 99.00 → 50.00                  |
| classic:easy    | 64       | 1.06 → 0.64                    | 1.30 → 0.90                      | 1.00 → 1.00                    |
| classic:medium  | 64       | 25.84 → 14.88                  | 24.40 → 16.80                    | 23.00 → 17.00                  |
| diagonal:easy   | 64       | 4.89 → 1.44                    | 5.40 → 1.90                      | 5.00 → 2.00                    |
| diagonal:medium | 64       | 29.86 → 5.42                   | 10.60 → 6.30                     | 11.00 → 7.00                   |
| diagonal:hard   | 64       | 97.85 → 29.89                  | 58.00 → 37.20                    | 60.00 → 41.00                  |
| jigsaw:easy     | 64       | 38.28 → 7.38                   | 24.90 → 9.10                     | 24.00 → 9.00                   |
| jigsaw:medium   | 64       | 38.70 → 11.40                  | 26.20 → 14.20                    | 27.00 → 14.00                  |
| jigsaw:hard     | 64       | 185.71 → 58.59                 | 123.40 → 70.80                   | 124.00 → 70.00                 |
| killer:easy     | 64       | 25.90 → 2.52                   | 6.20 → 2.30                      | 6.00 → 2.00                    |
| killer:medium   | 64       | 18.38 → 4.44                   | 8.30 → 3.20                      | 9.00 → 3.00                    |
| thermo:easy     | 64       | 10.97 → 1.68                   | 6.30 → 2.30                      | 6.00 → 2.00                    |
| thermo:medium   | 64       | 42.97 → 13.56                  | 30.90 → 16.80                    | 31.00 → 17.00                  |
| thermo:hard     | 64       | 78.76 → 32.45                  | 78.60 → 39.90                    | 80.00 → 43.00                  |
| arrow:easy      | 64       | 5.50 → 1.71                    | 6.70 → 2.30                      | 6.00 → 2.00                    |
| arrow:medium    | 64       | 2.76 → 1.30                    | 3.10 → 1.70                      | 3.00 → 2.00                    |
| arrow:hard      | 64       | 77.97 → 39.89                  | 88.50 → 53.50                    | 87.00 → 58.00                  |

No combination repeatedly exceeded both the 10% and 1 ms regression thresholds. The retained first native Killer Medium round had a tail spike; its per-round p95 values were 8.03 / 14.02 / 20.33 ms before and 10.44 / 2.51 / 2.79 ms after. All recorded rounds remain included in the statistics.

### Direct native computation and allocation

Sweep times sum the per-fixture sample medians, then take the median of three sweeps. Preparation, input decoding, proof validation and JSON projection are outside these operation timings; assessment includes its own required validation/preparation. Allocation counts/bytes are from one separately instrumented operation per fixture.

| Operation  | Fixtures | Sweep before → final (ms) | Reduction | Allocation calls before → final | Requested bytes before → final |
| ---------- | -------- | ------------------------- | --------- | ------------------------------- | ------------------------------ |
| support    | 148      | 0.376 → 0.135             | 64.1%     | 1,159 → 80                      | 21,150 → 1,440                 |
| logic      | 19       | 5.828 → 1.420             | 75.6%     | 177,870 → 4,786                 | 5,852,239 → 780,536            |
| advanced   | 72       | 7.241 → 0.464             | 93.6%     | 226,810 → 96                    | 18,364,363 → 24,880            |
| assessment | 19       | 7.128 → 2.203             | 69.1%     | 205,757 → 19,076                | 8,257,770 → 2,336,420          |

The generation allocation selection contains 54 distinct first/observed-slowest requests covering all 19 combinations. Calls fall from 32,213,429 to 3,110,212 (90.3%); cumulative requested bytes fall from 1,431,837,804 to 536,996,975 (62.5%).

The maximum extra live requested heap over this selection falls from 293.8 KiB to 250.6 KiB. Reduced cumulative churn does not imply a lower peak for every operation: reusable buffers retain capacity for their probe lifetime. Logical-analysis peak is essentially unchanged; assessment peak decreases. Stack scratch, allocator-internal memory and process RSS are outside these counters.

### Exact kernels and preparation

| Variant  | Boards | Native sweep before → final (ms) | Chromium sweep before → final (ms) | WebKit sweep before → final (ms) |
| -------- | ------ | -------------------------------- | ---------------------------------- | -------------------------------- |
| classic  | 36     | 0.556 → 0.495                    | 0.897 → 0.845                      | 0.938 → 0.875                    |
| diagonal | 27     | 0.682 → 0.562                    | 0.903 → 0.815                      | 0.925 → 0.875                    |
| jigsaw   | 27     | 0.460 → 0.377                    | 0.651 → 0.684                      | 0.700 → 0.675                    |
| killer   | 27     | 1.796 → 1.336                    | 2.023 → 1.809                      | 2.050 → 1.750                    |
| thermo   | 27     | 0.704 → 0.535                    | 0.933 → 0.875                      | 0.912 → 0.838                    |
| arrow    | 27     | 0.674 → 0.487                    | 0.885 → 0.810                      | 0.863 → 0.775                    |

Native preparation of the 171 layouts takes 9.63 → 6.62 ms. Classic includes its existing immutable singleton; variants retain their charged cold preparation. All near-limit probes are checked before timing; measured kernel sweeps use each board's first probe.

### Generation boundaries

The additional 152 requests include 115 exhausted outcomes and 37 ready outcomes, covering zero/short work, no layouts, one layout, no logical steps, one-short and exact allowances. These custom-limit cases are kept separate from the production-ready corpus.

| Runtime  | 152-request sweep before → final (ms) | Exhausted p95 before → final (ms) | Exhausted max before → final (ms) |
| -------- | ------------------------------------- | --------------------------------- | --------------------------------- |
| Native   | 859.67 → 462.05                       | 14.47 → 5.81                      | 118.47 → 99.67                    |
| Chromium | 909.35 → 560.90                       | 15.40 → 8.10                      | 131.40 → 117.70                   |
| WebKit   | 904.50 → 571.50                       | 15.00 → 10.00                     | 134.00 → 115.00                   |

### WASM assessment and live computation

The rating table sums per-fixture medians over the 19 authored requests. Full and summary calls perform the same assessment/work; their difference includes DTO construction and JS serialization. The outward Worker message was already summary-only before this change, so no Worker wire-size reduction is claimed.

| Browser  | Original full sweep (ms) | Final full sweep (ms) | Final summary sweep (ms) | Summary reduction within final engine |
| -------- | ------------------------ | --------------------- | ------------------------ | ------------------------------------- |
| chromium | 8.509                    | 4.075                 | 2.834                    | 30.4%                                 |
| webkit   | 8.571                    | 4.689                 | 3.272                    | 30.2%                                 |

| Browser  | Wide Killer full conflict p95 before → final (ms) | Full allowance | WASM bytes after 1,000 / 2,000 prepare/metadata/free cycles |
| -------- | ------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| chromium | 27.20 → 7.80                                      | 1,000,000      | 6422528 / 6422528                                           |
| webkit   | 26.00 → 7.00                                      | 1,000,000      | 6422528 / 6422528                                           |

The wide layout retains Worker-only dispatch despite its improved raw kernel time. Linear memory is measured with the 171 benchmark layouts still retained; capacity reuse across these free cycles is not a GC/RSS guarantee. Fetch/compile/instantiation observations and exact kernel payload checks are preserved in the raw data.

### Production Worker and main-thread boundaries

The emitted generation Worker selection contains 42 distinct first/observed-slowest requests. Each sample uses a fresh worker: cold includes initialization with compiled code available, while ready-worker timing starts after the ready handshake and measures its first generation job.

| Browser  | Deployment | Mode  | p95 (ms) | Max (ms) |
| -------- | ---------- | ----- | -------- | -------- |
| chromium | /          | cold  | 94.50    | 177.70   |
| chromium | /          | ready | 91.50    | 169.10   |
| chromium | /sudoku/   | cold  | 96.30    | 176.10   |
| chromium | /sudoku/   | ready | 91.20    | 172.20   |
| webkit   | /          | cold  | 109.00   | 183.00   |
| webkit   | /          | ready | 106.00   | 175.00   |
| webkit   | /sudoku/   | cold  | 112.00   | 178.00   |
| webkit   | /sudoku/   | ready | 106.00   | 175.00   |

| Browser  | Generation workers created / terminated | Live workers created / terminated | Main facade single-call p95 / max (ms) | Live post p95 / max (ms) | Live response parse p95 / max (ms) |
| -------- | --------------------------------------- | --------------------------------- | -------------------------------------- | ------------------------ | ---------------------------------- |
| chromium | 168 / 168                               | 40 / 40                           | 0.10 / 0.30                            | 0.10 / 0.10              | 0.10 / 0.40                        |
| webkit   | 168 / 168                               | 40 / 40                           | 0.00 / 1.00                            | 0.00 / 0.00              | 0.00 / 1.00                        |

Single-call main-facade probes cover preview/edit/completion and permitted full conflict/candidate/note operations over the authored constraints plus the wide case. Zero-valued single-call samples reflect browser-clock quantization, not zero work; additional batching resolves that quantization. Heavy operations are verified to reject synchronous dispatch. Source-served live Worker probes retain the complete one-million-unit work result and time posting/production response parsing separately. These measurements exclude Vue rendering, DOM painting and storage; the complete player E2E covers their observable behavior separately.

## Representation and build decision

The paired-word topology representation was compared with `u128` using the same refactor source, changing only that representation and the stated release profile. Seven alternating rounds on 171 prepared layouts and one request per combination gave these median sweep times:

| Browser  | Representation/profile            | Preparation, 171 layouts (ms) | Exact kernel sweep (ms) | Generation, 19 requests (ms) |
| -------- | --------------------------------- | ----------------------------- | ----------------------- | ---------------------------- |
| chromium | Paired words, default release     | 5.72                          | 7.36                    | 107.00                       |
| chromium | `u128`, default release           | 6.86                          | 7.29                    | 106.20                       |
| chromium | Paired words, thin LTO / one unit | 5.38                          | 7.20                    | 103.20                       |
| webkit   | Paired words, default release     | 5.70                          | 7.20                    | 109.00                       |
| webkit   | `u128`, default release           | 6.60                          | 7.10                    | 108.00                       |
| webkit   | Paired words, thin LTO / one unit | 5.40                          | 6.90                    | 107.00                       |

Retain paired words: `u128` increased preparation cost without a relevant kernel/generation benefit here. Thin LTO reduced the delivered binary and showed neutral or better throughput in this experiment. These are empirical choices for the pinned toolchain, not claims about all targets. Cargo's [profile documentation](https://doc.rust-lang.org/cargo/reference/profiles.html) describes the cross-crate optimization and compilation trade-off.

| Delivered artifact | Original bytes | Final bytes | Reduction |
| ------------------ | -------------- | ----------- | --------- |
| Raw WASM           | 1,310,697      | 1,003,124   | 23.5%     |
| gzip level 9       | 304,534        | 280,246     | 8.0%      |
| Brotli default     | 223,611        | 211,145     | 5.6%      |

| Isolated clean target | Cargo build (s) | Binding generation (ms) | WASM bytes |
| --------------------- | --------------- | ----------------------- | ---------- |
| default               | 14.79           | 92.50                   | 1,249,734  |
| thin                  | 18.88           | 64.89                   | 1,003,124  |

The isolated clean-build comparison is one sequential observation per profile, with registry/toolchain dependencies already installed and fresh target directories. Thin LTO adds about 4.1 seconds here. The isolated thin output reproduces the final package's complete SHA-256; both clean outputs are used for the separate profile experiment. Delivered-artifact size above refers to the refactor package tested by browser contracts and player flows.

## Evidence

[Download the compressed reproducibility bundle](2026-10-16-rust-idioms-and-performance-evidence.json.gz).

The bundle preserves raw measurements, probe sources/manifests, exact commands, validation logs, source/fixture/toolchain fingerprints and the implementation diff. Reapplying that task-owned patch over `995022a` reproduced all 50 changed files, after reversing only the private E2E-origin adaptation. Reproduction starts from the recorded baseline and sealed fixtures; absolute temporary paths in archived Rust modules must be rebased to the extracted audit directory. The shipped source remains ordinary safe Rust and the existing maintained binding toolchain.
