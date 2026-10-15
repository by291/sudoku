# Sudoku Core Organization and Readability

Date: 2026-10-15

Status: Approved by the user on 2026-10-15. Product source has not been modified.

## Intent

Organize the existing Sudoku engine so each module has a clear owner, dependencies are easy to follow, and calculation stages are readable. Introduce abstractions only for current shared contracts or genuinely separate responsibilities. Improve naming, logical whitespace and comments using the installed TypeScript toolchain and the repository conventions.

This is a behavior-preserving refactor. The current implementation is local `main` at `dbcb83e`. It contains 35 production engine files and 31 colocated test files. The implementation is currently flat except for six variant modules. A static runtime-import inventory found no runtime dependency cycle; the problem is mixed responsibilities and unclear type-level dependencies, not an observed runtime cycle.

## Existing responsibility problems

| Area                                   | Current observation                                                                                                                     | Intended separation                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `rating.ts`                            | 839 lines combining contracts, input parsing, policy execution, trace statistics and saved-summary decoding                             | Explicit rating contracts, input, assessment execution, workload and decoding modules                        |
| `techniques.ts`                        | Logical evidence/types, technique identities, evidence copying and Chinese explanation formatting share one file                        | Engine contracts/catalogue/owned evidence separate from player-facing explanation                            |
| `logic.ts`                             | Workspace construction, five basic detectors, step application and the solving loop are combined                                        | Workspace mutation, basic detection and solving orchestration have separate owners                           |
| `advancedTechniques.ts`                | Discovery and independent proof validation occupy the same module                                                                       | Keep cohesive detector families together; extract proof validation without replacing it with detector replay |
| `constraintSupport.ts`                 | Generic enumeration, cage catalogue construction/filtering and prepared-computation composition are combined                            | Generic support, cage catalogue and computation ownership are explicit                                       |
| `variants/*.ts`                        | Rule decoding/compilation and generation geometry/transform policies share a file                                                       | Rule definitions remain independent of generation implementation                                             |
| `generation.ts` and generation helpers | Request/limit contracts, stored-puzzle decoding and request orchestration are coupled; low-level random helpers import generation types | Move contracts to their owners and keep generation-specific random streams with generation                   |
| External consumers                     | Storage, workers, feature models and views import from the same mixed modules                                                           | Consumers import specific contracts or operations directly                                                   |

## Approaches considered

1. **Responsibility folders with targeted extraction — recommended.** Group existing subsystems, extract the mixed responsibilities above, and migrate imports in the same change. This requires more import updates but establishes useful ownership boundaries.
2. **Directory moves and formatting only.** Smaller change, but assessment decoding, presentation formatting and rule generation would remain mixed.
3. **A configurable engine/plugin or service framework.** Supports broader future variability, but adds indirection and changes contracts that are not needed for this cleanup.

## Proposed organization

Keep small, cohesive shared modules at the engine root. A directory is not required for every helper.

```text
src/core/sudoku/
  types.ts                 # Basic board/value/result contracts
  board.ts                 # Board primitives and existing board operations
  puzzle.ts                # Puzzle data contract and stored-puzzle validation
  difficulties.ts          # Supported type/difficulty combinations
  budget.ts                # Shared work accounting
  random.ts                # Generic seeded random and shuffle primitives
  hint.ts                  # Hint orchestration over logic and rating policies
  rules/
    types.ts
    topology.ts
    registry.ts
    context.ts
    definitions/           # Six rule decoders/compilers
  constraints/
    types.ts               # Shared support and prepared-computation contracts
    support.ts
    cageCatalogue.ts
    computation.ts
    candidates.ts
    conflicts.ts
  search/
    exact.ts
    propagation.ts
  logic/
    types.ts
    techniques.ts
    evidence.ts
    workspace.ts
    solver.ts
    basicTechniques.ts
    advancedTechniques.ts
    advancedEvidence.ts
    variantTechniques.ts
  rating/
    types.ts
    policies.ts
    input.ts
    assessment.ts
    workload.ts
    decoding.ts
  generation/
    types.ts
    input.ts
    generate.ts
    search.ts
    candidates.ts
    layouts.ts
    variantStrategies.ts
    terminalConstruction.ts
    classic.ts
    variant.ts
    random.ts
    variants/              # Variant geometry/transform strategies
  examples/
    variants.ts
```

Names describe responsibilities rather than enforcing a file-size limit. The assessment owner, scheduler and propagation loop remain cohesive even if they are substantial. Tests move with their owners; split a test only when the production responsibility actually splits.

