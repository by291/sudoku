# Sudoku WASM Adapter

A thin `wasm32-unknown-unknown` / wasm-bindgen adapter over `sudoku-core`. It owns explicit wire DTOs, fallible conversion, browser number/absence semantics and prepared-resource handles. Sudoku mathematics stays in the reusable native crate; browser services, Chinese presentation, Workers and persistence stay in the frontend.

Run `pnpm wasm:build` from the workspace root. The pinned build installs its matching wasm-bindgen CLI and generates JS/WASM/TypeScript declarations under `packages/sudoku-wasm/pkg`. Do not edit or manually copy those outputs. Vite emits the binary at the correct deployment root.

Release builds use thin LTO and one code generation unit. The [Rust performance verification](../../docs/superpowers/verification/2026-10-16-rust-idioms-and-performance.md) records the separate size/throughput experiment and the unchanged deterministic contracts.

`@sudoku/wasm/factory` creates independent binding instances with collectable memory. Pass a compiled `WebAssembly.Module` during initialization, then validate algorithm/bridge identities. Instances share immutable code only; no returned DTO borrows mutable Rust memory. Every `PreparedPuzzle` must be freed by its owner, including failure/disposal paths. The application facade owns and retires handles and rejects use after disposal.

Generation/derivation accept checked `Uint8Array` inputs; array-like values and strings cannot coerce into seed bytes. Untrusted validators accept `unknown` and narrow through explicit Rust DTOs. Optional undefined and explicit null remain distinct where the contract requires it. JS-only historical seed/version text is excluded from Rust string conversion.

The main-thread facade exposes bounded live operations and semantic validation. Heavy generation, exact search, rating and hints belong in isolated Workers. An arithmetic operation's finite work limit does not establish a frame-time bound; the release audit and any approved asynchronous dispatch policy are part of frontend integration.

Bridge version 3 retains `assess_summary`: it runs the same assessment and work accounting as `assess`, then returns the summary-only outcome before converting any trace to JavaScript. Production Workers use this export; the full `assess` export retains its owned trace for proof consumers. Both exports share input validation and failure mapping.

Live assessment issues distinguish diagnostic messages from structured rule violations. Violation facts carry their constraint identity, affected cells and typed details; Chinese rendering belongs to client game presentation. Live outcomes have a separate checked parser from historical string-shaped assessment metadata. Existing stored unavailable-assessment strings are preserved, and the rating/generation versions do not change with this bridge revision.

Conversion modules own typed input assembly and metadata decoding. Prepared handles own immutable computation and operation dispatch. Edit conversion validates every supplied note mask before rejecting a wrong array length; preserve that failure precedence when changing the boundary.
