# Learning content and progress

[`resources/lessons/catalogue.json`](../resources/lessons/catalogue.json) is the authored source consumed by the Web course loader and the native Android model. Schema version 1 contains the same 32 stable course IDs, 84 ordered exercise stages, Chinese copy, practice metadata, board values, explicit candidate-state preconditions, structured logical evidence, expected answers, and focused/transfer descriptors.

## Provenance and mathematical ownership

The initial extraction comes from `tests/fixtures/teaching-contracts.json.gz`, captured from the TypeScript teaching owners at commit `6b6807d` before the Rust migration. Its compressed SHA-256 is `c5105e8ba1a054cf5f4a036e31026914dc9b75312dd7f9d0fb50c40e4d86b13c`. The sealed fixture and independent reference engine remain unchanged. The Web equality contract reconstructs the original public course shape and compares every value with that fixture.

Some variant examples contain materialized base-candidate results and the transfer exercises contain materialized permitted transformations. These are reused presentation snapshots, not new independent mathematical oracles. `candidateOrigin` identifies base-candidate snapshots or explicit authored preconditions; prior candidate eliminations remain supplied preconditions. The structured steps retain all original unit, subset, fish, wing, coloring, cage, path, and equation facts. Chinese stage explanations are materialized from the existing Web presentation formatter.

Rust retains mathematical ownership. Web's Vite gate validates every guided and exercise stage through Rust/WASM and emits the exact validated source snapshot as a small directory and separate lazy lesson modules. Android gates packaging with native host teaching tests, then generates its Kotlin directory and individual JSON assets. Invalid, exhausted or failed mathematical validation blocks packaging. Runtime loading on both clients retains structural decoding and owned snapshots without re-running all teaching proofs. No Kotlin solver or embedded TypeScript runtime is involved.

## Version 1 shape

- Root: `schemaVersion`, `provenance`, `lessons`.
- Lesson: `id`, `title`, `introduction`, `explanation`, `practiceVariant`, `practiceDifficulty`, `guided`, `exercises`, `transfer`.
- Exercise: Chinese `title` and ordered `stages`. There are exactly two exercises: focused and transfer. Combined variant lessons have three stages per exercise; the other lessons have one.
- Stage: 81-entry `board` and `candidates`, discriminated `rules` and `step`, discriminated `answer`, Chinese `explanation`, and `candidateOrigin`.
- Transfer: `kind` is `transpose`, `rotate`, or Classic-only `swap-rows`; `source` is `focused` or `authored-alternate`. `arrow-rules` deliberately uses an authored alternate unknown before transposition.

The first focused stage equals `guided`. Expected answers equal the structured step's conclusion. Elimination submissions compare distinct cell/digit pairs as a set. The full structured evidence and runtime rule unions are decoded using the adapters' existing contracts rather than an unrelated generic plugin schema.

## Updating content

Preserve stable IDs and course order. Edit the shared source and keep authored candidate preconditions explicit. Verify the existing independent course proofs, the Web course path and answer tests, and the JVM catalogue/cursor tests. Do not regenerate mathematical expectations from Rust or overwrite the sealed pre-migration fixture. A deliberate curriculum change needs its own reviewed behavioral design and independently justified proof facts.

## Delivery and player progress

Both clients load the selected lesson on demand and keep at most three decoded lessons. Static directory and guide reading do not wait for personal progress. Source assets belong to the bundled content version; personal completion/cursors belong to the dataset epoch.

Unknown progress is not zero or NotStarted and cannot select a personal recommendation. Restoring or clearing player data fences stale reads, including requests begun while visible progress was unknown. Guide/Exercise mode switching retains the draft; incorrect answers retain their stage. A correct answer advances only after durable save, and explicit Next remains required. Preserve the first completion timestamp; optional cursor cleanup must not undo a committed completion.

Full-board practice uses the normal session workflow and does not complete the lesson. Platform owners handle navigation, rendering, storage and native resources. See [product behavior](product.md), [Web architecture](architecture.md) and [Android architecture](android/architecture.md).