### Dependency direction

- Shared value types, budgets and generic random primitives do not import generation, rating or logical solvers.
- Rule contracts/topology/definitions do not import generation contracts or implementation. Their registry assembles definitions; definitions never import the registry.
- Constraint support depends on board/rule contracts and budgets, not search, logic, rating or generation.
- Exact search depends on prepared constraints and rules, not human grading or generation.
- Logical solving depends on rules, constraint support and technique/evidence contracts, not rating policies or generation.
- The small root `hint.ts` composes logical solving and rating policies. It retains the existing technique priority without making the logical solver depend on rating or duplicating policy lists.
- Rating depends on logical solving and its own policies. It does not import generation.
- Generation composes construction, exact search and rating. Its contracts live separately from the request dispatcher so low-level helpers do not import the dispatcher for a type.
- `puzzle.ts` owns the general puzzle snapshot and its decoder; saved records no longer import generation orchestration merely to validate a puzzle.
- Core remains independent of Vue, storage, workers, presentation components and browser globals.

Keep imports explicit through `@/`. Update consumers to their new owners; do not leave forwarding files or add a barrel `index.ts` that conceals the dependency graph. Shared types belong to their actual owner rather than a large new shared-context object.

### Focused abstractions

1. A pure technique catalogue owns technique identities and action kinds. Export a shared `isTechnique(unknown)` guard for rating and Worker validation instead of recognizing identifiers through Chinese display labels or constructing a count object.
2. Shared logical contracts own `LogicalStep`, evidence/state types and detector outcomes. Workspace mutation, evidence copying and proof validation remain distinct operations.
3. A cage catalogue module owns bounded construction and compatibility filtering. Generic support owns dispatch and exact fallback; prepared computation owns context/support assembly. Preserve every existing charge and ownership rule.
   Shared support contracts live in `constraints/types.ts` so the catalogue and dispatcher do not import types from each other's implementations.
4. Generation contracts own typed construction outcomes and random-stream contracts. Generic random utilities no longer depend on `GenerationInput`; generation-specific stream derivation moves to `generation/random.ts`.
5. Consolidate duplicate predicates only when accepted/rejected values and iteration behavior are equivalent. Do not generalize unrelated detector loops merely because they look similar.

### Presentation and compatibility

Move `TECHNIQUE_NAMES`, `explainStep` and `explainStepEvidence` to `src/features/game/model/techniquePresentation.ts`, following the existing ownership of player-facing variant definitions in the game model. Learning models can consume that pure presentation model under the current dependency policy. Update hint panels, lessons and explanation tests without changing Chinese text.

Worker evidence validation uses the pure engine technique guard, not the presentation dictionary. Core never imports the new presentation module.

Existing conflict diagnostic messages and `RuleViolation` shapes remain identical in this pass. Keep their construction together in the conflict module; redesigning diagnostic serialization/localization would expand this behavior-preserving change unnecessarily.

## TypeScript and readability conventions

Installed versions: TypeScript 6.0.3, typescript-eslint 8.71.1, ESLint 10.12.0, Prettier 3.9.10 and Vitest 5.0.3. Keep the existing dependencies.

- Preserve `strict`, `verbatimModuleSyntax`, ES modules, the `@/` alias and existing formatter choices.
- Use explicit `import type` for erased dependencies. Keep imports from an owner together, followed by one blank line before declarations.
- Retain discriminated unions and exhaustive narrowing for outcomes and variant dispatch. Prefer narrowing from `unknown` to assertions; do not introduce `any`, double assertions, non-null assertions or suppressions.
- Keep the repository's existing `type` conventions for unions and object contracts; do not mechanically replace them with interfaces. Give public contracts explicit types and allow inference for obvious locals.
- Distinguish borrowed readonly data from mutable workspaces and owned result copies. TypeScript `readonly` is a compile-time restriction; it does not replace copying or existing runtime ownership fences.
- Use descriptive domain names for helpers, counters and intermediate states. Do not rename persisted technique identifiers, variant identifiers or protocol fields.
- Keep braces, one variable per declaration, early guards and straightforward control flow. Replace nested choices with named predicates or branches when they select unrelated outcomes.
- Separate meaningful stages with one blank line: validation, setup, computation, mutation and return. Keep a value beside its immediate check and keep tightly related calculations together.
- Separate adjacent function/type responsibilities. Do not insert a blank line after every declaration or add rigid function/file length limits.
- Write short English comments for reasoning and constraints: bit-mask meaning, preserved ordering, budget ownership, incomplete outcomes, catalogue bounds, branch undo, snapshot copying and allowed transforms.
- Use concise JSDoc on exported contracts with mutation, borrowing, ownership or incomplete-result semantics. Do not add comments that paraphrase a function name or repeat its TypeScript signature.
- Keep test arrangement, action and assertions visually separate. Preserve independently known facts and existing regression coverage.

