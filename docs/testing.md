# Testing

Rust native tests own algorithm regression coverage. Web tests exercise application behavior and the real WASM boundary; small independent fixtures and mathematical validators provide evidence without maintaining a second production-sized engine.

## Responsibilities

| Layer                | Owners                                                                                      | Coverage                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Portable algorithms  | `sudoku/core/src` unit tests and `sudoku/core/tests`                                        | Rules, arithmetic support, exact search, deductions, assessment, seeded generation, work limits and invalid input |
| Independent evidence | `tests/fixtures/engine-contracts`, teaching fixtures and focused `tests/support` validators | Sealed expected facts, unique solutions, variant constraints and authored deduction proofs                        |
| Browser adapter      | `tests/e2e/wasm-contract.spec.ts`, `tests/browser`                                          | Actual generated bindings, malformed JS inputs, typed arrays, optional fields and owned outputs                   |
| Browser integration  | `tests/e2e/worker.spec.ts`, other Playwright workflows                                      | Real workers, cancellation and outcomes, startup, deployed asset paths, persistence and player interactions       |
| Web models and UI    | Colocated Vitest tests and `tests/*.test.ts`                                                | DTO validation, state transitions, component behavior and independent teaching checks                             |
| Android adapter      | `android/ffi/tests`, Android tests and `android/interop`                                    | Native boundary contracts, client behavior and portable backup interoperability                                   |

`tests/support/engine.ts` constructs fixtures through real Rust/WASM. Comparing two Rust-backed endpoints establishes consistency or transport fidelity, not independent mathematical correctness. Independent counters and proof validators must remain separate from these helpers. A trace checked against a known solution establishes conclusion safety; it does not establish that every cited premise proves the conclusion. Authored course proof checks and deduction-specific tests cover that distinction.

## Retained fixtures and provenance

The engine fixture manifest records each retained file's SHA-256, size and available case count. `tests/engine-fixtures.test.ts` checks these values. Twelve original fixture files remain byte-for-byte unchanged: rules, validation, geometry, random primitives, exact search, prepared exact search, arithmetic support, logic, advanced logic, assessment, hints and hint chains.

`generation.json` contains 59 selected historical cases:

- One successful request for each of the 19 supported variant/difficulty combinations.
- The `hard058:0` regression and the high-work Killer Hard case `full:807`.
- Exact-work and one-short boundary pairs for all 19 combinations.

Each selected row keeps its original source and ID. Its `input` is unchanged; `expected` is the original `expected.result`, without the redundant standalone assessment trace. Native tests pin puzzle identity, output, assessment summary and work accounting, and also check repeatability, uniqueness, variant necessity, explicit exhaustion and logical conclusions against the sealed solution.

The manifest identifies the historical reference commit, recipe hashes, independent crypto libraries and the archive commit `1de504094cccb62a1034d32321b2d490f62e46eb`. Full historical corpora and their construction scripts are available from that Git revision. Source filenames in the manifest, generation rows and copied Android fixtures are provenance labels, not runtime dependencies. For example:

```sh
git show 1de504094cccb62a1034d32321b2d490f62e46eb:tests/fixtures/engine-contracts/manifest.json
```

The sealed teaching fixture has its own hash assertion in `tests/teaching-contracts.test.ts`. Authored variant templates remain static data in `tests/fixtures/variantTemplates.ts`. The independent BLAKE3/ChaCha8 helper in `tests/support/independentRandom.ts` preserves test seed derivation and published-vector checks.

## Compatibility and changes

Preserve existing version-owned seeds, puzzle identities, random-call order and budget accounting. A deliberate incompatible algorithm change requires an explicit version and compatibility decision. Do not refresh expected results from the Rust implementation to make a regression pass. Establish new expected facts independently, document their provenance and update fixture hashes only after reviewing the intended change.

Add focused Rust regressions for algorithm changes. Add WASM or worker tests when the changed contract crosses those boundaries. Keep browser coverage centered on conversion, ownership and player behavior rather than replaying every native algorithm case. The retired TypeScript engine, full migration comparison runners and fixture-generation tooling are intentionally absent.

## Commands and CI

```sh
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo clippy -p sudoku-wasm --target wasm32-unknown-unknown --locked -- -D warnings
cargo tree -p sudoku-core -e normal
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
pnpm build
pnpm build:subpath
PLAYWRIGHT_USE_PREBUILT=1 pnpm test:e2e
```

`pnpm test:rust` runs the native workspace suite and is the first step of `pnpm check`. The package commands rebuild WASM before checking frontend consumers. The normal core dependency tree must remain free of browser bindings, async runtimes and OS entropy dependencies. CI runs native checks first, then Web checks and builds, followed by Chromium desktop/mobile, Firefox and WebKit jobs using the verified build artifacts. Browser jobs retain the WASM contract suite; there is no separate full-engine comparison job.

For setup, browser installation and disposable test output locations, see [development](development.md). For Android checks and the opt-in backup reimport test, see [Android build](android/build.md).
