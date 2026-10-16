# Browser WASM Sudoku Core Performance Comparison

> Historical report: the experiment and benchmark harnesses were removed after migration at the user's request. Their sources remain in Git at commit `c3dfbcb`; the recorded measurements and raw artifacts below are preserved unchanged. Current correctness checks are documented in [migration evidence](../../../tests/migration/README.md).

Date: 2026-10-16. Follow-up to the [native Rust comparison](2026-10-16-rust-core-benchmark.md), using the same reference-checked corpus and unchanged production engine.

## Result

Rust compiled to browser WASM retains a substantial exact-search improvement after per-board binding calls and full result copies. The weighted speedup is **3.41x in Chromium** and **4.93x in WebKit**. Individual variant speedups vary; base candidate calculation gains less.

The tables report microseconds per board, normalized from the median of seven batch samples. The JavaScript baseline runs the actual production TypeScript functions bundled by Vite inside the same browser. It is not the earlier Node baseline.

### chromium 156.0.8078.4

| Operation       | Boards | JS us/board | Resident WASM us/board | Resident speedup | Copied WASM us/board | Copied speedup |
| --------------- | ------ | ----------- | ---------------------- | ---------------- | -------------------- | -------------- |
| Base candidates | 171    | 3.51        | 1.97                   | 1.79x            | 2.21                 | 1.59x          |
| Classic         | 36     | 54.68       | 18.15                  | 3.01x            | 18.51                | 2.95x          |
| Diagonal        | 27     | 75.60       | 25.06                  | 3.02x            | 25.10                | 3.01x          |
| Jigsaw          | 27     | 59.91       | 19.01                  | 3.15x            | 19.60                | 3.06x          |
| Killer          | 27     | 287.35      | 66.67                  | 4.31x            | 67.13                | 4.28x          |
| Thermo          | 27     | 73.72       | 25.81                  | 2.86x            | 26.63                | 2.77x          |
| Arrow           | 27     | 69.75       | 23.27                  | 3.00x            | 24.44                | 2.85x          |

Weighting the six exact-count groups by their 171 boards gives **17.259 ms JS**, **4.969 ms resident WASM** (3.47x), and **5.065 ms copied WASM** (3.41x). These are sums of normalized group medians, not a separately timed mixed batch.

### webkit 27.2

| Operation       | Boards | JS us/board | Resident WASM us/board | Resident speedup | Copied WASM us/board | Copied speedup |
| --------------- | ------ | ----------- | ---------------------- | ---------------- | -------------------- | -------------- |
| Base candidates | 171    | 4.19        | 2.60                   | 1.61x            | 3.05                 | 1.37x          |
| Classic         | 36     | 73.61       | 19.44                  | 3.79x            | 18.52                | 3.98x          |
| Diagonal        | 27     | 104.32      | 26.54                  | 3.93x            | 25.93                | 4.02x          |
| Jigsaw          | 27     | 79.42       | 18.93                  | 4.20x            | 19.75                | 4.02x          |
| Killer          | 27     | 447.09      | 63.49                  | 7.04x            | 66.14                | 6.76x          |
| Thermo          | 27     | 99.38       | 25.31                  | 3.93x            | 26.54                | 3.74x          |
| Arrow           | 27     | 96.30       | 24.69                  | 3.90x            | 24.69                | 3.90x          |

Weighting the six exact-count groups by their 171 boards gives **24.966 ms JS**, **4.992 ms resident WASM** (5.00x), and **5.069 ms copied WASM** (4.93x). These are sums of normalized group medians, not a separately timed mixed batch.

## Workloads and boundaries

