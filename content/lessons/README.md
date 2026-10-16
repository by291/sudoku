# Shared teaching catalogue

`catalogue.json` is the authored source consumed by the Web course loader and the native Android model. Schema version 1 contains the same 32 stable course IDs, 84 ordered exercise stages, Chinese copy, practice metadata, board values, explicit candidate-state preconditions, structured logical evidence, expected answers, and focused/transfer descriptors.

## Provenance and mathematical ownership

The initial extraction comes from `tests/fixtures/teaching-contracts.json.gz`, captured from the TypeScript teaching owners at commit `6b6807d` before the Rust migration. Its compressed SHA-256 is `c5105e8ba1a054cf5f4a036e31026914dc9b75312dd7f9d0fb50c40e4d86b13c`. The sealed fixture and independent reference engine remain unchanged. The Web equality contract reconstructs the original public course shape and compares every value with that fixture.

Some variant examples contain materialized base-candidate results and the transfer exercises contain materialized permitted transformations. These are reused presentation snapshots, not new independent mathematical oracles. `candidateOrigin` identifies base-candidate snapshots or explicit authored preconditions; prior candidate eliminations remain supplied preconditions. The structured steps retain all original unit, subset, fish, wing, coloring, cage, path, and equation facts. Chinese stage explanations are materialized from the existing Web presentation formatter.

Rust retains mathematical ownership. Web parses each stage through `validateTeachingStep` before publishing courses. Android's `LessonCatalogue.decode` validates the serialized shape, stable IDs, ordering, answers, bounds, and metadata; its suspend `validate(engine)` must complete with `Validation.Valid` before teaching is enabled. Cancellation, timeout, exhaustion, invalid evidence, and operational failure remain distinct outcomes. No Kotlin solver or TypeScript runtime is involved.

## Version 1 shape

- Root: `schemaVersion`, `provenance`, `lessons`.
- Lesson: `id`, `title`, `introduction`, `explanation`, `practiceVariant`, `practiceDifficulty`, `guided`, `exercises`, `transfer`.
- Exercise: Chinese `title` and ordered `stages`. There are exactly two exercises: focused and transfer. Combined variant lessons have three stages per exercise; the other lessons have one.
- Stage: 81-entry `board` and `candidates`, discriminated `rules` and `step`, discriminated `answer`, Chinese `explanation`, and `candidateOrigin`.
- Transfer: `kind` is `transpose`, `rotate`, or Classic-only `swap-rows`; `source` is `focused` or `authored-alternate`. `arrow-rules` deliberately uses an authored alternate unknown before transposition.

The first focused stage equals `guided`. Expected answers equal the structured step's conclusion. Elimination submissions compare distinct cell/digit pairs as a set. The full structured evidence and runtime rule unions are decoded using the adapters' existing contracts rather than an unrelated generic plugin schema.

## Updating content

Preserve stable IDs and course order. Edit the shared source and keep authored candidate preconditions explicit. Verify the existing independent course proofs, the Web course path and answer tests, and the JVM catalogue/cursor tests. Do not regenerate mathematical expectations from Rust or overwrite the sealed pre-migration fixture. A deliberate curriculum change needs its own reviewed behavioral design and independently justified proof facts.

Android packages the repository `content` directory as assets and reads `lessons/catalogue.json`. JVM tests use the same directory as test resources. Platform code owns rendering, navigation, durable progress, dataset epochs, and full-board practice; the catalogue owns no database or native-handle lifetime.
