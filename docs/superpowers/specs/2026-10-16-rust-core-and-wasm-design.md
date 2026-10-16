# Portable Rust Sudoku Core and Browser WASM Migration

Date: 2026-10-16.

Status: Architecture approved by the user on 2026-10-16 with “ok，继续吧”. The user subsequently selected a new seed design and explicitly dropped old seed compatibility with “直接按这个新的来设计吧，老的不要了”. This revision replaces the original string-seed compatibility requirement. Production sources and dependencies remain unchanged at this stage.

## Outcome and evidence

Move Sudoku computation into a reusable, platform-independent Rust library. Put browser bindings in a separate Rust crate and run the web application against that WASM build. Preserve correctness, finite resource limits, stored facts and readable responsibility boundaries while establishing actual application performance. New generation uses an explicit byte seed and new generation identities; reproducing old string-seeded outputs is outside scope.

The recommended architecture is one Cargo workspace with two production crates: `sudoku-core` and `sudoku-wasm`. Native Rust callers depend directly on the core; the Vue application uses generated WASM bindings. Additional language bindings belong in future adapter crates when there is a concrete consumer.

The current engine at `7c95fb7832e614d4ee8d5089f69bac71d4886c36` has 58 production TypeScript files with source fingerprint `874a462db763ef6a3d0019badf35106b253d6e0c7f60614d259a03828a35df80`. Existing [organization verification](../verification/2026-10-15-sudoku-core-organization.md) records 2,241 deterministic generation comparisons and full assessment comparisons, plus 1,006 unit tests.

The [browser experiment](../verification/2026-10-16-wasm-core-benchmark.md) measured a weighted exact-count speedup of 3.41x in Chromium and 4.93x in WebKit, including per-board input/output copies. The experiment covers candidates and prepared exact counting, with 220 boards and 1,320 budget probes. It receives compiled topology from TypeScript. It does not establish the performance or correctness of Rust rule compilation, logical deductions, grading, generation, or production Worker integration. Those are migration deliverables, not capabilities already implemented by the prototype.

## Binding technology

Use `wasm32-unknown-unknown` and `wasm-bindgen` for the browser adapter. The tested Rust compiler is 1.98.0 and the tested binding library/CLI is 0.2.129. Pin the toolchain and keep the binding crate and CLI versions aligned in implementation.

