# Web Architecture

The [product design](superpowers/specs/2026-10-11-sudoku-design.md), [variant design](superpowers/specs/2026-10-11-sudoku-variants-design.md), and [portable engine design](superpowers/specs/2026-10-16-rust-core-and-wasm-design.md) define behavior. [AGENTS.md](../AGENTS.md) defines development conventions; [Adding a Sudoku Variant](variant-extension.md) lists concrete extension points.

## Owners and dependencies

```text
sudoku/
  core/src/{types,board,budget,random,rules,constraints,search,editing,logic,rating,generation,hint,puzzle}
  wasm/src/{dto,conversion,prepared}
packages/sudoku-wasm/pkg/        # Generated and ignored
src/
  main.ts, App.vue, ReadyApplication.vue, runtime.ts
  sudoku/{contracts,values,catalogue,seed,generationInput,ruleInput,puzzleSnapshot}
  sudoku/{wasmModule,mainEngine,workerEngine,lazyComputation}
  layouts/, router/, theme/, styles/
  shared/{components,composables,model,utils}/
  features/
    home/{views,composables}/
    game/{views,components,composables,model,stores}/
    learning/{views,composables,model,stores}/
    records/{views,components,model,stores}/
    settings/{model,stores}/
  storage/, worker/
```

| Owner                                                      | Responsibility                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `sudoku/core`                                              | Reusable synchronous Rust computation, with no browser, JS, Vue, storage, clock, entropy source or async runtime |
| `sudoku/wasm`                                              | Typed fallible conversion and owned WASM handles; no application policy or database behavior                     |
| `src/sudoku/contracts.ts`                                  | Type-only aliases of generated DTOs and explicit frontend envelopes; read-only mapping preserves tuples          |
| `src/sudoku/values.ts`, `catalogue.ts`                     | Scalar shape guards, technique IDs and presentation capabilities; no solving or WASM initialization              |
| `src/sudoku/seed.ts`, `generationInput.ts`, `ruleInput.ts` | Owned request assembly, strict byte/hex identity, rule DTO copies                                                |
| `src/sudoku/wasmModule.ts`                                 | Vite-managed binary download and compilation                                                                     |
| `src/sudoku/mainEngine.ts`                                 | Ready, scoped, bounded live edits/notes/conflicts/completion/review and synchronous semantic validation          |
| `src/sudoku/workerEngine.ts`, `worker/`                    | Isolated heavy generation, assessment and hints; readiness, cancellation, deadlines and response validation      |
| `App.vue`, `main.ts`                                       | Bootstrap and publish the ready runtime at application scope before any business store is constructed            |
| `ReadyApplication.vue`, `runtime.ts`                       | Theme/providers, shared service composition and final save-before-dispose lifetime                               |
| `layouts/AppLayout.vue`, `router/`                         | Navigation, stable course-ID metadata, hash routing, skip link and page landmarks                                |
| `shared/`                                                  | Controlled board/number-pad/dialogs, accessible drawing, display-only mask formatting and keyboard ownership     |
| `features/game/model/`                                     | Session layers/history/assistance, clocks, daily policy, names and explanations                                  |
| `features/game/stores/`                                    | Player actions, prepared-layout lifetime, persistence/save queue and fenced transitions                          |
| `features/game/composables/`                               | Route entry, keyboard/touch ownership, lifecycle listeners and route-leave behavior                              |
| `features/learning/`                                       | Authored 32-course data, structural catalogue decoding, exercise flow and progress                               |
| `features/records/`, `settings/`                           | Stored-fact aggregation, backups, confirmed local-data controls and preferences                                  |
| `storage/`                                                 | Validated records, IndexedDB transactions, editing leases, revisions, epochs and broadcasts                      |

Features compose their own workflows. Shared presentation cannot load an engine or import feature state, storage, workers or runtime. Pure models receive computation through narrow contracts rather than loading WASM. Browser services consume persisted models, never feature views/stores or application presentation. `runtime.ts` is the composition owner; there is no generic infrastructure container.

Shared presentation composables own only generic UI lifetimes, such as cancellable delayed progress feedback. `ResponsiveDialog` retains Naive UI's modal ownership while adapting its card to a narrow-screen sheet. Records owns completed-result viewing and reads validated result snapshots; historical viewing does not enter the editable game-session workflow.

