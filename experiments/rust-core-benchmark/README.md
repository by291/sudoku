# Rust Sudoku Core Performance Experiment

This independent experiment compares the current TypeScript engine with an idiomatic Rust port of its candidate calculation and prepared exact solution counter, running natively and as browser WebAssembly. It does not change application dispatch, Workers, generation, rating, or saved data.

## Scope

The port covers all six variants through the same compiled topology: Classic, Diagonal, Jigsaw, Killer, Thermo, and Arrow. It preserves singleton propagation, full-unit digit coverage, arithmetic support enumeration, small-cage catalogues and their fallback policy, minimum-domain branching, ascending digit order, reversible domains, and inconclusive exhaustion. Unit and constraint queues preserve JavaScript `Set` insertion order. The catalogue limits remain 512 tuples per cage and 8,192 per layout.

The TypeScript rule compiler supplies topology before timing. Rust validates the exported shape and prepares memberships and its own cage catalogues. This is **prepared computation**, not a port or benchmark of rule decoding/compilation. Rust preparation is unbounded and unpriced outside timing; each measured search retains the TypeScript query work charges exactly.

Rust uses fixed-size numeric arrays, integer population counts, and FIFO queues with membership flags. TypeScript executes the actual production functions, including their arrays, `Set`s, closures, candidate digit arrays, and runtime budget validation. The comparison therefore measures these two implementations of the same algorithm and traversal, not a language-only constant independent of representation choices.

## Reproduce

Requirements: the repository's Node 26 and pnpm environment, and Rust/Cargo with edition 2024 support. Reviewed versions are recorded in the result. The native experiment uses pinned Serde dependencies only for fixture and result transport; they do not enter timed computation. The WASM target additionally uses pinned wasm-bindgen bindings.

From the repository root:

```sh
node experiments/rust-core-benchmark/run.mjs
```

The command generates and independently validates the corpus, runs the release Rust contract suite, builds the native executable, then measures both implementations sequentially. Cargo runs offline, so the pinned crates must already be cached. If needed, fetch them once before the measurement:

```sh
cargo fetch --manifest-path experiments/rust-core-benchmark/Cargo.toml
```

These commands separate corpus preparation from repeated measurement:

```sh
node experiments/rust-core-benchmark/run.mjs prepare
node experiments/rust-core-benchmark/run.mjs measure
```

Regenerate the corpus after modifying the engine. Build artifacts, generated fixtures, and raw results live under the ignored `.superpowers/rust-core-benchmark/` directory. No frontend dependency, package script, or production CLI is added.

## Correctness and corpus

The timed corpus has 171 uniquely solvable puzzles: 19 existing authored difficulty fixtures and eight fixed generated seeds per supported variant/difficulty combination. Classic has 36 inputs; each other variant has 27. Seeds are `rust-core-benchmark-v1:000` through `rust-core-benchmark-v1:007`, under the engine's current generation identities. Generation time is excluded.

The contract corpus additionally covers solved, empty, directly contradictory, and unsatisfiable boards; each variant's one-hole fixture; nine-cell Killer catalogue fallback; and clue removals and direct contradictions for every authored difficulty. The existing independent reference solver checks solution counts for all 220 inputs, and checks the exact known completion for all delivered puzzles. This solver does not share production topology compilation or constraint propagation.

Six probes per board compare Rust against TypeScript for the entire result: completion/exhaustion status, count, first solution, nodes visited, and work used. Probes include zero nodes, zero work, one node, work ending one unit short, and an already partially consumed budget. Candidate masks are also compared exactly. Every probe creates fresh mutable search state while borrowing the same immutable prepared geometry.

## Timing

