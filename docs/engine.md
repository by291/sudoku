# Engine architecture and deterministic contracts

All mathematical computation lives in [`sudoku/core`](../sudoku/core/README.md), a synchronous Rust library. [`sudoku/wasm`](../sudoku/wasm/README.md) owns typed browser conversion; [`android/ffi`](../android/ffi) owns UniFFI conversion. Neither client implements a replacement solver. Presentation, clocks, IDs, storage and resource scheduling remain client responsibilities.

The [algorithm guide](algorithms/README.md) explains constraint propagation, exact search, logical techniques, difficulty policies and puzzle construction, with source maps and research references. This document owns architecture, bounded execution and deterministic compatibility contracts.

## Native engine contracts

`types.rs` owns checked board/digit/cell/mask values. Boards contain 81 values in 0..=9; candidate masks use nine bits. `rules/types.rs` owns the explicit variant union, constraints and immutable prepared topology. Full nine-digit units, duplicate-exclusion peers, related highlights and arithmetic/path constraints are distinct concepts. Definitions do not depend on generation, assessment, storage or UI.

Dependencies flow from values/budgets and rules to constraints, search/logical deductions, rating and generation composition. `constraints/types.rs` owns prepared computation and owned result contracts. `search/exact.rs` is the counting boundary; propagation initializes fresh domains/queues/trails for every board and restores branches on every exit, including exhaustion. Returned solutions/evidence own their data. Logical deductions never obtain their justification from search guesses.

`hint.rs` owns hint results and `hint/validation.rs` owns complete chain replay. Logic owns `step_shape`, `step_validation`, independent `unit_evidence`/`advanced_evidence` proofs and authored `teaching` states; production code imports those contracts from their owner. Compatibility re-exports do not establish a dependency in the opposite direction. A logical workspace exposes read-only board/candidate access and `LogicalWorkspace::from_authored_candidates` for checked authored construction. Public `apply_step` validates every action before changing the workspace; callers still need a detector result or a proof validated against that same state. Structural action checks do not establish mathematical soundness.

All work consumes one caller-owned finite budget with explicit stage accounting. Abandoned layouts/catalogues, failed proposals and retries retain their charges. Incomplete support, search, preparation or generation never implies contradiction, zero solutions, uniqueness or successful delivery. Static layout data may be shared through immutable `Arc` ownership; mutable domains and domain-dependent caches cannot cross boards/requests.

Small Killer cages use complete ordered catalogues: at most four cells, 512 tuples per clue and 8,192 per layout. Capacity overflow discards partial preparation and uses bounded enumeration without a refund. Larger cages, arrows and thermometers use exact local support. A fresh logical workspace owns at most one complete effective-domain memo per cage; incomplete support is never cached. Exact counting and raw live operations retain their original work semantics.

Rating preserves actual technique priority. A stalled policy continues only when its priority order is a prefix of the next policy; otherwise it resets both state and trace. Reused steps count toward the policy limit. Successful trial completion owns and summarizes the original successful trace without another search or additional charged work. Optional stored assessments are validated, never regraded on restore.

Generation owns terminal construction, geometry, bounded mask frontiers, ranking, scheduling and final acceptance. Defaults remain 40 layouts, 4,000,000 shared work units and 500 logical steps. Regional terminal construction has a separate 6,561-visit local attempt cap. Retained frontier bounds, random draw order, work charges and permitted transformations are contract-tested. Complete-unit prefill requires digit-relabeling invariance and is not valid for arbitrary arithmetic variants. There is no authored-board fallback, hidden retry allowance or historical generator.

The scheduler delegates layout preparation and proposal evaluation to focused operations while retaining layout-slot and accumulated-work ownership. A pending proposal owns its parent even after frontier eviction. Prepared edit order binds its partition to one clue mask; an inherited sweep rebuilds that partition without another random shuffle. Accepted delivery, rejection, failure and exhaustion are distinct outcomes.

