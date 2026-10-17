# Rust Responsibility and Readability

Date: 2026-10-18.

Status: The user approved implementation of every item in the preceding review. This document records that approved scope and the compatibility decisions required to implement it.

## Intent

Make Rust module ownership, function stages, state invariants and public contracts easier to understand without changing Sudoku mathematics, generated puzzles or bounded-work semantics. The scope includes the portable core, WASM adapter, Android adapter and the client presentation needed to remove Chinese issue formatting from Rust.

The existing three-crate architecture remains. Rules, constraints, exact search, logical detection and independent proof verification remain separate. Immutable prepared data, fresh mutable workspaces and owned outputs retain their current lifetimes. Large exhaustive DTO mappings remain explicit.

## Responsibility changes

- Generation scheduling owns layout selection and request completion. Focused private operations prepare a layout and evaluate one proposal. Frontier pending values form one optional record; prepared edit order and partition form one state. Internal outcomes distinguish accepted delivery, rejection, failure and exhaustion honestly.
- Hint owns complete hint-chain validation and replay coordination. Logic owns step shape, clue binding, single-step proofs and teaching-state validation. Compatibility exports may preserve existing native paths, but production dependencies use the actual owner.
- Advanced triple detection distinguishes cell selection from digit selection. Simple Coloring exposes graph construction, component coloring and action selection as coherent stages. Exact propagation retains its queue order and restoration owner while making its stages explicit.
- A logical workspace exposes read-only board/candidate access and a checked constructor for authored candidate states. Public step application validates the supplied action before mutation; the internal established-step path remains narrowly scoped and avoids duplicate hot-path work.
- Rating summary validation separates count bounds, action accounting and technique/difficulty consistency without changing rejection precedence.
- Adapter metadata/edit input conversion belongs to focused conversion modules. Platform-specific ABI validation, error precedence and cancellation remain in their adapters. Technique counts derive from the existing exhaustive catalogue.
- Newly computed assessment issues cross language boundaries as message or structured violation facts. Client presentation renders the existing Chinese violation text. Existing stored assessment strings, absent metadata, unsupported versions and backup formats remain readable and unchanged. A changed transient wire contract receives a new bridge version; algorithm/rating identities do not change.

## Readability rules

Use a single blank line between adjacent functions and meaningful workflow stages. Keep related calculations together. Introduce helpers for a coherent domain responsibility rather than a line limit. Name generation strategy constants and explain version-sensitive ordering. Use Rustdoc for borrowing/ownership, mutation, input preconditions, incomplete outcomes, units, identity comparisons and cancellation lifetime. Fix misleading comments before adding new ones.

Use checked value types, explicit enums for alternative states, grouped records for correlated state, and the narrowest useful visibility. Preserve necessary internal assertions; never use panic to validate untrusted input. Avoid a generic framework, wholesale data-layout changes or speculative performance work.

References: [Rust Style Guide](https://doc.rust-lang.org/style-guide/), [Rust API Guidelines: type safety](https://rust-lang.github.io/api-guidelines/type-safety.html), [documentation](https://rust-lang.github.io/api-guidelines/documentation.html), [encapsulation](https://rust-lang.github.io/api-guidelines/future-proofing.html), and [Web Architecture](../../architecture.md).

## Compatibility and verification

The live issue boundary uses an explicit message/violation enum. Preserve the existing stored outcome parser and string-shaped metadata DTOs; add a separately named live outcome/parser where needed so compatibility does not force presentation back into adapters. WASM bridge version becomes 3 and native bridge version becomes 2. Client expectations change atomically with regenerated bindings. Stored `PuzzleAssessment` remains string-based, and presentation performs any live-to-stored conversion explicitly.

Workspace action checking establishes structural validity and applicability before atomic mutation. It does not replace mathematical proof validation: callers must obtain a deduction from the detector or validate its evidence against that same workspace. The public API documents that distinction, while the crate-private established-step path preserves existing hot-path costs.

Preserve `sudoku-v11`, `sudoku-variants-v11`, `sudoku-rating-v2`, 32-byte seeds, random draw order, stable tie ordering, full evidence and trace order, work charges including abandoned work, exact-search restoration and rating-prefix reuse. Generation defaults remain 40 layouts, 4,000,000 work units and 500 logical steps; the regional terminal cap remains 6,561 visits. No expected fixture is regenerated from Rust.

Use existing contract tests for behavior-preserving extraction. Add tests for newly checked public boundaries and structured issue transport/presentation. Run native tests, rustfmt, native/all-targets and wasm32 Clippy, normal core dependency inspection, sealed native/browser migration comparisons, Web checks and relevant Android checks. Regenerate bindings from source. Record unavailable platform checks and performance evidence honestly; do not infer runtime coverage from type checking.