Source imports use `@/`; Worker asset URLs stay literal and relative. Contracts come from their explicit owner, rather than an operation facade. ESLint checks static and dynamic imports, prohibits uninspectable dynamic paths and rejects production imports of retired/reference engines. Tests also check the browser engine's runtime import graph for cycles. The sealed TypeScript reference is test-only under `tests/reference`; only test configuration resolves `@reference/` and its original internal aliases. Normal production builds contain no TypeScript rule compiler, solver, rater or generator.

## Native engine contracts

`types.rs` owns checked board/digit/cell/mask values. Boards contain 81 values in 0..=9; candidate masks use nine bits. `rules/types.rs` owns the explicit variant union, constraints and immutable prepared topology. Full nine-digit units, duplicate-exclusion peers, related highlights and arithmetic/path constraints are distinct concepts. Definitions do not depend on generation, assessment, storage or UI.

Dependencies flow from values/budgets and rules to constraints, search/logical deductions, rating and generation composition. `constraints/types.rs` owns prepared computation and owned result contracts. `search/exact.rs` is the counting boundary; propagation initializes fresh domains/queues/trails for every board and restores branches on every exit, including exhaustion. Returned solutions/evidence own their data. Logical deductions never obtain their justification from search guesses.

All work consumes one caller-owned finite budget with explicit stage accounting. Abandoned layouts/catalogues, failed proposals and retries retain their charges. Incomplete support, search, preparation or generation never implies contradiction, zero solutions, uniqueness or successful delivery. Static layout data may be shared through immutable `Arc` ownership; mutable domains and domain-dependent caches cannot cross boards/requests.

Small Killer cages use complete ordered catalogues: at most four cells, 512 tuples per clue and 8,192 per layout. Capacity overflow discards partial preparation and uses bounded enumeration without a refund. Larger cages, arrows and thermometers use exact local support. A fresh logical workspace owns at most one complete effective-domain memo per cage; incomplete support is never cached. Exact counting and raw live operations retain their original work semantics.

Rating preserves actual technique priority. A stalled policy continues only when its priority order is a prefix of the next policy; otherwise it resets both state and trace. Reused steps count toward the policy limit. Successful trial completion owns and summarizes the original successful trace without another search or additional charged work. Optional stored assessments are validated, never regraded on restore.

Generation owns terminal construction, geometry, bounded mask frontiers, ranking, scheduling and final acceptance. Defaults remain 40 layouts, 4,000,000 shared work units and 500 logical steps. Regional terminal construction has a separate 6,561-visit local attempt cap. Retained frontier bounds, random draw order, work charges and permitted transformations are contract-tested. Complete-unit prefill requires digit-relabeling invariance and is not valid for arbitrary arithmetic variants. There is no authored-board fallback, hidden retry allowance or historical generator.

Every delivery validates terminal-consistent givens/rules/identity, exact requested difficulty, clue policy, completed assessment, exact uniqueness with the known terminal and variant necessity, with the existing Jigsaw exception. A known terminal establishes existence only. A changed clue mask starts a new workspace; stalled checkpoints have unknown uniqueness until counted.

## Seed and identity

Current generation versions are `sudoku-v11` and `sudoku-variants-v11`; rating remains `sudoku-rating-v2`. A root seed is exactly 32 arbitrary bytes. Free play obtains fresh bytes from `crypto.getRandomValues`; request/retry workflows copy and retain that one seed independently of session UUIDs.

Rust derives daily roots from exactly ASCII `daily:YYYY-MM-DD`; JavaScript chooses the Beijing date and stable formal ID. Existing formal attempts are looked up before deriving a new root. Status lookup does not invoke generation or hashing. New stored/share seeds are exactly 64 lowercase ASCII hex characters. Historical seed/version text, including unpaired UTF-16 code units, stays in JavaScript and never enters Rust mathematical content validation.

BLAKE3 contexts and the 43-byte phase frame are version-owned. Frame fields are root bytes, variant/tier/phase tags and little-endian layout/proposal counters. ChaCha8 starts at zero stream/word position; one u32 produces one random fraction and each descending Fisher–Yates swap consumes one draw. The design document and independent primitive/phase vectors pin the complete recipe. Reproducing old string-seeded puzzles is unsupported; saved boards/rules/progress/results remain authoritative.

