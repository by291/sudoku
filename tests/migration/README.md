# Portable engine migration contracts

The immutable TypeScript reference is frozen at `7c95fb7832e614d4ee8d5089f69bac71d4886c36`. Its original source bytes are checked by `typescript-engine/manifest.json`; they use a separate TypeScript project and are excluded from mechanical rewriting. Reference sources never ship in application builds.

The v11 reference changes only generation versions and the seed/random boundary, through the documented loader patch and independently maintained Noble BLAKE3/ChaCha8 implementations. It retains the original generator scheduling, rule, search and grading algorithms. Primitive vectors include the upstream BLAKE3 derive-key vector, ChaCha8 zero-key words and explicitly assembled little-endian stage material.

Run `pnpm test:migration -- --suite all --engine typescript`. Named suites are `rules`, `constraints`, `support`, `exact`, `logic`, `hints`, `assessment`, `editing`, `validation` and `generation`. Native and WASM adapters are introduced with their owning implementation tasks; selecting an unavailable adapter fails explicitly.

`tests/fixtures/engine-contracts/manifest.json` pins source, patch, dependency and uncompressed fixture hashes. Full generation results and standalone assessment traces use lossless `.jsonl.gz` files to keep repository size practical. Read one with `node --input-type=module -e 'import {gunzipSync} from "node:zlib"; import {readFileSync} from "node:fs"; console.log(gunzipSync(readFileSync(process.argv[1])).toString())' tests/fixtures/engine-contracts/generation-v11-hard058.jsonl.gz`.

Only the independent reference creates expected results. To explicitly rebuild it, run `node tests/migration/freeze-reference.mjs`, then `node tests/migration/build-golden.mjs primitives`, then `node tests/migration/build-golden.mjs <family>` for each of `full`, `targeted`, `feedback`, `hard058`, and finally `node tests/migration/seal-fixtures.mjs`. Review every changed fingerprint. Never use Rust output to update expected payloads.

The 2241 inputs retain the historical corpus families, variant/difficulty combinations and case order. Each root seed is independently derived from ASCII `migration:<family>:<zero-based-row>` and stored as 32 explicit bytes. Historical string-seeded puzzle fingerprints remain historical evidence, not v11 expected results. Successful generated puzzles are checked by the independent rule-aware reference counter and by complete requested-tier assessment. CI needs no ignored `.superpowers/` files.

Prepared-support fixtures come from `node tests/migration/build-support.mjs` followed by `node tests/migration/seal-fixtures.mjs`. They pin complete small-cage preparation, overflow fallback, nearly fixed domains and exact query work at default/lowered capacities.
