# Rust and WASM Guidelines

These rules supplement the [repository guidelines](../AGENTS.md) for `sudoku/`. The root guide also directs `android/ffi` Rust work here; Android packaging and device rules still apply there. Use [Engine](../docs/engine.md), [algorithms](../docs/algorithms/README.md) and [testing](../docs/testing.md) for the changed contract.

## Computation boundaries

- Keep reusable synchronous computation in `core`, typed browser conversion in `wasm`, native conversion in `../android/ffi`, and browser ownership/dispatch in `../src/sudoku` and `../src/worker`.
- Core must not depend on Vue, JS/WASM bindings, browser APIs, storage, clocks, OS entropy or an async runtime. Keep ABI workarounds in adapters; forbid unsafe application code.
- Under `core/src`, rule definitions belong in `rules/definitions/`, arithmetic support in `constraints/`, exact counting in `search/`, deductions/evidence in `logic/`, assessment in `rating/`, and geometry/frontier/scheduling in `generation/`. Lower layers must not import generation.
- Import native contracts from their explicit owner (`types.rs` or subsystem `types.rs`). Keep Chinese technique/violation presentation in client models, not computation or transport.
- Compile variant rules into shared primitives where possible. State permitted transformations, fallback requirements, version/seed identity and difficulty policy. Preserve the root guide's deterministic work and compatibility contracts; do not add legacy string-seed adapters.

## Types, state and public APIs

- Use checked board/digit/cell/mask values and keep each variable's domain meaning stable. Group fields that appear/disappear together into one optional record; use enums for exclusive modes/outcomes instead of correlated booleans.
- Keep immutable prepared layout data separate from mutable workspaces and owned returned evidence. A workspace with coupled board/candidate/premise/cache invariants needs read-only access and explicit validated mutations, not public mutable fields.
- Prefer private or `pub(crate)` implementation details. Public fields are appropriate for passive data. Review native callers before tightening a public API.
- Validate untrusted values fallibly before mutation; errors must not leave partially applied actions. Internal assertions must follow established invariants. A structurally checked deduction is not automatically a mathematical proof.
- Keep platform conversions explicit and exhaustive, preserve boundary-validation order and return owned data. Derive catalogue completeness from its owner rather than duplicating counts.

## Readability and evidence

- Keep orchestration with its domain owner and extract coherent private operations. Use straightforward control flow for search and accounting; iterators are useful for simple transformations. Apply the root guide's logical blank lines as well as rustfmt.
- Rustdoc explains borrowing, ownership, mutation, cancellation lifetime, identity comparisons, units, incomplete outcomes and relevant `Errors`/`Panics`. Link related contracts instead of repeating them on every accessor.
- Name version-owned exploration limits. Explain deterministic ordering, budget charges, abandoned work, queue priority and restoration immediately beside the operation.
- Preserve independent proof validators and sealed fixtures. Public-boundary regressions exercise malformed input and observable atomicity; private extraction/formatting alone needs no mirror tests. Never refresh independent expected results from Rust to make a test pass.

## Verification

Run from the repository root for Rust source, dependency or public-contract changes:

```sh
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo clippy -p sudoku-wasm --target wasm32-unknown-unknown --locked -- -D warnings
cargo tree -p sudoku-core -e normal
```

The normal core dependency tree must remain free of browser bindings, async runtimes and OS entropy dependencies. `core/src` unit tests and `core/tests` own algorithm regressions; selected independent evidence and adapter tests have the roles documented in the testing guide.

Rebuild WASM with `pnpm wasm:build` before directly testing frontend consumers; the normal typecheck/unit/build scripts do this automatically. Exercise relevant WASM/worker contracts for boundary changes and Android native contracts for FFI changes. `wasm` also owns the private `@sudoku/wasm` workspace package; generated JS/WASM/declarations stay in ignored `wasm/pkg/`. Never hand-edit generated bindings.

Consult the official [Rust Style Guide](https://doc.rust-lang.org/style-guide/), [API Guidelines](https://rust-lang.github.io/api-guidelines/), [rustdoc](https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html) and [Clippy](https://doc.rust-lang.org/clippy/usage.html) when introducing unfamiliar APIs or conventions. Setup details remain in the [core README](core/README.md) and [WASM README](wasm/README.md).