- Same 171 timed uniquely solvable boards: 19 authored fixtures and eight fixed generated seeds per supported type/difficulty. Every group uses identical boards and corpus sweep counts across all three paths.
- JavaScript calls the actual candidate function or prepared exact validator, with its normal validation, mutable budget and owned result construction.
- Resident WASM keeps the boards/topology in Rust, consumes complete masks/results in the same checksum, and crosses the boundary once per measured batch.
- Copied WASM makes one generated wasm-bindgen call per board. Timing includes copying 81 input bytes, validation and search, and returning an owned Uint16Array of all masks or Uint32Array containing status/count/nodes/work and the entire first solution. Prepared geometry remains resident, matching the JavaScript prepared validator.
- Both paths call the same Rust solver. They use different wrapper/loop contexts, so small resident/copied differences include compiler decisions and timing noise; their difference is not an isolated measurement of crossing cost. No borrowing of growable WASM memory escapes the binding.
- Rule decoding/compilation, membership/catalogue preparation, fixture parsing, module initialization and correctness validation are outside steady-state timing. Rust receives topology from the existing TypeScript compiler; this remains a computation experiment rather than a complete replacement engine.
- Each sample warms for 250 ms. A JavaScript pilot targets roughly 180 ms per batch. Seven rounds rotate starting language across JavaScript, resident WASM and copied WASM. Page timers/checksum loops exclude Playwright automation. No concurrent build, lint or unit-test workload ran during final browser measurement.

## Correctness and validation

Each of seven fresh documents in each available browser checks all **220 candidate results and 1,320 exact result/budget probes**, for both browser JavaScript and WASM. All checks passed, including first solutions, zero/one/multiple counts, node counts, work charges and budget exhaustion. Every timed checksum also matched across all three paths. The original independent reference solver validated the corpus before browser measurement.

Across Chromium and WebKit this is 18,480 WASM exact comparisons, 18,480 browser JavaScript exact comparisons, and 3,080 complete candidate-array comparisons per runtime. All 14 benchmark documents completed without page errors.

Rust native release contract tests passed after adding the WASM adapter. Rust formatting and Clippy for both native and wasm32 targets passed with warnings denied; repository ESLint and Prettier checks passed. The existing 78-file, 1,006-test unit suite passed during the native experiment, and the application's source files remain identical. A read-only independent review of the WASM adapter and measurement harness found no actionable issues; it did not execute measurements or review this subsequently written report.

Firefox failed before any page could execute, reporting `Could not find profile folder`. It is unavailable, not a passing browser. No browser profiles, privacy settings or application data were modified to work around that launch failure.

## Build and initialization

Host: Apple M4 Pro, arm64, Darwin 27.0.0. Compiler: rustc 1.98.0 (88d9e12ae 2026-08-18). Bindings: wasm-bindgen 0.2.129. Target: `wasm32-unknown-unknown`, standard Cargo `--release`; no wasm-opt, custom LTO, explicit SIMD, CPU-specific flags or parallel solving.

The generated WASM binary is **179,417 bytes** (175.2 KiB), or **69,769 bytes** with a local default gzip estimate. The latter is a size diagnostic, not observed network transfer.

| Browser  | Per-document WASM initialization ms, min–max |
| -------- | -------------------------------------------- |
| chromium | 1.8–6.2                                      |
| webkit   | 3.0–6.0                                      |

Initialization includes local fetch/compile/instantiate through the generated loader and can use browser/OS caches. These are **not cache-cold network startup numbers**. The report also retains setup times, but Rust prepares already compiled topology while JavaScript compiles rules, so those durations are not an equivalent compilation benchmark.

## Interpretation

The measured core speedup survives ordinary input/output copies, which supports considering a WASM implementation for this workload. The candidate-only gain is smaller and its boundary overhead is more noticeable. This does not establish complete generator, logical rating or hint performance: those algorithms remain TypeScript, and the delivered-puzzle corpus does not model the frequency or difficulty of intermediate generation probes.

No application Worker, mobile hardware or complete generation flow was benchmarked, and no WASM implementation was integrated into the product. WebKit here is Playwright's headless runtime, not a measurement of a user's installed Safari. Native Rust versus Node figures remain a separate comparison.

## Historical artifacts

[Raw browser samples, checksums, setup observations and source/artifact hashes](2026-10-16-wasm-core-benchmark.json) retain the original results. The retired browser harness and tool setup are available in `experiments/rust-core-benchmark/` at Git commit `c3dfbcb`.