Every delivery validates terminal-consistent givens/rules/identity, exact requested difficulty, clue policy, completed assessment, exact uniqueness with the known terminal and variant necessity. For Jigsaw, a terminal invalid under Classic already establishes regional necessity; otherwise the check counts Classic solutions, as detailed in [generation acceptance](algorithms/generation.md#accept-only-a-complete-match). A known terminal establishes existence only. A changed clue mask starts a new workspace; stalled checkpoints have unknown uniqueness until counted.

## Seed and identity

Current generation versions are `sudoku-v11` and `sudoku-variants-v11`; rating remains `sudoku-rating-v2`. A root seed is exactly 32 arbitrary bytes. Web free play obtains fresh bytes from `crypto.getRandomValues`; request/retry workflows copy and retain that one seed independently of session UUIDs.

Rust derives daily roots from exactly ASCII `daily:YYYY-MM-DD`; each client chooses the Beijing date and stable formal ID. Existing formal attempts are looked up before deriving a new root. Status lookup does not invoke generation or hashing. New stored/share seeds are exactly 64 lowercase ASCII hex characters. Historical seed/version text, including unpaired UTF-16 code units, stays in JavaScript and never enters Rust mathematical content validation.

BLAKE3 contexts and the 43-byte phase frame are version-owned. Frame fields are root bytes, variant/tier/phase tags and little-endian layout/proposal counters. ChaCha8 starts at zero stream/word position; one u32 produces one random fraction and each descending Fisher–Yates swap consumes one draw. The stream recipe below and independent primitive/phase vectors pin the complete recipe. Reproducing old string-seeded puzzles is unsupported; saved boards/rules/progress/results remain authoritative.

## Random stream recipe

The root derivation uses BLAKE3 context `sudoku 2026-10-16 root seed v1`. For each stream, derive a 32-byte key using BLAKE3 with context `sudoku 2026-10-16 streams sudoku-v11` for Classic or `sudoku 2026-10-16 streams sudoku-variants-v11` for the other variants. The material is exactly the following fixed-width concatenation; do not use JSON, Rust enum discriminants, platform endianness or an unspecified hasher:

```text
root_seed[32] || variant_tag[1] || difficulty_tag[1] || phase_tag[1]
              || layout_index_u32_le[4] || proposal_index_u32_le[4]
```

Tags are explicit: variants Classic/Diagonal/Jigsaw/Killer/Thermo/Arrow = 0/1/2/3/4/5; difficulties Easy/Medium/Hard/Expert = 0/1/2/3; phases Terminal/Geometry/Candidate = 0/1/2. Keep existing valid difficulty combinations and index meanings, including the actual layout numbering; reject out-of-range boundary integers. Initialize ChaCha8 with this derived key, stream identifier zero and word position zero. Each `next_f64()` consumes exactly one `next_u32()` and returns `f64::from(word) / 4294967296.0`. Retain descending Fisher–Yates with one draw per swap and `floor(random * (index + 1))`; do not substitute a library distribution/shuffle that may consume a different number of words.

The stream contract includes the algorithm, tags, framing, byte order, float mapping and draw ordering. Native and WASM must produce identical keys, words and complete generation outcomes. A later value-changing adjustment requires another generation identity, even if a dependency update otherwise compiles successfully.

## Rating and generation

Production Workers call the pure Rust assessor through the isolated WASM adapter, using `sudoku-rating-v2` and default limits of 500 steps per policy and four million shared work units. No external rater or runtime service is required. Browser tests verify actual emitted workers against authored fixture grades, explicit unavailable outcomes, and request budgets at both deployment roots.

Generation defaults for all types and tiers are `{ maxLayouts: 40, maxWork: 4000000, maxSteps: 500 }`. Construction, uniqueness, assessment, and variant necessity share `maxWork`. Exhaustion returns an explicit failure without substituting an authored puzzle. Ready generation includes its accepted compact assessment, which Worker delivery reuses.

Versioned summaries carry the type, difficulty, and workload: steps, placements, eliminations, explicit candidate removals, all technique counts, highest technique/tier, and steps using variant evidence. Placement propagation is excluded from candidate-removal counts. A higher policy reuses the easier policy's workspace and trace only when its actual technique priorities retain that prefix; changed priorities reset both. The complete successful trace contributes statistics, and prior deductions count toward the same per-policy step limit. Completed boards have zero counts and null highest fields. No weighted numeric score is assigned.

Difficulty is the first supported policy that completes the puzzle, compared within its type: Easy/Medium/Hard for all variants, with Expert additionally supported for Classic. Rating does not prove uniqueness. Ungraded, exhausted, and invalid outcomes remain explicit. Sessions/results store compact assessment snapshots; restoring valid saved boards does not generate or regrade them. Missing, corrupt, unsupported, or mismatched metadata retains the existing explicit boundary behavior.

Classic and variants share a feedback-guided candidate explorer. Each layout owns a fresh complete terminal, rule geometry, prepared exact validator and target assessor. Candidate masks retain only terminal-consistent clues; bounded lower-tier and stalled frontiers explore removal, restoration and clue exchanges. Logical state never crosses clue masks. Static topology and bounded small-Killer-cage catalogues are reused within a layout; exact probes use reversible domain trails. Target screening stops at the requested policy, while delivery still requires a complete matching assessment, independent uniqueness, existing Classic clue caps and meaningful variant rules. All preparation, abandoned layouts and proposals consume the same original allowance. Reaching 40 layout attempts stops creation but permits remaining active frontiers to continue. No authored fallback, lower-grade substitute or background puzzle pool is used.

## Boundary and compatibility rules

Use checked types for untrusted board/digit/cell/mask inputs. Invalid input is distinct from unavailable execution and bounded incompleteness. Adapters use exhaustive, fallible conversion and return owned data; generated bindings are disposable build output.

The browser bridge is version 3 and the native bridge is version 2. These are transport versions, separate from generation and rating identities. Current live assessment issues are structured violations or diagnostic messages. Historical saved assessment strings remain opaque persisted text and are not reinterpreted by the adapters.

A prepared layout can be reused only under its documented identity and lifetime. Mutable workspaces and returned evidence cannot alias another request. Preserve cancellation lifetime, exact-search restoration, random-call ordering, stage charges and rating-prefix behavior during refactors. A structural deduction check is not a mathematical proof.

See [the variant checklist](variant-extension.md) for complete extension requirements and [the maintained migration tests](../tests/migration/README.md) for independent fixtures and commands. Expected outcomes must never be regenerated from the Rust implementation under test. Rust commands are documented in [the core README](../sudoku/core/README.md).