Node-API, previously called N-API, is a native-addon API. NAPI-RS also supports browser WebAssembly through its documented WASI path; it is not correct to say that it cannot produce browser WASM. Its current generated workflow targets `wasm32-wasip1-threads`, with emnapi/WASI glue and cross-origin isolation for shared memory. This project requires a single-threaded portable computation library and an ordinary browser Worker, so that additional host compatibility layer is unnecessary. See [Node-API](https://nodejs.org/api/n-api.html) and [NAPI-RS browser WASM support](https://napi.rs/docs/concepts/webassembly).

If a later Node.js consumer needs a native addon, add `sudoku-napi` depending on the same core. A Rust server or command-line application requires no JS binding. Mobile or other-language consumers can receive their own focused adapter later; no particular mobile FFI or packaging mechanism is selected by this proposal.

| Approach                                                     | Assessment                                                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure Rust core plus a wasm-bindgen adapter                   | Recommended. Direct native reuse, a small browser boundary, and an already measured integration technology.                                                             |
| NAPI-RS as the browser and native binding layer              | Useful when a native Node addon and its WASI fallback are primary products. Introduces unnecessary runtime/deployment requirements for the current browser application. |
| Keep TypeScript orchestration and port only the exact solver | A possible optimization, but does not meet the requested ownership and reuse goals; generation, grading and rule semantics would remain split.                          |

## Workspace and dependency direction

```text
Cargo.toml                         # Workspace members and shared dependency policy
Cargo.lock
rust-toolchain.toml
crates/
  sudoku-core/
    src/
      lib.rs
      types.rs                     # Validated values and common outcomes
      board.rs
      budget.rs
      random.rs
      puzzle.rs
      editing.rs                   # Pure board/note edits, not session history
      rules/
      constraints/
      search/
      logic/
      rating/
      generation/
    tests/                         # Native contracts, independent facts and corpus tests
  sudoku-wasm/
    src/
      lib.rs                       # Named exported operations and lifecycle
      dto.rs                       # Serde/TypeScript boundary shapes
      conversion.rs                # Explicit checked domain conversions
src/
  sudoku/
    contracts.ts                   # Type-only surface over generated declarations
    guards.ts                      # Structural guards for untrusted JS/storage data
    wasmModule.ts                  # Module loading, version check and instantiation
    mainEngine.ts                  # Synchronous owned WASM adapter
  worker/
    sudoku.worker.ts               # Existing transport owner; calls WASM
    client.ts
    protocol.ts
  runtime.ts                       # Composition of main engine, worker and storage
```

The new `src/sudoku/` directory is the explicit owner of browser access to the Sudoku library, not a general service container. Existing feature, storage, worker and shared-presentation boundaries remain explicit. Update the architecture document and its lint policies when introducing this boundary.

`sudoku-core` owns all mathematical Sudoku behavior. It depends on neither the WASM crate nor JavaScript, browser APIs, Vue, timers, files, storage, operating-system randomness, or an async runtime. Use ordinary synchronous Rust APIs and owned domain data; callers decide where computation runs. Start with standard Rust rather than adding `no_std`, threading, or a generic plugin framework without a current requirement.

`sudoku-wasm` depends on the core and owns JS conversion, generated declarations, error translation, and binding object lifetime. It contains no solving, grading, random scheduling or variant rules. Do not move WASM-specific values or macros into core types. Use explicit conversion between boundary DTOs and validated domain types; conversion modules do not reproduce algorithms.

Within the core, retain the current dependency direction: values/rules, then constraint support, then exact search and human logic, then assessment, then generation. Hint composition can depend on logical solving and rating policy; the logical solver cannot depend on rating. Rule definitions cannot depend on generation. Keep one core crate with meaningful modules; these subsystems do not each require a crate.

## What moves and what remains

| Responsibility                                                                                                                      | Destination                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Board/rule validation, topology compilation, related cells, duplicate peers, candidate masks, constraints, conflicts and completion | Rust core                                      |
| Exact counting, reversible propagation, catalogue preparation/filtering and budget semantics                                        | Rust core                                      |
| Basic/advanced/variant deductions, logical workspaces, evidence validation and trace replay                                         | Rust core                                      |
| Rating policies, assessment, workload summaries and target screening                                                                | Rust core                                      |
| Seed hashing, random streams, terminal/geometry construction, candidate frontiers, scheduling and final acceptance                  | Rust core                                      |
| Pure Sudoku board edits and peer-note cleanup currently embedded in session actions                                                 | Focused Rust editing operations                |
| Sudoku semantics in saved-puzzle validation and lesson evidence checking                                                            | Rust validation APIs                           |
| Chinese names, rule text, hint explanations, violation text, SVG/layout and accessible labels                                       | Existing TypeScript presentation owners        |
| Session IDs, timekeeping, assistance counters, undo/redo history, routing, interaction and save-before-switch coordination          | Existing TypeScript session/application owners |
| Database transactions, backup format, leases, revisions, dataset epochs and broadcasts                                              | Existing storage owners                        |
| Worker request IDs, timeout/cancellation, version readiness, loading failures and disposal                                          | Existing browser transport/runtime owners      |

“Move computation” does not mean moving dates, browser state, database code or display formatting into the reusable library. A tiny helper that renders a candidate mask as digit labels may remain a presentation transformation. TypeScript must no longer infer candidates, prove completion, compile rule topology, detect techniques or independently decide Sudoku validity.

Pure board edits return owned board/note layers and derived facts. TypeScript installs those layers and records its existing history/assistance facts. Undo and redo restore their saved layers and ask the same Rust completion/analysis API for Sudoku facts. Keyboard, touch and hint application continue through the same named session actions. Do not pass an entire persisted game session into a generic WASM command interpreter.

Return structured violation codes and parameters from Rust. Existing TypeScript presentation reconstructs the current Chinese text, including current `RuleViolation` output where callers require it. Other platforms can format the same facts for their own interface. Keep mathematical evidence separate from its explanation.

Authored examples and lesson snapshots are data, not the generation fallback. Preserve their identities and provenance; Rust tests/generation can consume canonical fixtures without importing frontend teaching modules.

## Rust APIs, data and readability

Expose a small set of domain operations through their owning modules: rule preparation, board analysis/editing, exact counting, logical solving/proof validation, assessment/hints, and puzzle generation. A prepared puzzle/rule object supports repeated board probes. Public input and output types distinguish complete, stalled, invalid and budget-exhausted results; expected exhaustion is not an exception.

The core returns `Result` for invalid inputs or operational failures and typed outcomes for normal bounded work. Browser cancellation and elapsed-time timeout remain transport outcomes. A synchronous Rust solver cannot respond to a queued JS cancellation message while it is running; the existing per-job Worker termination mechanism remains the interruption boundary.

Apply these conventions:

- Use validated `Board`, `Digit`, `CellIndex` and `CandidateMask` types with clear constructors. A board uses an owned 81-cell array; candidates use a nine-bit `u16` mask. Keep raw external numbers outside valid domain objects until checked.
- Represent the existing internal 81-bit clue mask behind a `GivenMask` type, initially using `u128`. Never serialize it to JS or replace the whole candidate-explorer design for convenience. Measure this path because wasm32 code generation can differ from native.
- Keep variant rules as explicit enums and exhaustively match at dispatch boundaries. Do not introduce trait objects, macros or registries that conceal required variant capabilities and validation.
- Separate immutable prepared geometry/catalogues, mutable per-probe domains/trails, and owned returned solutions/evidence. Document borrowing, mutation, measurement units and incomplete outcomes where types do not express the whole contract.
- Prefer readable loops and named domain operations. Use iterators for simple transformations; do not force an involved search or accounting workflow into nested iterator chains to shorten it.
- Avoid broad context objects, excessive generics, unrelated abstractions and line-count-driven splits. Keep a complete workflow with its owner. No arithmetic or search callbacks into JS.
- Preserve meaningful paragraph breaks and explanatory comments for random order, branch restoration, budget charging, proof ownership and permitted transforms. Do not narrate obvious statements.
- Use `rustfmt`, Clippy, rustdoc for non-obvious exported contracts, and `#![forbid(unsafe_code)]` in the computation crate. The adapter uses generated bindings, with no handwritten pointer/allocator protocol.
- No `unwrap`, `expect`, panic-based validation or silent success-shaped defaults for untrusted input. Internal impossible-state assertions require an actual invariant; tests may use ordinary assertions.

Use established Rust library/API conventions from [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) and [Cargo workspaces](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html), rather than translating TypeScript object ownership literally.

## WASM contract and packaging

Use named typed operations rather than the experiment's numbered arrays or a stringly typed `execute(operation, payload)` API. Keep full generation and assessment loops inside Rust; one request must not repeatedly cross JS/WASM to run individual deductions, budget charges or catalogue lookups.

Use Serde with `serde-wasm-bindgen` for structured DTOs. Generate `.d.ts` from the DTOs with Tsify in its JS serialization mode. Reviewed documentation versions are serde-wasm-bindgen 0.6.5 and Tsify 0.5.8; implementation must pin and test the actual selected dependency set. Prefer fallible conversion inside exported functions, such as the current `Ts<T>` approach, rather than deprecated automatic ABI conversion attributes. [Tsify documents](https://docs.rs/tsify/0.5.8/tsify/) both type generation and the fallible conversion distinction; [serde-wasm-bindgen](https://docs.rs/serde-wasm-bindgen/0.6.5/serde_wasm_bindgen/) provides native JS value serialization.

The Rust DTOs are authoritative for the binding schema. Generated declarations are consumed through a type-only TS surface so feature/storage code does not import the WASM loader merely to import a type. Add contract snapshots and strict TypeScript consumer checks; generated types do not replace runtime validation.

Preserve existing public shape details: lowercase discriminators, field names, board/evidence numeric arrays versus typed arrays, omitted optional values versus `null`, evidence array ordering, and serializable result objects. The deliberate exception is a new generation request's `seed`, which becomes a 32-byte `Uint8Array`; persisted puzzle metadata remains a string as specified below. Internally using a typed array must not cause storage or Worker decoders to receive typed board/evidence arrays where they require plain arrays. Keep bounded public counters within JS safe integers. Internal masks or wide integers must not become accidental BigInt fields.

Use copies for normal 81-cell inputs and returned evidence. The experiment already demonstrates useful gains with copies; borrowed memory views and manual zero-copy ownership are not justified. Export an owned prepared class only where repeated probes actually need it; its TS owner calls the generated `free()` from `dispose()`. A wrapper owns its resource until disposed. Handles never cross WASM instances or Worker messages.

Version the browser bridge separately from `puzzleVersion` and `ratingVersion`. Read the bridge and algorithm identities during initialization, and reject mismatched JS/WASM assets before accepting jobs. Existing puzzle/session version fields are not repurposed as build IDs.

Build the generated JS, declarations and `.wasm` as one reproducible local package artifact. Vite and Worker imports use build-managed asset URLs. `pnpm dev`, production build, subpath build and CI prepare the artifact automatically; consumers should not manually copy files. Pin Rust, Cargo.lock, binding CLI and package dependencies. Do not commit generated binaries as the source of truth.

## Browser execution and synchronous callers

The current application does not have a Worker-only engine boundary. `features/game/model/session.ts` uses synchronous candidates/completion/peer-note rules; `useGameStore.ts` synchronously computes conflicts; `GameView.vue` derives related-cell highlights; `storage/records.ts` and `worker/protocol.ts` perform semantic puzzle validation; learning and hint validation also call engine code. A complete migration must replace these calls too.

Use two execution locations for the same generated WASM library:

1. A main-thread instance for existing synchronous bounded rule/puzzle validation, prepared topology metadata, board edits, completion, current live analysis and received-evidence validation.
2. An isolated per-job Worker instance for generation, assessment, hint search and heavy exact/logical computation, retaining the existing idle prepared Worker behavior and interruption semantics.

This does not duplicate Rust implementations. Instances have separate memory and request state. Cache one compiled `WebAssembly.Module` per application runtime and share that compiled code with Workers where supported, then instantiate independent memories. Modules can be shared with Workers and instantiated multiple times as described by [MDN](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Module). Verify the exact initialization path against the pinned wasm-bindgen output in root and subpath builds; do not assume shared code also shares memory or prepared handles.

`src/runtime.ts` composes the narrow main-engine, Worker and storage contracts. Stores and storage receive the operation they need; pure feature models receive explicit input/result data rather than importing a global WASM singleton. Shared components render owned metadata and values passed to them and remain independent of the browser engine/runtime.

Initialize the main engine before semantic decoding of persisted records and before enabling gameplay operations. Complete asynchronous download/compilation before entering an IndexedDB transaction. Synchronous semantic validation can then retain the existing transaction composition; never introduce an awaited Worker round trip inside a live transaction to replace `parsePuzzle`.

Every main-thread operation retains a finite budget. Arithmetic conflicts and candidate generation are not assumed cheap merely because their board has 81 cells. Measure their worst representative layouts and near-exhaustion cases as an interactive release gate. Heavy generation/rating/search are never invoked through the main-thread adapter. If a currently synchronous arithmetic operation cannot meet the interaction gate, stop that cutover and design a focused asynchronous action with board/revision fencing; do not silently reduce its budget or publish stale results. An async redesign is a separate explicit behavior decision, not a hidden consequence of changing language.

At Worker startup, complete a readiness handshake after WASM initialization. An idle Worker may compile/instantiate code but computes no puzzle. Keep the current three-second generation timeout and fifteen-second hint/assessment timeout; include actual startup and output-validation overhead in relevant deadline tests. Abort, timeout and response still settle once, terminate the per-job Worker and preserve existing save/transition behavior. Expected engine exhaustion remains distinct from transport failure and timeout.

Initialization/load failure becomes an explicit retryable application error with existing data preserved. Do not add a silent production TypeScript fallback or change the requested puzzle's identity. Main resources, prepared handles, module references, idle Workers and active jobs all have explicit owners and disposal paths.

## Byte seed and deterministic generation contract

The user selected a new seed contract without a legacy seed adapter. Separate binary seed values, version-owned stream derivation and textual persistence. Arbitrary JS strings and UTF-16 code units are not generation inputs.

### Seed representation and input boundaries

- The core owns `Seed([u8; 32])`, with `Seed::from_bytes([u8; 32])`, checked `TryFrom<&[u8]>`, and `as_bytes() -> &[u8; 32]`. Every 32-byte value, including all-zero and non-UTF-8 bytes, is valid. Reject other lengths; do not truncate, pad, decode text, normalize or silently hash malformed input.
- Native generation receives `Seed`. Browser/Worker generation receives an owned 32-byte `Uint8Array`. Use the ordinary wasm-bindgen byte-slice ABI, then copy into `Seed`; no borrowed input survives the call. Bindings expose `generate(seed: &[u8], options: Ts<GenerationOptionsDto>)`, with version, variant, difficulty and limits in the options DTO. The browser adapter assembles the existing named generation workflow around this typed operation.
- Free play obtains 32 bytes with browser `crypto.getRandomValues`; the reusable core never obtains entropy. Session IDs continue to use their existing independent ID source. A retry reuses the captured seed bytes, while a newly requested puzzle obtains a fresh seed. Copy bytes at request ownership boundaries so later mutation cannot change an in-flight identity.
- Daily selection still computes the Beijing calendar date in TypeScript. It passes the ASCII bytes of exactly `daily:YYYY-MM-DD` to `Seed::derive(material: &[u8])`, which uses `blake3::derive_key("sudoku 2026-10-16 root seed v1", material)`. Expose the same helper through WASM. Variant and difficulty separation occurs in the stage derivation below. Other hosts can provide raw seeds or explicitly derive seeds from their own byte material; the core does not choose a text encoding for them.
- Persist/share a new seed as exactly 64 lowercase hexadecimal ASCII characters, in byte order. Hex is a boundary representation: the WASM DTO converter emits canonical seed metadata; the browser codec validates/decodes it and formats raw request bytes where needed. Neither operation enters Sudoku algorithms. Only current-generation metadata is interpreted this way. Reject wrong length, non-hex characters, uppercase, whitespace and prefixes rather than repairing them. The public generation API accepts bytes, not a union of bytes and strings. This avoids a redundant seed-format discriminator; `puzzleVersion` already identifies the generation contract.

### Version-owned random streams

Use the maintained `rand_chacha::ChaCha8Rng` with its 32-byte seed, rather than hand-writing a new PRNG or selecting `StdRng`/`SmallRng` whose algorithm is not the reproducibility contract. Reviewed versions are `rand_chacha` 0.10.0, `rand_core` 0.10.1 and `blake3` 1.8.7. Pin the selected releases and lockfile; enable no OS entropy or threading features. BLAKE3's portable build must work on wasm32 without host services. See [ChaCha8Rng's documented state and seed](https://docs.rs/rand_chacha/0.10.0/rand_chacha/struct.ChaCha8Rng.html) and [BLAKE3 derive_key](https://docs.rs/blake3/1.8.7/blake3/fn.derive_key.html).

For each stream, derive a 32-byte key using BLAKE3 with context `sudoku 2026-10-16 streams sudoku-v11` for Classic or `sudoku 2026-10-16 streams sudoku-variants-v11` for the other variants. The material is exactly the following fixed-width concatenation; do not use JSON, Rust enum discriminants, platform endianness or an unspecified hasher:

```text
root_seed[32] || variant_tag[1] || difficulty_tag[1] || phase_tag[1]
              || layout_index_u32_le[4] || proposal_index_u32_le[4]
```

Tags are explicit: variants Classic/Diagonal/Jigsaw/Killer/Thermo/Arrow = 0/1/2/3/4/5; difficulties Easy/Medium/Hard/Expert = 0/1/2/3; phases Terminal/Geometry/Candidate = 0/1/2. Keep existing valid difficulty combinations and index meanings, including the actual layout numbering; reject out-of-range boundary integers. Initialize ChaCha8 with this derived key, stream identifier zero and word position zero. Each `next_f64()` consumes exactly one `next_u32()` and returns `f64::from(word) / 4294967296.0`. Retain descending Fisher–Yates with one draw per swap and `floor(random * (index + 1))`; do not substitute a library distribution/shuffle that may consume a different number of words.

The stream contract includes the algorithm, tags, framing, byte order, float mapping and draw ordering. Native and WASM must produce identical keys, words and complete generation outcomes. A later value-changing adjustment requires another generation identity, even if a dependency update otherwise compiles successfully.

### Version change, saved data and validation evidence

New generation uses `sudoku-v11` and `sudoku-variants-v11`; rating remains `sudoku-rating-v2` because its policy does not change. Reject v10 generation requests. Remove production UTF-16/FNV/Mulberry32 seed handling, lossless JS string wrappers and old-version generator dispatch. New daily puzzles may differ after cutover; an existing formal daily session/result keeps precedence by its unchanged formal ID.

Keep existing saved boards, entries, results, backups and historical seed/version metadata. Loading them validates their stored mathematical content without parsing the historical seed as hex, regenerating or regrading. The core's `Puzzle` is mathematical content (givens, solution, rules, difficulty); `GeneratedPuzzle` pairs that content with typed current generation identity and `Seed`. Storage's snapshot wrapper retains opaque historical metadata outside that core value. Current-version stored seeds must satisfy the new hex contract; older versions keep their existing nonempty metadata validation. Dropping the old generator does not require deleting player data or changing schema 1/format-2 records/format-1 backups.

Keep the frozen v10 reference only as test evidence for unchanged rules, search, logic, rating, budgets and historical performance. Its seeded puzzle payloads are not v11 expected results. For generation differential checks, adapt the test-only TypeScript reference to the specified v11 versions and byte-stream recipe using pinned maintained JS BLAKE3/ChaCha8 implementations, keeping other algorithms unchanged. Match raw words against Rust reference vectors before trusting this oracle; use a zero nonce/counter layout equivalent to the documented Rust stream, not a reseeding RNG wrapper. Check in a manifest of the precise test-only patch and dependencies. Establish fresh v11 results across 2,241 explicitly mapped byte-seed requests and independent rule/uniqueness/difficulty checks, then require native/WASM parity. Never produce new expected payloads from the Rust implementation being tested.

Report same-v11-recipe JS/native/WASM comparisons separately from historical v10 end-to-end timings. A changed random stream changes the work performed; old versus new throughput alone cannot attribute a difference to language or WASM. Measure derivation/RNG costs and artifact size as well as complete generation before accepting the new implementation.

## Preserved behavior requirements

Preserve mathematical/player behavior and resource semantics apart from the explicitly selected seed/generation-version change. Do not combine unrelated algorithm tuning with the port.

- Generate only `sudoku-v11` and `sudoku-variants-v11` under the new byte contract; preserve `sudoku-rating-v2`. Historical v10 requests are not regenerated. Further semantic changes need an explicit identity/version decision and fresh corpus validation.
- Preserve the 40-layout, 4,000,000-work and 500-step generation limits, the lower caller budgets, exact node allowance and work-by-stage meaning. Preparation and abandoned work remain charged; incompleteness never proves uniqueness or contradiction.
- Apply the byte/ChaCha8 stream contract above. Preserve generation draw-site ordering and shuffle policy apart from the deliberately replaced seed derivation/PRNG. Preserve first-solution ordering for identical search inputs.
- Preserve insertion/iteration order, stable tie handling, topology ordering and branch restoration. Never use unordered Rust map/set iteration to drive a deterministic choice. Maintain membership separately from order where needed.
- Preserve catalogue limits, overflow fallback, domain-dependent memo lifetime, prepared ownership, rule necessity, target screening, final assessment and accepted clue policies.
- Preserve all deduction technique IDs, policies, conclusions, owned evidence and complete successful traces. Keep independent advanced-proof validation separate from detection; basic/variant evidence keeps its current replay and clue-matching semantics. Do not replace the existing independent proof checks with detector replay or a stored-solution comparison.
- Preserve generated puzzle/assessment payload fields and exhaustion causes, with the specified seed representation/version changes. Worker job kinds and outcome envelopes remain; generation input seed validation and equality intentionally become byte-based. Binding initialization has a distinct control handshake rather than pretending to be a generation response.
- Preserve stored puzzle snapshots, format-2 sessions/results, format-1 backup behavior, database schema 1, historical daily identities, lesson IDs and absence/unavailability distinctions. Loading an old save validates its stored facts without regenerating or regrading it.

Canonical comparisons may normalize DTO field order and the new internal violation-code-to-Chinese mapping. They must not normalize away result status, omitted/null distinctions, evidence ordering, counters, original diagnostics or actual algorithm differences.

## Migration sequence

Implementation proceeds after architecture review. Stages build and verify the new engine without exposing a half-migrated production workflow.

| Stage                                                      | Deliverable                                                                                                                                          | Exit evidence                                                                                                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Freeze contracts and establish the workspace            | Reproducible baseline source manifest, independently checked canonical fixtures, public result/DTO contracts, two-crate workspace and build skeleton | Native and actual-browser binding smoke tests; malformed-input tests; generated TS declarations compile; no product dispatch change                                                        |
| 2. Port rules and exact computation                        | Owned rule decoding/compilation for all variants, candidates/conflicts/completion, budgets, editing, search and compiled support                     | Native/WASM differential results, exhaustive relevant fixtures, late exhaustion and mutation isolation; Rust no longer receives topology from TS                                           |
| 3. Port logical reasoning and grading                      | Workspace, basic/advanced/variant techniques, independent evidence validation, trace summaries, policies and screening                               | Full trace/evidence/work comparison; known-solution and adversarial-proof tests; malformed evidence rejection                                                                              |
| 4. Port generation completely                              | Byte seeds, versioned streams, terminals, geometry, clue frontiers, scheduling, target feedback and final acceptance all in Rust                     | All 2,241 mapped v11 requests match the updated test-only reference and full assessments; independent uniqueness/rule/diversity checks; no extra success-shaped fallback                   |
| 5. Switch the web application                              | Main-thread adapter, real Worker loading/readiness, persistence semantic validation, live board calls and lesson/evidence consumers                  | Root/subpath builds; real emitted WASM Workers; keyboard/touch/hints/notes/undo/redo/pauses/completion; restores/backups/daily/lessons; cancellation, deadline and failed-load regressions |
| 6. Verify performance and remove the old production engine | Repeatable native/browser/full-generation comparison, complete ownership/dependency documentation and cleanup                                        | Performance gates, Rust/TS checks, independent whole-change review, no production TS solver/rule compiler and no accidental old-engine bundle                                              |

The existing experiment is a reference for tested behavior and measurements, not a production module to copy wholesale. Its unbounded unpriced preparation, benchmark-only result arrays and exported topology transport must be replaced by the actual core contracts.

Keep the frozen TS implementation as a test-only oracle during migration, never as a production fallback. Keep original v10 evidence immutable and record the isolated v11 seed/version test adapter separately. Check in source manifests, selected full payloads/traces, and complete reproducible corpus identities/fingerprints needed by CI. Required verification must not depend on ignored `.superpowers/` scratch. Preserve independent reference solvers and adversarial fixtures; golden equality alone can reproduce an existing defect.

If independent checks expose a pre-existing correctness defect, record and resolve that defect explicitly before treating its output as a migration oracle. A reviewed bug fix and any required identity decision must be distinguished from the behavior-preserving port.

After cutover, retire the duplicate TypeScript engine from production and remove temporary differential scaffolding when its contracts are captured by maintainable fixtures and independent tests. Keep a reproducible baseline reference for performance audits. Independently useful JS reference algorithms remain test-only.

## Verification and release gates

Correctness is required before considering speed. Run Rust unit/contract tests, native and WASM parity checks, generated TypeScript consumer tests, all four existing TypeScript projects, ESLint, Prettier, root/subpath builds and affected real-browser flows. Run native tests without WASM dependencies enabled to demonstrate direct Rust reuse. Check that the core dependency graph contains no platform bindings.

Use fixed seeds and independently known facts. Compare full generation results and assessment traces, first solutions, work counters/stage totals and all incomplete outcomes. Add malformed rules/puzzles/binding inputs, invalid arithmetic evidence, repeated/disposed handles, response ownership and late-exhaustion regressions. Verify that old saves/backups are accepted or rejected exactly as before, and that importing data cannot bypass Rust semantic validation.

Record performance as distinct workloads:

- Prepared candidate/exact kernels, retaining the existing 171 timed boards and repeated-browser methodology.
- Complete generation for all 19 supported combinations with the same v11 byte-seed recipe on both sides, including ordinary exhaustion, preparation, grading, seed derivation and serialization; historical v10 timings are separate product diagnostics.
- Real Worker latency at both deployment roots, with cold and idle-prepared starts measured separately, including initialization, messages, decoding and evidence validation.
- Synchronous interactive operations on hard arithmetic layouts and near-budget inputs; capture event-loop blocking rather than just aggregate throughput.
- WASM/JS artifact size, initialization, peak/retained memory and repeated worker/job disposal.

Proposed engineering gates on the same reference host and browser versions are: at least 2x aggregate prepared exact-count improvement over the frozen JS baseline; no aggregate full-generation regression; investigation and resolution of any reproducible per-combination p95 regression greater than both 10% and 1 ms; every measured production generation request within the existing 3,000 ms deadline; and main-thread operation p95 below one 60 Hz frame with no representative operation exceeding 50 ms. These are release targets to verify, not results established by the kernel experiment or guarantees for all hardware. Do not change work/step/layout allowances to make a timing gate pass. If a gate fails, retain the existing production dispatch until resolved.

Use sequential paired measurements on otherwise idle hardware, report repeated samples and cold/warm conditions, and record source, fixture, artifact and toolchain fingerprints. Shared CI runners run correctness/deadline checks and publish diagnostics; machine-specific speedup decisions use the controlled comparison rather than flaky microbenchmark thresholds.

Firefox was unavailable on the current host during the experiment. Require Firefox verification on a functioning CI/runtime before claiming cross-browser release coverage. Touch emulation and physical-device evidence remain separate.

## Acceptance and subsequent planning

The migration is complete when the application uses Rust for all enumerated Sudoku computation, the core works natively without browser bindings, the WASM crate is a thin typed adapter, the v11 byte-seed contract is enforced, existing saved facts/player workflows remain intact, verification and performance gates pass, and the code reads as focused domain workflows.

Update `AGENTS.md`, Web Architecture, the variant-extension checklist, build/contributor instructions and CI as part of implementation. Variant extension must describe actual Rust registration, primitives, boundary validation, accessible presentation and verification. Generated artifacts and test-only oracles must remain outside production dependency paths.

After user review of this architecture, prepare the implementation plan with exact file-level tasks, fixture ownership and stage checks. That plan should preserve these boundaries while resolving any concrete future consumer requirement; no speculative Node/mobile adapter is required for the first delivery.
