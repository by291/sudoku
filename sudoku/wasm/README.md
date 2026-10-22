# Sudoku WASM Adapter

A thin `wasm32-unknown-unknown` / wasm-bindgen adapter over `sudoku-core`. It owns explicit wire DTOs, fallible conversion, browser number/absence semantics and prepared-resource handles. Sudoku mathematics stays in the reusable native crate; browser services, Chinese presentation, Workers and persistence stay in the frontend.

`Cargo.toml` declares the Rust adapter; the colocated `package.json` declares the private `@sudoku/wasm` workspace package. Its root export provides bindings and DTO types, `/factory` provides isolated instances, and `/binary` exposes the WASM asset. Node consumers resolve `/binary` through the package export; Vite consumers use `/binary?url`.

Run `pnpm wasm:build` from the workspace root. The pinned build installs its matching wasm-bindgen CLI and generates JS/WASM/TypeScript declarations under `sudoku/wasm/pkg`. Do not edit or manually copy those outputs. Vite emits the binary at the correct deployment root.

Release builds use thin LTO and one code generation unit. Keep profile changes separate from algorithm changes and measure size/throughput against identical deterministic inputs; see [engine contracts](../../docs/engine.md).

`@sudoku/wasm/factory` creates independent binding instances with collectable memory. Pass a compiled `WebAssembly.Module` during initialization, then validate algorithm/bridge identities. Instances share immutable code only; no returned DTO borrows mutable Rust memory. Every `PreparedPuzzle` must be freed by its owner, including failure/disposal paths. The application facade owns and retires handles and rejects use after disposal.

Generation/derivation accept checked `Uint8Array` inputs; array-like values and strings cannot coerce into seed bytes. Untrusted validators accept `unknown` and narrow through explicit Rust DTOs. Optional undefined and explicit null remain distinct where the contract requires it. JS-only historical seed/version text is excluded from Rust string conversion.

The main-thread facade exposes bounded live operations and semantic validation. Heavy generation, exact search, rating and hints belong in isolated Workers. A three-second deadline does not establish a frame-time bound; the [browser dispatch policy](../../docs/architecture.md#wasm-readiness-and-ownership) keeps heavy live analysis off the main thread.

Bridge version 4 retains `assess_summary`: it runs the same assessment as `assess`, then returns the summary-only outcome before converting any trace to JavaScript. Production Workers use this export; the full `assess` export retains its owned trace for proof consumers. Both exports share input validation and failure mapping.

Live assessment issues distinguish diagnostic messages from structured rule violations. Violation facts carry their constraint identity, affected cells and typed details; Chinese rendering belongs to client game presentation. Live outcomes have a separate checked parser from historical string-shaped assessment metadata. Historical budget-exhausted metadata remains decodable. The rating version is unchanged; newly generated puzzle identities use v12.

Each computational request owns a monotonic three-second deadline through `performance.now()`, shared across its nested core calls. A cancelled request throws `Computation timed out`; worker ownership supplies the independent hard stop. DTOs expose owned result wrappers and explicit incomplete outcomes, without work counters or caller-supplied work allowances. `preview_conflicts` reports direct conflicts without enumerating partial arithmetic constraints.

Conversion modules own typed input assembly and metadata decoding. Prepared handles own immutable computation and operation dispatch. Edit conversion validates every supplied note mask before rejecting a wrong array length; preserve that failure precedence when changing the boundary.