- Candidate calculation calls `calculateBaseCandidates`; it excludes arithmetic candidate refinement.
- Exact counting calls `prepareExactValidator(...).count`, counting up to two solutions with one million nodes and four million work units. Arithmetic propagation is included.
- Both languages run the same number of corpus sweeps and consume returned masks/solutions in the same weighted checksum. Rust additionally uses `std::hint::black_box` on inputs and outputs.
- Every fresh process warms for 250 ms after loading and preparation. A V8 pilot chooses a sweep count targeting roughly 180 ms of TypeScript computation per sample.
- Seven paired samples alternate language order. Results normalize the median batch duration to microseconds per puzzle; the speedup is the ratio of those medians. Raw samples and iteration counts are retained.
- Timers exclude process startup, TypeScript loading, JSON I/O, topology/catalogue preparation, compilation, and warmup. Rust uses Cargo's standard optimized `--release` profile without CPU-specific flags, custom LTO, or parallel solving.

Run on an otherwise idle machine. Native Rust versus Node/V8 is a local CPU experiment. These results do not establish WebAssembly, browser/Worker, mobile-device, hint, rating, or end-to-end generation speedups. The corpus represents delivered puzzles rather than the distribution of intermediate generation probes; that distribution needs separate profiling before estimating application benefits.

## Browser WebAssembly follow-up

Install the matching compiler target and binding tool once:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked --root .superpowers/rust-core-benchmark/wasm-tools
```

Then run:

```sh
node experiments/rust-core-benchmark/run-wasm.mjs
```

The runner builds the same Rust library for `wasm32-unknown-unknown`, generates standard `wasm-bindgen --target web` glue, builds the production TypeScript functions with Vite, and serves both locally. It launches separate headless Chromium, WebKit and Firefox runtimes sequentially. Set `PLAYWRIGHT_BROWSERS_PATH` if your installed Playwright browsers are elsewhere; the default is the repository's existing `.superpowers/playwright-browsers/`. Set `WASM_BINDGEN` to use a different installation of the exact same CLI version. Browser launch failures are recorded as unavailable; correctness or runtime failures stop the experiment.

Each fresh benchmark document verifies all 220 candidate results and all 1,320 exact budget probes against the reference-checked corpus for both browser JavaScript and actual WASM. It then times three paths on the same selected boards:

1. Production JavaScript, including its normal validation and result construction.
2. Resident WASM batches, with boards/topology already loaded and checksums consumed inside Rust.
3. One WASM call per board, including the generated binding's 81-byte input copy, Rust validation, result construction, and an owned output typed array containing all candidate masks or search metadata plus the complete first solution. Prepared topology remains resident in all paths.

Seven rounds rotate execution order across these three paths. Each sample warms for 250 ms, and a JavaScript pilot chooses identical corpus sweep counts targeting 180 ms per JavaScript sample. Timers and checksum loops run within the page; Playwright automation is outside them. All paths include equivalent checksum consumption. The copied-boundary result is a direct measurement; subtracting it from the resident time is not a reliable estimate of nanosecond-level overhead.

The runner also records per-document WASM initialization and setup durations separately. These are local-load diagnostics with possible browser/OS caches, **not cache-cold network startup measurements**. No custom optimization profile, wasm-opt, SIMD flag or browser tuning is used. This follow-up still excludes Web Workers, mobile hardware and complete generation/rating/hint workflows. Raw WASM samples and artifact/source hashes are saved to `.superpowers/rust-core-benchmark/wasm-results.json`.

## References reviewed

- [Cargo build profiles](https://doc.rust-lang.org/cargo/reference/profiles.html).
- [Rust benchmark optimization barrier](https://doc.rust-lang.org/std/hint/fn.black_box.html).
- [Serde derive](https://docs.rs/serde/1.0.229/serde/).
- [Node synchronous module hooks](https://nodejs.org/api/module.html#moduleregisterhooksoptions).
- [Node high-resolution performance timer](https://nodejs.org/api/perf_hooks.html#performanceperformancenow).
- [Rust browser WASM target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html).
- [wasm-bindgen browser deployment](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html).
- [wasm-bindgen numeric slices and copies](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/number-slices.html).
- [Playwright browser evaluation](https://playwright.dev/docs/evaluating).
