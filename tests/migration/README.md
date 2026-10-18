# Portable engine migration contracts

The immutable TypeScript reference is frozen at `7c95fb7832e614d4ee8d5089f69bac71d4886c36`. Its original source bytes are checked by `typescript-engine/manifest.json`; they use a separate TypeScript project and are excluded from mechanical rewriting. Reference sources never ship in application builds.

The v11 reference changes only generation versions and the seed/random boundary, through the documented loader patch and independently maintained Noble BLAKE3/ChaCha8 implementations. It retains the original generator scheduling, rule, search and grading algorithms. Primitive vectors include the upstream BLAKE3 derive-key vector, ChaCha8 zero-key words and explicitly assembled little-endian stage material.

Run `pnpm test:migration -- --suite all --engine typescript`. Named suites are `rules`, `constraints`, `support`, `exact`, `exact-prepared`, `logic-basic`, `advanced`, `logic`, `hints`, `hint-chains`, `assessment`, `assessment-screening`, `assessment-generated`, `assessment-metadata`, `editing`, `validation`, `generation-layouts`, `generation-boundaries` and `generation`. Native and WASM adapters are introduced with their owning implementation tasks; selecting an unavailable adapter fails explicitly.

`tests/fixtures/engine-contracts/manifest.json` pins source, patch, dependency and uncompressed fixture hashes. Full generation results and standalone assessment traces use lossless `.jsonl.gz` files to keep repository size practical. Read one with `node --input-type=module -e 'import {gunzipSync} from "node:zlib"; import {readFileSync} from "node:fs"; console.log(gunzipSync(readFileSync(process.argv[1])).toString())' tests/fixtures/engine-contracts/generation-v11-hard058.jsonl.gz`.

Only the independent reference creates expected results. To explicitly rebuild it, run `node tests/migration/freeze-reference.mjs`, then `node tests/migration/build-golden.mjs primitives`, then `node tests/migration/build-golden.mjs <family>` for each of `full`, `targeted`, `feedback`, `hard058`, and finally `node tests/migration/seal-fixtures.mjs`. Review every changed fingerprint. Never use Rust output to update expected payloads.

The 2241 inputs retain the historical corpus families, variant/difficulty combinations and case order. Each root seed is independently derived from ASCII `migration:<family>:<zero-based-row>` and stored as 32 explicit bytes. Historical string-seeded puzzle fingerprints remain historical evidence, not v11 expected results. Successful generated puzzles are checked by the independent rule-aware reference counter and by complete requested-tier assessment. The checked-in `historical-corpus.json` preserves the original corpus families and input ordering used by `build-golden.mjs`; it contains only the original inputs and provenance needed by the fixture builder, with the old measurements and run reports removed. Historical source paths inside sealed manifests are provenance labels, not files required at runtime. CI needs no ignored task artifacts.

Prepared-support fixtures come from `node tests/migration/build-support.mjs` followed by `node tests/migration/seal-fixtures.mjs`. They pin complete small-cage preparation, overflow fallback, nearly fixed domains and exact query work at default/lowered capacities.

Exact prepared probes are rebuilt with `node tests/migration/build-exact.mjs`. Advanced witnesses and hint-chain limits are captured by `node tests/migration/build-advanced.mjs`. Assessment screening and metadata contracts come from `node tests/migration/build-assessment.mjs` and `node tests/migration/build-metadata.mjs`. Run `node tests/migration/seal-fixtures.mjs` after these explicit reference rebuilds. Screening traces use deterministic gzip JSONL because their readable JSON projection exceeds 20 MiB; every result remains available without truncation.

`assessment-generated` projects the saved puzzle boards from all 2,241 v11 generation fixtures and independently re-runs their complete assessments. It compares the previously sealed full traces and standalone assessment work without invoking the Rust generator. Native migration requests are batched to bound temporary response buffers.

Rebuild the generated-board work sidecar with `node tests/migration/build-generated-assessments.mjs`, followed by sealing. The generation snapshot originally stored complete standalone assessment payloads but omitted their aggregate work counters; the sidecar is captured from the frozen TypeScript engine and verifies every pre-existing sealed assessment before recording its count.

Terminal/layout work and random continuations are captured by `node tests/migration/build-layouts.mjs`. Full-generation lower-limit outcomes are captured by `node tests/migration/build-generation-boundaries.mjs`; seal after either explicit rebuild. Run `pnpm test:migration -- --suite generation --engine native --independent` to additionally verify each returned puzzle with the separate reference counter, rule necessity and diversity across all 19 supported variant/tier combinations.

### Real WASM contracts

Build the pinned `wasm-bindgen` package with `pnpm wasm:build`, then run:

```sh
node tests/migration/run.mjs --engine wasm-chromium --suite all
node tests/migration/run.mjs --engine wasm-webkit --suite all
node tests/migration/run.mjs --engine wasm-firefox --suite all
```

Set `PLAYWRIGHT_BROWSERS_PATH` only when using an existing external browser installation. Browser launch failures fail the command; they never count as passing contracts. Each browser runs 4,262 complete comparisons, including all 2,241 v11 generated puzzles, all 152 full-generation boundaries, complete assessments/traces and actual work counts. Lower-level support, detector, screening and layout-continuation probes remain native tests; the browser adapter uses only named production WASM operations. The isolated Vite server disables hot reload so source edits cannot navigate a long-running fixture page.

`browser-compute.mjs` is a test-only projection of the existing contracts. It preserves session-owned assistance/no-op facts and opaque historical seed/version metadata without implementing mathematical validation. Fixture hashes are verified before either browser or native execution. `wasm-contract.spec.ts` additionally checks byte-only inputs, BLAKE3 derivation against the independent implementation, returned ownership, malformed conversions, number/null/absence semantics and allocator reuse.

### Retired production engine and teaching contracts

The complete legacy implementation is sealed under `tests/reference/typescript-engine`; it is never a production fallback. Unit/Playwright oracles use the explicit `@reference/` alias. Only test configuration resolves that alias and the sealed snapshot's original internal imports. Normal root/subpath production builds cannot resolve a legacy engine, and `portable-cutover.test.ts` rejects static/dynamic production imports of either old paths or reference sources. Runtime dependency tests now audit the browser engine facade; native/WASM migration suites own mathematical contracts.

The removed production TypeScript unit locations are superseded by native tests and sealed complete comparisons: values/random/budgets, all six rule layouts, arithmetic support/capacity fallbacks, exact counting, editing, basic/variant/advanced deductions and malformed evidence, full hint chains, rating metadata/screening/cache work, terminal/layout generation and full generation budgets. `node tests/migration/run.mjs --suite all --engine native` runs 5,742 comparisons; browser suites run the 4,262 contracts exposed through the public binding. Existing player/history/assistance/storage tests still run against actual Rust operations.

`tests/fixtures/teaching-contracts.json.gz` captures all 32 complete courses from commit `6b6807d`, before replacing construction with Rust operations. Its SHA-256 is `c5105e8ba1a054cf5f4a036e31026914dc9b75312dd7f9d0fb50c40e4d86b13c`. `teaching-contracts.test.ts` compares every stage and expected deduction without generating expectations from Rust. Independent course proof tests additionally establish candidate-constrained conclusions with a separate counter. Candidate-state teaching validation checks any sound authored unit pattern rather than requiring the detector's first pattern; live hint replay preserves its original ordered contract. Earlier candidate eliminations are a caller precondition of teaching-state validation.
