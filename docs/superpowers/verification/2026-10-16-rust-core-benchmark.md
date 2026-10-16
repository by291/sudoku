# Rust Sudoku Core Performance Comparison

> Historical report: the experiment and benchmark harnesses were removed after migration at the user's request. Their sources remain in Git at commit `c3dfbcb`; the recorded measurements and raw artifacts below are preserved unchanged. Current correctness checks are documented in [migration evidence](../../../tests/migration/README.md).

Date: 2026-10-16. This is an independent native prototype; application runtime and engine source are unchanged.

A subsequent [browser WASM comparison](2026-10-16-wasm-core-benchmark.md) measures the same core in actual browser runtimes. This report retains the earlier native measurements and source snapshots.

## Result

On this Apple M4 Pro, native Rust exact counting was **3.60–5.15x faster** than the existing TypeScript implementation in warmed Node/V8. Base candidate calculation was **1.69x faster**. These are measurements of the same prepared workloads with the same traversal and work charges.

Times below are microseconds per board, normalized from the median of seven batch samples. They are not medians of individually timed boards. Candidate calculation excludes arithmetic refinement; exact counting includes it and stops after two completions.

| Operation            | Timed boards | TypeScript us/board | Rust us/board | Rust speedup |
| -------------------- | ------------ | ------------------- | ------------- | ------------ |
| Base candidates      | 171          | 3.40                | 2.02          | 1.69x        |
| Classic exact count  | 36           | 56.93               | 13.65         | 4.17x        |
| Diagonal exact count | 27           | 80.20               | 19.67         | 4.08x        |
| Jigsaw exact count   | 27           | 61.19               | 14.11         | 4.33x        |
| Killer exact count   | 27           | 316.61              | 61.53         | 5.15x        |
| Thermo exact count   | 27           | 81.77               | 22.71         | 3.60x        |
| Arrow exact count    | 27           | 71.96               | 18.78         | 3.83x        |

Summing the six variant group medians with their corpus weights gives 18.566 ms versus 4.185 ms for 171 exact counts, or **4.44x**. This is a weighted summary of the groups, not a separately timed mixed workload.

## Method and coverage

- Host: Apple M4 Pro, arm64, macOS Darwin 27.0.0; Node v26.11.1; rustc 1.98.0 (88d9e12ae 2026-08-18).
- Baseline commit: `7c95fb7832e614d4ee8d5089f69bac71d4886c36`. The raw report records hashes for every engine and benchmark source file, the pinned Cargo lockfile, and the generated corpus.
- Timed corpus: 19 authored fixtures plus eight deterministic generated seeds for every supported type/difficulty combination, totaling 171 uniquely solvable puzzles. Classic contributes 36 inputs; each variant contributes 27.
- Correctness corpus: 220 boards, with 1,320 exact result/budget comparisons and 220 complete candidate-mask comparisons. It includes zero/one/multiple solutions, direct contradictions, large Killer cages, clue removals, and partially consumed or exhausted budgets.
- The existing independent reference solver checks every board's solution count and the known solutions of all delivered puzzles. Rust is then compared against complete TypeScript search results, including the first completion, node count and work count. All comparisons passed.
- Both implementations use the same singleton/full-unit/arithmetic propagation, small-cage catalogue policy, minimum-domain branching and ascending choices. FIFO deduplicated queues reproduce JavaScript Set ordering; cell stacks retain duplicate scheduling and its charges.
- The TypeScript compiler provides topology outside timing. Rust prepares its own memberships and cage catalogues. Rule compilation and catalogue preparation are excluded for both; Rust preparation does not implement finite preparation-budget pricing.
- Each fresh process warms for 250 ms. A V8 pilot targets about 180 ms per measured batch; both languages use identical sweep counts. Seven paired samples alternate language order. Every returned mask/solution contributes to a matching checksum, and Rust also uses the standard optimization barrier. The final measurement ran after linting, formatting and regression checks finished, without overlapping those tasks.
- Cargo uses its standard optimized release profile, with no CPU-specific flags, custom LTO or parallel solving. Timers exclude startup, loading, I/O, compilation, setup and warmup.

## Validation

- Full existing unit suite: 78 files and **1,006 tests passed**. jsdom emitted existing unimplemented scrollTo messages; no assertion failed.
- Rust release contract suite: passed all 220 boards and 1,320 probes. Candidate mismatch was observed before implementing the port, followed by the passing corpus.
- Whole-repository ESLint and Prettier checks passed; Rust formatting and Clippy with warnings denied passed.
- One independent read-only static review found no actionable issues in the port and harness. It did not execute timing or review this subsequently written report. Final source hashes identify the measured files.
- The native run did not exercise browsers, Workers, WASM, devices or end-to-end generation. The subsequent browser measurements are reported separately.

## Interpretation and limits

The exact-search path shows a substantial measured native benefit on this corpus. The comparison includes idiomatic representation choices: Rust fixed-size arrays, population counts and explicit queues versus production JavaScript arrays, digit-array construction, Sets and closures. It does not isolate a universal language multiplier.

These inputs are accepted puzzles, not a sampled distribution of intermediate generation probes. This result cannot predict the full generator, logical rating or hint speedup. The subsequent report measures browser WASM; actual generation CPU profiling remains necessary before estimating product benefits. No production replacement is proposed by this experiment.

## Historical artifacts

[Raw samples, checksums and fingerprints](2026-10-16-rust-core-benchmark.json) retain the original results. To inspect the retired implementation and methodology, use `experiments/rust-core-benchmark/` at Git commit `c3dfbcb`.