## WASM readiness and ownership

`pnpm wasm:build` builds locked Rust/WASM, installs the pinned wasm-bindgen CLI if needed, and emits JS/WASM/declarations into the ignored workspace package. A build-time TypeScript compiler transform wraps self-contained generated glue in a collectable factory. Each instance owns separate memory; compiled immutable code can be shared. There is no source evaluation, handwritten pointer protocol, raw-memory alias or browser-side fallback solver.

App constructs browsing services after initial route resolution without downloading WASM. Pinia 4.0.3 resolves store injections through the Vue application context, so `main.ts` publishes the runtime with an application-level provider before mounting `ReadyApplication.vue`. Runtime readiness means services are available; `ensureEngine()` separately shares the lazy module download, validation and initialization. Failed initialization is retryable, and a late initializer disposes its engine after shutdown.

Game operations and full persisted-record validation await engine readiness before using synchronous computation. Summary browsing, course directories and guided content require no engine. The lazy Worker client copies caller-owned inputs before waiting for initialization and supports cancellation during that wait. Initial route retry restarts navigation before waiting again. Game leave guards identify the target navigation, and a scope-owned resolve guard pauses/saves only after that target's page is loaded. Cancelled targets cannot pause the current game while their page downloads finish.

`useGameLifecycle` also guards session-changing route updates, including lesson-practice query exits, while excluding URL synchronization for an already installed session. `prepareLeave` uses the existing fenced transition and persistence contracts to block navigation on save failure. The view retains an inert outgoing presentation while saving; completion, cancellation, and route errors release it only for the relevant target. Hidden/pagehide events immediately clear this hold and conceal the board. Browser shutdown remains best effort.

Main-engine prepared layouts return independent metadata/results and reject calls after disposal. The game store owns one layout per puzzle identity, reuses it through moves and releases it once on replacement/drop/disposal. The main facade exposes no exact search, generation, assessment or hint search. Heavy jobs use separate Worker instances/memory and share only compiled code.

Bridge version 2 exposes summary-only assessment for production Workers. The core still computes the complete trace required for grading and workload, but the adapter omits trace conversion and serialization when the caller only needs the summary. Full assessment remains a separate named export with unchanged trace/work semantics. Rust adapters can borrow immutable prepared metadata to construct the final owned DTO directly; JavaScript never borrows the prepared layout's memory.

The client sends initialization before a job and validates readiness/version identity. Original deadlines include remaining Worker initialization: 3,000 ms for generation and 15,000 ms for hints, assessment and live analysis. Cancellation/timeout terminates the owner; late replies cannot revive it. One next idle Worker may initialize, but never precomputes a puzzle. Requests copy seed/board/rule data before awaits; incomplete, cancelled, failed and completed outcomes remain distinct.

Rust classifies live computation cost exhaustively by constraint primitive. A Killer cage larger than four cells is conservatively heavy; the main facade rejects full candidates/conflicts/generated notes for that layout. It offers a zero-arithmetic-work sound conflict preview, while focused Worker jobs retain exactly 1,000,000 action work units and separately report bounded layout preparation. Exhaustion is incomplete analysis, never validity.

Live conflicts own a separate abort generation keyed by puzzle/board/editability. Heavy notes capture puzzle/session identity and layer revision; edits, history, pause, ownership loss and reset cancel them. Clock/selection and assistance-only updates do not restart conflicts or invalidate notes. Only a current complete note result commits through the same atomic history/assistance function. Pending and failed states have explicit Chinese feedback; duplicate note requests are disabled. See the [approved live-analysis design](superpowers/specs/2026-10-16-async-live-analysis-design.md).

## Player facts and storage

Rust edits return owned entries/notes and board facts. TypeScript commits independent before/after layers, preserves assistance as a permanent attempt fact, and retains redo only when no board change occurred. Undo/redo restore layers and ask Rust for completion. Keyboard, touch and hint application use the same actions. Clock, selection, session IDs, assistance counters, records/statistics and UI feedback remain frontend responsibilities.

`sessionPersistence.ts` owns save serialization, dirty snapshots and lease/revision handling. `sessionTransitions.ts` owns operation generations, cancellation, save-before-switch ordering and install/restore flows. Immutable snapshots and epoch/ownership/revision captures stay on the original side of every await. A peer reset/import invalidates stale workflows; an old write cannot adopt a new dataset's lease. First memory-only play cannot silently overwrite a recovered save.

