# Asynchronous Live Analysis After the Interactive Gate

Status: focused Worker behavior approved by the user on 2026-10-16; implementation follows the linked plan.

## Evidence and trigger

The portable-core design requires synchronous p95 below 16.67 ms and no representative operation above 50 ms. It explicitly states: “An async redesign is a separate explicit behavior decision”.

A valid Killer layout with nine row cages of nine cells and sum 45 exposes the boundary. Its empty board and the canonical Classic solution pass content validation. Candidate/conflict enumeration exhausts the unchanged 1,000,000-work allowance in about 25–28 ms in the initial Node WASM diagnostic. Actual Chromium confirms p95 of 26.2 ms for candidates, 26.6 ms for conflicts and 25.9 ms for generated notes at the full original allowance. Full browser measurements belong to the release-audit artifact. Ordinary generated layouts and the original 57 constraint probes meet the interaction gate. Reducing the allowance or claiming that 81-cell inputs are always cheap would conceal the failure.

The migration remains isolated from the original checkout's production dispatcher until this decision and its gates are resolved.

## Recommended scope

Keep immediate Rust entry/erase/toggle-note, completion, wrong-entry review, topology/metadata and synchronous storage validation. Move potentially expensive candidate generation and full conflict analysis to the existing isolated computation Worker transport. The reusable Rust library remains synchronous and platform-independent; no async runtime or browser dependency enters it.

A conservative Rust-owned `liveExecution` capability selects `immediate` or `worker` for a prepared layout. Initially, a Killer cage larger than four cells requires a Worker; each future primitive must declare and verify its execution capability. Ordinary generated small-cage layouts retain immediate behavior. This is a dispatch capability, never a change to Sudoku rules, seed identity, output semantics or work allowances.

The alternative is to route all live constraint analysis through Workers. It provides a uniform execution model but introduces pending states for ordinary layouts that are currently immediate. Both options retain synchronous cheap board editing and the same Rust mathematics.

## Contracts and ownership

- Add focused `conflicts` and `generate-notes` requests/results to the existing typed Worker protocol. Send only owned board/rule/layer snapshots and identifiers; never send a persisted session or introduce a generic command interpreter.
- Full mathematical operations keep their original 1,000,000-work allowance. Cross-memory layout preparation remains separately bounded and reported; it cannot contribute extra action work or retry allowance. Incomplete results remain distinct from failures and cancellation.
- Main-thread duplicate-conflict preview returns only sound cheap facts and an explicit pending-arithmetic state. It cannot claim full validity. Full arithmetic work still runs with its unchanged allowance in the Worker. The main facade prevents accidental synchronous execution of Worker-only operations.
- A puzzle lifetime owns one prepared main layout. A separate live-analysis generation and AbortController own the current background request; a new board invalidates and terminates the previous owner. Hints/generation retain their existing independent transition fences.
- Responses must match the session identity, puzzle owner and board/layer revision captured before awaiting. Old results cannot overwrite edits, undo/redo, a replacement session or a restored dataset. Shape/version/ownership validation stays at the transport boundary; Sudoku computation remains Rust.

## Player behavior

Immediate edits still update entries/history synchronously. While expensive full conflicts are pending, show only current sound preview facts and an explicit checking state. Never show stale arithmetic conflicts or imply that pending analysis established validity.

Generating notes shows a pending state and prevents duplicate note requests. Other player input may continue. Any layer-changing action cancels the pending notes; selection and clock-only updates do not invalidate it. A current completed result commits through `commitBoardEdit` using the latest assistance counters. A stale, cancelled, failed or exhausted result preserves existing notes/history and never increments assistance. A successful no-change note result retains the existing assistance policy.

Pause, leave, replacement, read-only ownership loss and dataset reset abort pending live jobs before installation/save coordination. Save queues, revisions, leases, epochs, final-result retention and save-before-switch order remain in their current owners. Storage decoding stays synchronous because its measured validation is cheap; there is no awaited IDB transaction.

## Verification before cutover

1. Preserve existing immediate editing/history/check/hint/player contracts on ordinary generated layouts.
2. Exercise the valid nine-cell-cage regression in actual browsers with the original work allowance. Retain raw kernel durations in the report while measuring actual main-thread preview/post/commit blocking separately.
3. Prove stale notes/conflicts cannot apply after typing, note edits, undo/redo, pause, switch, lease loss, import/reset, disposal or late replies.
4. Prove exhaustion/failure retains notes, history and assistance; current no-change note completion still records assistance.
5. Verify bounded Worker lifetime, readiness/deadline accounting and both deployment roots. No fallback engine, quota reduction or hidden retry is permitted.
6. Repeat relevant native/WASM contracts, type/lint/unit/player checks and controlled interactive tails. Integrate only after the interactive gate is met; unavailable Firefox coverage stays explicitly outstanding.

Implementation: [focused Worker plan](../plans/2026-10-16-async-live-analysis.md).
