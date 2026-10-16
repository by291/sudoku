# Adding a Sudoku Variant

Follow [Web Architecture](architecture.md) and the [portable engine design](superpowers/specs/2026-10-16-rust-core-and-wasm-design.md). Extend explicit typed definitions and existing primitives; do not introduce a general plugin framework or branches throughout the application.

## Registration locations

| Contract                                        | Owner                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Variant/rule payloads and prepared topology     | `crates/sudoku-core/src/rules/types.rs`                                                                          |
| Rule validation/compilation and units/peers     | `rules/definitions/`, `rules/context.rs`, `rules/topology.rs`                                                    |
| Arithmetic support, candidates and conflicts    | `constraints/`                                                                                                   |
| Exact propagation/counting                      | `search/`                                                                                                        |
| Stable technique IDs/actions and evidence       | `logic/techniques.rs`, `logic/types.rs`, detectors and evidence validators                                       |
| Difficulty support, policy order and statistics | `rating/policies.rs`, `rating/workload.rs`, `rating/decoding.rs`                                                 |
| Generation capabilities and geometry            | `generation/variant_strategies.rs`, `generation/variants/`, `generation/variant.rs`                              |
| Terminal/frontier/acceptance and budgets        | `generation/terminal_construction.rs`, `candidates.rs`, `search.rs`                                              |
| Version-owned seed tags/framing                 | `generation/random.rs`, `generation/types.rs`, `random.rs`                                                       |
| JS wire union/conversions                       | `crates/sudoku-wasm/src/dto/`, `conversion/`; regenerate rather than edit declarations                           |
| Frontend DTO contracts and shape/copy guards    | `src/sudoku/contracts.ts`, `values.ts`, `guards.ts`, `ruleInput.ts`, `generationInput.ts`, `catalogue.ts`        |
| Player-facing names and explanations            | `features/game/model/variants.ts`, `techniquePresentation.ts`, `violationPresentation.ts`                        |
| Accessible drawing and selected-clue text       | `shared/model/boardGeometry.ts`, `shared/components/`                                                            |
| Authored lessons and stable identities          | `features/learning/model/{lessons,lessonIds,variantExamples,variantTemplates,courseFragments,exerciseStages}.ts` |
| Independent fixtures and counters               | `tests/fixtures/`, `tests/support/referenceVariants.ts`, `tests/migration/`                                      |

## Existing primitives

1. Add an explicit Rust rule variant and wire DTO payload. Update exhaustive dispatch and complete frontend definition maps so missing registration fails compilation/tests.
2. Validate geometry at boundaries and compile it into complete nine-digit units, duplicate peers, related highlights and arithmetic/path constraints as applicable. These concepts are not interchangeable. Rule definitions must not import generation or their composition registry.
3. State supported difficulties, legal spatial/digit/complement transformations, terminal construction capabilities and necessity policy. Expert currently belongs only to Classic. Arithmetic sums generally prohibit arbitrary digit relabeling; Arrow forbids complement.
4. Add focused geometry construction and registration using the common bounded terminal/frontier workflow. Do not create an alternate clue-removal loop, fallback puzzle source, hidden work allowance or cache across requests.
5. Add frontend labels, rule text, accessible SVG/selection details and authored exercises. Shared presentation accepts DTOs and owned metadata; it cannot load WASM. Course construction receives explicit ready computation. Preserve historical lesson IDs/cursors and daily formal IDs.
6. Exercise actual root and subpath Workers, per-type free slots, daily precedence, pause/notes/history/hints/completion, old saves and local backups. Storage must validate content without regenerating or regrading historical facts.

## A new constraint primitive

Declare and measure the primitive’s live computation cost in `LiveComputationCost`; expensive enumeration must use the fenced Worker path without reducing its mathematical allowance. Implement and test exact local support, candidate masks, sound partial conflicts, full completion, reversible exact propagation/counting, explained logical deductions and direct evidence validation, rule/puzzle/Worker/storage boundaries and accessible drawing. Budget exhaustion is inconclusive; incomplete enumeration cannot remove a value or establish contradiction/uniqueness. Keep mutable domains, queues, trails, premises and support memos within a fresh board workspace. Static catalogues can be shared only with their immutable layout, and all discarded work remains charged.

Preserve the four-cell/512-tuple/8,192-layout catalogue limits and fallback behavior unless a separately reviewed versioned behavior change requires otherwise. A detector's search answer is not evidence. Advanced proofs must establish their unit, candidate, peer/fish/wing/strong-link premises directly. Authored teaching-state validation assumes independently proven earlier candidate eliminations and may choose a sound pattern other than the detector's first one.

## Generation and determinism

Current defaults remain 40 layouts, 4,000,000 shared work units and 500 logical steps, with a separate 6,561-visit regional terminal attempt cap. A terminal/geometry attempt consumes a layout slot before work, including partial failure. Preserve bounded checkpoint/novelty/proposal pools, target stopping, full-result completion, policy-prefix continuation and failed-charge accounting. A changed clue mask cannot reuse mutable candidate state. A known terminal proves existence, not uniqueness.

Use exactly 32-byte roots, stable explicit numeric tags, the version-owned 43-byte BLAKE3 phase frame and ChaCha8 draw order. Never hash JS text implicitly or derive generator seeds from UUIDs. Persist/share only canonical lowercase 64-character hex for v11. A recipe/tag/draw/acceptance change requires an explicit generation-version decision; do not silently update golden outputs. Old saved seed/version text is opaque and never passes through Rust string conversion.

Every delivered puzzle must pass validated content/identity, requested-tier assessment, clue policy, complete exact uniqueness with its terminal and variant necessity with the documented Jigsaw exception. Add independent structural/necessity/diversity evidence across all supported combinations, including more than digit/symmetry/given-mask variation. Add literal terminal/geometry/phase vectors and explicit layout/work/step exhaustion without delivery.

## Verification checklist

- Run `cargo fmt --all --check`, workspace tests, native/all-targets Clippy and wasm32 Clippy with warnings denied. Inspect `cargo tree -p sudoku-core -e normal` for platform dependencies.
- Run `pnpm typecheck`, lint/format, actual-WASM unit tests, root/subpath builds and affected player-oriented Playwright projects.
- Run native and supported-browser migration suites. Keep the sealed TypeScript oracle test-only; it cannot create expected results from Rust. Update fixtures only through an explicit independently reviewed source/version change.
- Preserve complete puzzles, evidence, rating traces, all work metrics and bounded outcomes during refactors. Identify reused independent evidence as reuse and require equal content fingerprints. New generation semantics need fresh independent validation.
- Check generation cancellation/timeout, readiness, result ownership/disposal and save-before-switch/epoch/revision/lease fences. Unavailable computation must not quarantine an otherwise valid save.
- Use `pnpm bench:core` for controlled-machine release timing: 171 retained kernels, all 2,241 v11 outputs, 19 combinations, exhausted/slow requests, emitted Workers at both roots, main-thread tails, startup and memory. Preserve existing work quotas. Investigate reproducible p95 regressions and report unavailable browsers explicitly.