Record these conventions in `AGENTS.md` and the architecture/variant-extension documents where they add new enforceable guidance. Retain Prettier for mechanical formatting. Enforce type-only imports and prohibition of non-null assertions in the core with existing typescript-eslint rules. Do not add a formatter plugin or enable a repository-wide typed-lint preset as an incidental change.

Extend the existing module-boundary lint tests for forbidden upward dependencies, including literal dynamic imports. Verify the actual runtime import graph is acyclic after moves. Preserve test exemptions for legitimate cross-layer fixtures.

## Behavior and identity contract

Keep all of the following identical to `dbcb83e`:

- `sudoku-v10`, `sudoku-variants-v10` and `sudoku-rating-v2`.
- The 40-layout, 4,000,000-work, 500-step and 3,000 ms generation limits; existing lower limits remain valid.
- Seed derivation, random draw order, terminal/geometry choices, edit order and acceptance gates.
- Puzzle/rule arrays, logical conclusions/evidence/traces, grading summaries and workload meanings.
- Exact-count outcomes, incompleteness, branch restoration and prepared-data ownership.
- Work charges, diagnostic stage attribution, layout/candidate counts and exhaustion causes.
- Worker envelopes, hint output, saved records, backups, formal daily identities and historical facts.
- Existing Chinese player-facing explanations and diagnostics.

Source import paths may change in this private application. Runtime contracts and observable outputs may not. No generation-version bump, algorithm tuning, budget change, new cache, dependency or plugin framework is part of this refactor.

## Verification design

Before product changes, capture a committed baseline at `dbcb83e` and preserve source/path metadata plus selected full assessments and exact-search results. The existing v10 raw corpora already contain independently validated generation outputs for the full 1,216 requests, additional 256 targeted requests, predeclared 768 requests and the recovery request.

Use a new refactor-specific comparison harness. It resolves the baseline from its committed source and current modules from their new paths. Do not rewrite historical reports or mutate old verification harnesses merely to accommodate file moves.

For every generation row, require identical input identity, puzzle, assessment and diagnostic result, including the original work/layout/candidate/stage counters. Match existing payload/result fingerprints. Exact output equality lets the prior independent correctness evidence remain applicable; report reused evidence explicitly rather than claiming it was rerun.

Compare full old/new rating traces and results on authored fixtures and generated boards, not only summary difficulty. Preserve exact-search/trail/support equivalence and budget-exhaustion regressions. Add tests only for new boundaries, shared guards and previously uncovered ownership contracts; do not duplicate every private helper with a test.

Run all four TypeScript projects, whole lint/format checks, unit tests and root/subpath builds. Exercise actual emitted Workers at both roots and the affected game/lesson/hint/persistence/backup flows in available browser runtimes. Keep the three-second deadline. Document unavailable runtimes and distinguish device emulation from physical-device testing.

Complete one independent whole-change code review before reporting implementation complete. The review checks the dependency graph, preserved seeded outputs and work pricing, module ownership, paragraph breaks and comments as well as test results.

## Acceptance

The refactor is complete when responsibilities match the documented owners, external consumers use explicit imports, dependency checks enforce the boundaries, the code reads in coherent stages, source/tests/docs agree, and the observable baseline comparisons and relevant product checks pass.

## References reviewed

- [TypeScript narrowing and discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).
- [TypeScript object types and readonly semantics](https://www.typescriptlang.org/docs/handbook/2/objects.html).
- [TypeScript strict configuration](https://www.typescriptlang.org/tsconfig/strict.html).
- [typescript-eslint consistent type imports](https://typescript-eslint.io/rules/consistent-type-imports/).
- [typescript-eslint type-definition style options](https://typescript-eslint.io/rules/consistent-type-definitions/).
- [typescript-eslint non-null assertion guidance](https://typescript-eslint.io/rules/no-non-null-assertion/).
- [Web Architecture](../../architecture.md), [Variant Extension](../../variant-extension.md), [Repository Guidelines](../../../AGENTS.md), and [v10 verification](../verification/2026-10-15-feedback-guided-generation.md).