Storage writes format-2 records and normalizes independently validated format-1 Classic records. Layer/history chains, mode metadata, daily formal eligibility, original completion facts and first-result retention remain validated. Mathematical puzzle/completion and rated-summary semantics use injected ready synchronous validators; there is no await or Worker round trip in an IDB decoding transaction. Budget exhaustion or validator failure aborts as unavailable and never quarantines/deletes inconclusive data. Corrupt optional assessments become explicit unavailability without discarding a valid game.

IndexedDB schema v2 adds derived session/result summaries and compound indexes. Canonical records and projections change atomically; portable backup/session formats remain unchanged. Home reads counts, setup reads one slot or today's formal IDs, records queries detailed content only for the active tab/filter, and detail/resume reads one canonical record. Records navigation additionally counts all six variants through result-summary indexes in one readonly snapshot, without reading canonical boards or initializing computation. Summary pages contain at most 30 rows ordered by descending time and ascending ID; cursors carry filters, dataset epoch and projection generation. Views retain one page and reset incompatible cursors rather than mixing snapshots. Per-variant overview walks compact result summaries, never full boards/history.

Schema upgrades do no mathematical work. Legacy coverage stays pending until explicit cancellable maintenance validates one owned payload at a time and fences each repair against concurrent writes/reset. Unavailable computation preserves original records. Unknown counts/progress remain distinct from zero, and unknown slot presence cannot authorize replacement. Missing targeted projections invalidate coverage for repair without scanning unrelated payloads. Asynchronous readiness always finishes before semantic-validation transactions open.

Backups validate the entire bounded file before preview/replacement. The records page exposes import/export directly; a valid file expands an inline preview and explicit replacement confirmation. Import replaces player collections atomically under the preview's expected dataset epoch, clears leases/quarantine and increments the epoch. Export captures one committed readonly snapshot and reports excluded invalid records. Existing limits, save failures, cross-tab races and reset fences remain unchanged.

Shutdown keeps semantic validation alive until the final leave/save settles, then terminates Workers, releases ownership, disposes main memory and closes storage. Every lifetime is idempotent.

## Teaching, presentation and verification

`scripts/validate-lesson-catalogue.ts` generates a lightweight typed directory and 32 separate lazy lesson modules from one authored source. Its mandatory Vite production-build gate validates every guided and exercise stage with Rust/WASM, rejects invalid or incomplete outcomes, and bundles the exact verified source snapshot. The learning store decodes only requested content, keeps at most three decoded lessons, and fences stale selections. Directory metadata and guides do not wait for personal progress; exercise submission/advancement still requires durable progress readiness. Pending content preserves the page regions used by the loaded lesson.

Runtime guards retain explicit DTO shapes, ranges, answer consistency, and owned copies. Rust remains responsible for candidate-relative evidence validation in the build and independent contract tests; storage and backup mathematical validators are unchanged. Authored arrays, explanations, answers and course IDs remain teaching/presentation data. Prior candidate eliminations are an explicit precondition of an authored state; independent course proofs establish them. Teaching may choose any sound unit pattern; live hints retain ordered replay and direct advanced-proof validation. Progress cursors remain epoch-fenced settings facts; final committed lesson completions and full-board practice have independent lifetimes.

Chinese technique/violation text belongs to game presentation; shared board drawing consumes DTOs and owned metadata. Display-only digit/mask formatting cannot infer candidates or Sudoku validity. A new primitive must support candidates, conflicts, completion, exact counting, deductions/evidence, validation and accessible drawing together.

Native tests and 5,742 sealed migration comparisons cover full math/work/random contracts. Available browser bindings run 4,262 complete comparisons each, including all 2,241 v11 puzzles and 152 budget cases; independent counters and literal evidence provide separate oracles. Player/storage/lesson tests run actual WASM. The [release audit](superpowers/verification/2026-10-16-rust-core-migration.md) records artifact/toolchain hashes, full-generation and 171-board performance, startup/memory, supported-browser limitations and source-equivalent evidence reuse. Controlled-machine timing is separate from CI correctness/deadline checks. Never count an unavailable browser as a pass.
