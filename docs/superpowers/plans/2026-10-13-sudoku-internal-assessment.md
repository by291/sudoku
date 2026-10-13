# Sudoku Internal Assessment Implementation Plan

> Historical milestone: the user removed the Node CLI on 2026-10-13. CLI tasks, commands, and parity results below describe the earlier implementation and are no longer current requirements. The retained boundary suite now lives in `tests/module-boundaries.test.ts`. See the current README and the CLI-removal plan for active checks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase A: one versioned internal difficulty assessment used by development commands and production workers, with explainable workload statistics and optional saved summaries.

**Architecture:** Keep deduction execution in the pure TypeScript engine and move policy selection and trace summarization to explicit assessment owners. The Node CLI and browser worker adapt the same engine contracts. Carry compact assessment metadata beside the legacy puzzle; the existing session workflow and storage transaction own its lifetime.

**Tech Stack:** Node.js 26+, pnpm 12.11.2, TypeScript 6.0.3, Vite 8.3.4, Vue 3.5.43, Pinia 4.0.3, Web Workers, idb 8.0.4, Vitest 5.0.3, Playwright 1.64.0, ESLint, and Prettier 3.9.10. Reuse installed dependencies.

**Spec:** [Approved generation and rating design](../specs/2026-10-13-sudoku-generation-and-rating-design.md), committed as `4419e71`. Also read [AGENTS.md](../../../AGENTS.md), [Web Architecture](../../architecture.md), and [Adding a Sudoku Variant](../../variant-extension.md).

**Status:** Approved by the user on 2026-10-13. Native implementation completed and verified on `feat/internal-assessment`; changes remain uncommitted. See the [verification report](../verification/2026-10-13-sudoku-internal-assessment.md). The [Phase B draft](2026-10-13-sudoku-classic-terminal-diversity.md) is prepared for subsequent review, with no Phase B implementation in this milestone.

## Global Constraints

- Support Classic, Diagonal, Jigsaw, Killer, Thermo, and Arrow, each with Easy, Medium, and Hard. Preserve 简单、中等、困难 and the current player workflows, teaching content, and layouts.
- Write repository documentation, identifiers, comments, and test descriptions in English. Keep player-facing copy in Chinese.
- Keep the engine independent of Vue, Pinia, browser globals, storage, workers, and Node I/O. Use `@/` for source imports and retain the literal relative worker asset URL.
- Preserve `sudoku-v1`, `sudoku-variants-v1`, and all 36 frozen generation outcomes. Keep the raw `Puzzle` and `GenerationResult` shapes unchanged. Never regenerate compatibility expectations to make a refactor pass.
- Preserve legacy generation accounting: 20 layouts, 1,000,000 Classic search nodes, current variant work accounting, 500 logical steps per analysis, and the existing separate fallback budgets.
- Use assessment version `sudoku-rating-v1`. Default additional assessment limits are 500 steps per policy and 1,000,000 work units shared by validation and every policy attempt. Both adapters use the same defaults and supplied limits.
- Keep cancellation, stale-result fencing, retry inputs, and the 15,000 ms worker timeout. Assessment exhaustion makes the compatibility-phase summary unavailable; it does not invalidate an independently verified legacy puzzle.
- Persist only compact optional assessment metadata in format-2 sessions/results. Keep the IndexedDB schema at version 1. Missing summaries remain absent; corrupt or unsupported summaries become explicitly unavailable while the valid base session remains usable.
- Preserve completed-result facts, stored puzzle restoration, daily IDs and eligibility, save-before-switch ordering, and revision/lease/dataset fencing. Do not automatically assess or rewrite old saves/results.
- Keep uniqueness separate from rating. Use independent reference solvers and explicit fixture facts for correctness. A stalled or exhausted run never proves invalidity or a difficulty tier.
- Record a workload vector; defer numeric weights, new difficulty choices, workload filters, bottleneck analysis, telemetry, and advanced techniques.
- Work in the current checkout for documentation. Resolve execution isolation using the applicable skill before product edits. The current authorization covers the approved design commit; implementation commits need an explicit request.

## Review Focus

1. Failed easier policies can contaminate a later run or inflate its metrics. Start from fresh candidate state and summarize only the successful trace (Task 2).
2. Optional metadata can be unknown, corrupt, or belong to another type/tier. Report assessment unavailability without quarantining or replacing a valid game, and never accept its claimed grade (Tasks 3 and 5).
3. Moving rating code or charging new work can alter historical seed/fallback decisions. Keep legacy wrapper accounting pinned and all frozen outputs exact (Tasks 1, 2, and 7).
4. A correct-shaped response can arrive after cancellation, timeout, session switching, or a dataset reset. It must not install a puzzle or assessment into the new session (Tasks 4 and 5).
5. Adapter defaults, arithmetic rules, limits, and subpath assets can drift despite shared imports. Compare actual Node command output with real production worker output at both hosting roots (Tasks 6 and 7).

---

## Scope and File Ownership

Implement Tasks 1–7 sequentially. Task 2 supplies the assessment API; Task 3 supplies shared metadata decoding; Tasks 4–6 connect adapters and persistence; Task 7 verifies the complete milestone. Run each task's relevant checks before progressing.

| Owner                        | Create                                                                                       | Modify                                                                                                                               | Responsibility                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Policies and rating          | `src/core/sudoku/ratingPolicies.ts`, `rating.ts`, `ratingPolicies.test.ts`, `rating.test.ts` | `logic.ts`, `variantTechniques.ts`, `hint.ts`, generation modules, existing engine tests                                             | Ordered type-specific policies, bounded assessment, trace metrics, boundary validation, pinned legacy wrappers |
| Independent assessment facts | `tests/fixtures/rating.ts`                                                                   | Existing reference helpers only if a missing invariant requires it                                                                   | Eighteen type/tier cases, known solutions, explicit deduction witnesses, independent metric facts              |
| Worker adapter               | No extra worker or runtime layer                                                             | `src/worker/protocol.ts`, `sudoku.worker.ts`, `client.ts`, their tests                                                               | Assessment requests and generated-puzzle sidecars with existing resource lifetime                              |
| Session and storage          | No database migration                                                                        | `src/features/game/model/session.ts`, `stores/sessionTransitions.ts`, their tests; `src/storage/records.ts`, record/repository tests | Optional assessment snapshots through installation, restart, save, completion, and restoration                 |
| Development commands         | `tooling/sudoku-cli.ts`, `tooling/sudoku-cli.test.ts`, `vite.cli.config.ts`                  | `package.json`, `tsconfig.node.json`, `.gitignore`                                                                                   | Local JSON/JSONL input, generation reports, Node bundle and executable command tests                           |
| Conformance and guidance     | `tests/e2e/rating.spec.ts`                                                                   | Existing worker/browser tests, `README.md`, architecture and variant-extension docs                                                  | Node/worker equality, root/subpath behavior, fixed corpus report, actual extension requirements                |

Read the relevant installed-version official guidance before editing an area. For tooling, [Node TypeScript](https://nodejs.org/api/typescript.html#paths-aliases) does not resolve TypeScript `paths` aliases, so bundle the CLI with the existing [Vite library build](https://vite.dev/guide/build.html#library-mode), using [Vite 8 build options](https://vite.dev/config/build-options.html#build-rolldownoptions). Reuse the existing Vue, worker, persistence, and Playwright conventions; refresh official guidance when changing their APIs.

## Shared Contracts

Place assessment contracts in `rating.ts`; policies and their version live in `ratingPolicies.ts`. Keep these contracts available to both adapters without importing transport or persistence into the engine.

```ts
type RatingVersion = 'sudoku-rating-v1'
type AssessmentLimits = { maxSteps: number; maxWork: number }
type AssessmentInput = {
  board: Board
  rules: PuzzleRules
  ratingVersion: RatingVersion
  limits: AssessmentLimits
}
type ReasoningWorkload = {
  steps: number
  placements: number
  eliminations: number
  candidateRemovals: number
  techniqueCounts: Readonly<Record<Technique, number>>
  highestTier: Difficulty | null
  highestTechnique: Technique | null
  variantSteps: number
}
type DifficultyAssessment = {
  ratingVersion: RatingVersion
  variant: SudokuVariant
  difficulty: Difficulty
  workload: ReasoningWorkload
}
type AssessmentOutcome =
  | { status: 'rated'; summary: DifficultyAssessment }
  | { status: 'ungraded'; ratingVersion: RatingVersion; variant: SudokuVariant }
  | {
      status: 'budget-exhausted'
      ratingVersion: RatingVersion
      variant: SudokuVariant
      stage: 'validation' | 'logic'
      difficulty: Difficulty | null
    }
  | { status: 'invalid'; issues: readonly string[] }
type AssessmentResult =
  | { status: 'rated'; summary: DifficultyAssessment; trace: readonly LogicalStep[] }
  | Exclude<AssessmentOutcome, { status: 'rated' }>
type PuzzleAssessment =
  | { status: 'rated'; summary: DifficultyAssessment }
  | {
      status: 'unavailable'
      reason:
        | 'ungraded'
        | 'budget-exhausted'
        | 'invalid-input'
        | 'invalid-summary'
        | 'unsupported-version'
        | 'identity-mismatch'
      issues: readonly string[]
    }
type AssessmentIdentity = { variant: SudokuVariant; difficulty: Difficulty }
```

`techniqueCounts` has all eleven current technique keys. Techniques inapplicable to the type have zero counts. `candidateRemovals` counts distinct, present `(cell, digit)` removals explicitly made by elimination deductions; automatic candidate propagation after a placement and clearing the placed cell are excluded. This keeps broad elimination deductions visible without counting routine board maintenance.

`variantSteps` counts a step once when it has direct cage/Thermo/Arrow evidence, unit evidence carrying such premises, or explicit Diagonal/Jigsaw unit evidence. A complete board has zero workload and both highest fields are `null`. A normal nonempty trace chooses its highest technique by tier and then its position in that type's explicit Hard policy.

### Task 1: Extract Policies and Preserve Legacy Rating

**Files:** Create `ratingPolicies.ts` and `ratingPolicies.test.ts`; create the legacy-wrapper portion of `rating.ts`; modify `logic.ts`, `variantTechniques.ts`, `hint.ts`, `generation.ts`, `variantGeneration.ts`, and every rating/policy import located by `rg`, including `tests/e2e/worker.spec.ts`.

**Interfaces:** Export `RATING_VERSION`, `RatingVersion`, `RATING_POLICIES` satisfying `Record<SudokuVariant, Record<Difficulty, readonly Technique[]>>`, `TECHNIQUE_TIERS` satisfying `Record<Technique, Difficulty>`, and `LEGACY_VARIANT_POLICIES`. Move `rateDifficulty(board: Board, stepBudget: number): Difficulty | null` and `rateVariantDifficulty(board: Board, context: RuleContext, stepBudget: number, workBudget: WorkBudget): { status: 'rated'; difficulty: Difficulty | null } | { status: 'budget-exhausted' }` to `rating.ts` without changing their execution.

- [x] Run baseline `pnpm typecheck` and `pnpm test:unit`. Record actual results and existing notices before product edits; do not infer them from earlier runs.
- [x] Add policy tests `covers all six types with nested applicable policies` and `preserves the explicit technique order`. Assert Classic/Diagonal/Jigsaw singles → locked candidate → pairs; Killer adds `cage-distinct`, `cage-remainder` at Easy and `cage-combination` at Medium; Thermo adds `thermo-bound` at Easy; Arrow adds `arrow-equation` at Easy and `arrow-combination` at Medium. Assert no arithmetic technique occurs in an unrelated type.
- [x] Run `pnpm test:unit src/core/sudoku/ratingPolicies.test.ts`; expect missing new exports before implementation.
- [x] Define policies by filtering the current ordered variant lists to applicable techniques, preserving relative order. Copy the legacy global lists and wrappers exactly. Remove policy ownership from detector modules and rating orchestration from `logic.ts`; update consumers rather than adding a circular facade. Hints consume their type's Hard policy and retain the same effective detector order.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test:unit src/core/sudoku/ratingPolicies.test.ts src/core/sudoku/generationCompatibility.test.ts src/core/sudoku/generation.test.ts src/core/sudoku/variantPuzzle.test.ts src/core/sudoku/variantTemplates.test.ts src/core/sudoku/hint.test.ts src/core/sudoku/variantTechniques.test.ts tooling/module-boundaries.test.ts`. Expect all 36 frozen outcomes, previous hint conclusions, and lower-tier rejection checks to pass unchanged.

### Task 2: Assess Boards and Summarize Successful Traces

**Files:** Extend `rating.ts`; create `rating.test.ts` and `tests/fixtures/rating.ts`; modify `logic.ts` only for opt-in assessment work accounting.

**Interfaces:** Export the Shared Contracts, `DEFAULT_ASSESSMENT_LIMITS`, `createAssessmentInput(board: Board, rules: PuzzleRules, limits?: AssessmentLimits): AssessmentInput`, `parseAssessmentInput(value: unknown): ParseResult<AssessmentInput>`, `assessPuzzle(input: AssessmentInput): AssessmentResult`, `toAssessmentOutcome(result: AssessmentResult): AssessmentOutcome`, and `summarizeLogicalTrace(board: Board, context: RuleContext, steps: readonly LogicalStep[]): ParseResult<ReasoningWorkload>`. Extend `LogicalOptions` with optional `chargeClassicWork?: boolean`, defaulting to `false`; existing calls retain legacy accounting.

- [x] Add `rates a one-hole board with exact placement statistics`: use `solvedBoard` with cell 40 set to zero and Classic rules; expect Easy, one `naked-single` placement, zero eliminations/removals/variant steps, and exactly one total step. Add `rates a completed board without inventing a technique`: expect Easy with every count zero and both highest fields `null`.
- [x] Add eighteen fixture cases using the three Classic templates and all fifteen authored variant slots. Pin each expected type/tier and at least one concrete higher-tier deduction witness for Medium/Hard. Verify the known solution independently and each trace placement/removal against its explicit facts; never generate expected metrics by calling the new summarizer.
- [x] Add `summarizes only the successful policy trace`, `starts each policy with fresh candidates`, and `counts explicit eliminations without placement propagation`. Use a higher-tier fixture and an independent replay/count in the test; assert `steps = placements + eliminations = sum(techniqueCounts)`, actual removal counts, and no failed-attempt inflation. Add a unit deduction with variant premises and require it to count once, alongside direct clue and Diagonal/Jigsaw evidence cases.
- [x] Add boundary/outcome tests: malformed board/rules/version/limits → `invalid`; conflicting givens or independently confirmed clue violation → `invalid`; empty Classic board within limits → `ungraded`; incomplete board with zero step/work allowance → `budget-exhausted`; complete valid board with zero limits → `rated`. A work-exhausted validation without proof of violation remains inconclusive. Assert input snapshots are unchanged.
- [x] Run `pnpm test:unit src/core/sudoku/rating.test.ts`; expect missing contracts before implementation.
- [x] Implement input decoding with finite nonnegative safe-integer limits up to the Phase A defaults. Validate a snapshot, compile its rules, and check conflicts with one shared budget. Try Easy, Medium, then Hard from fresh workspaces; stop on exhaustion and retain only a successful trace. Charge one work unit before each Classic detector pass only when `chargeClassicWork` is enabled by assessment; preserve existing variant charges and every legacy caller. Add a nearby comment explaining the compatibility boundary.
- [x] Implement trace replay and summarization from the original candidate state. Reject duplicate/no-op removals and placements that cannot change an empty cell consistently, rather than counting them as reasoning. Use policy order for highest-technique ties and explicit evidence for variant counts; discard the trace when producing the compact outcome.
- [x] Run `pnpm typecheck` and `pnpm test:unit src/core/sudoku/rating.test.ts src/core/sudoku/ratingPolicies.test.ts src/core/sudoku/logic.test.ts src/core/sudoku/variantTechniques.test.ts src/core/sudoku/generationCompatibility.test.ts`. Expect all independent fixture facts, exact counts, budget states, and frozen legacy results to pass.

### Task 3: Decode Compact Summaries Independently of Base Puzzles

**Files:** Extend `rating.ts` and `rating.test.ts` with summary, outcome, and sidecar boundary checks.

**Interfaces:** Export `parseAssessmentSummary(value: unknown): ParseResult<DifficultyAssessment>`, `parseAssessmentOutcome(value: unknown): ParseResult<AssessmentOutcome>`, `decodePuzzleAssessment(value: unknown, identity: AssessmentIdentity): PuzzleAssessment | undefined`, and `toPuzzleAssessment(result: AssessmentOutcome, identity: AssessmentIdentity): PuzzleAssessment`. Only an absent value returns `undefined`; a present invalid value returns explicit unavailability.

- [x] Add `round-trips a valid versioned summary` and table cases for negative/fractional/unsafe counts, missing/unknown technique keys, nonzero inapplicable techniques, incorrect totals, highest-field disagreement, and `variantSteps > steps`. Assert `steps = placements + eliminations = sum(techniqueCounts)`, `candidateRemovals >= eliminations`, zero removals when there are no eliminations, and null highest fields exactly when there are no steps; reject contradictory summaries.
- [x] Add `retains absence for old records`, `reports unsupported summary versions`, and `reports type or tier disagreement`. Assert a known Easy summary beside a Medium puzzle becomes `unavailable/identity-mismatch`; no decoder changes the puzzle's grade. Test malformed unavailable markers and every compact domain outcome.
- [x] Run `pnpm test:unit src/core/sudoku/rating.test.ts` before implementation; expect missing decoders to fail.
- [x] Implement the shared decoders and conversions with fresh typed objects. Validate counts against policy membership, tier relationships, and associated puzzle identity. Decode issues as an array of nonempty strings and preserve explicit unavailability on reread. Map ungraded/exhausted/invalid assessment outcomes without inventing a summary or retrying assessment.
- [x] Run `pnpm typecheck` and `pnpm test:unit src/core/sudoku/rating.test.ts`. Expect each corruption case to return a typed, explicit result and valid summaries to round-trip exactly.

### Task 4: Run Shared Assessment Through the Production Worker

**Files:** Modify `src/worker/protocol.ts`, `client.ts`, `sudoku.worker.ts`, `protocol.test.ts`, and `client.test.ts`. Update typed worker test doubles only where the additive contracts require it.

**Interfaces:** Add request `{ kind: 'assess'; requestId: string; input: AssessmentInput }` and its response `WorkerOutcome<AssessmentOutcome>`. Export `GenerateOutcome = ({ status: 'completed'; value: Puzzle; assessment?: PuzzleAssessment }) | Exclude<WorkerOutcome<Puzzle>, { status: 'completed' }>`; generate responses/client results use it. Add `SudokuWorkerClient.assess(input: AssessmentInput, signal?: AbortSignal): Promise<WorkerOutcome<AssessmentOutcome>>`; keep `generate` parameters and `hint` behavior compatible.

- [x] Add protocol tests for valid assessment requests/outcomes, rejected malformed inputs/outcomes, legacy generated replies without metadata, and generated replies with corrupt metadata. Assert a valid puzzle still completes with an unavailable assessment when only its optional sidecar is invalid.
- [x] Add client tests for assessment cancellation/disposal, exact 14,999/15,000 ms timeout behavior, ignored stale IDs, mismatched assessment type/version, and malformed matching-ID replies. Assert generation retries send the identical input and late replies cannot replace cancellation.
- [x] Run `pnpm test:unit src/worker/protocol.test.ts src/worker/client.test.ts`; expect the new assessment cases to fail before implementation.
- [x] Extend envelope parsing with the Task 2/3 engine decoders. Validate assessment identity against its request. Use named branches for generate/hint/assess dispatch; keep worker creation, literal asset URL, settling, and disposal in the existing client owner.
- [x] For a ready legacy generation result, call `assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))` using its separate default budget, then attach `toPuzzleAssessment(...)`. Return the original puzzle unchanged. An assessment failure becomes unavailable metadata; generation failure, cancellation, and timeout retain their existing meanings. Explicit assessment requests return the compact domain outcome.
- [x] Run `pnpm typecheck` and `pnpm test:unit src/worker/protocol.test.ts src/worker/client.test.ts src/core/sudoku/generationCompatibility.test.ts`. Expect legacy response acceptance, typed new outcomes, timeout/cancellation disposal, and exact seeded outputs to pass.

### Task 5: Preserve Assessment Snapshots Across Session Persistence

**Files:** Modify `src/features/game/model/session.ts`, `session.test.ts`, `stores/sessionTransitions.ts`, `asyncLifecycle.test.ts`, `dailyStore.test.ts`, `src/storage/records.ts`, `records.test.ts`, and `repository.test.ts`. Adjust other store fixtures only when their types require it.

**Interfaces:** Add `assessment?: PuzzleAssessment` to `GameSession`, separate from `puzzle` and mode metadata. Extend `createSession(puzzle: Puzzle, metadata: SessionMetadata, id: string, startedAt: string, assessment?: PuzzleAssessment): GameSession`. Change private `replaceWithPuzzle` to accept an options object `{ id?: string; epoch?: number; signal?: AbortSignal; assessment?: PuzzleAssessment }` instead of adding more positional parameters. Keep repository public contracts and format/schema versions intact.

- [x] Add record/repository tests `keeps a valid game when its assessment is corrupt or unsupported`, `restores old sessions without assessment`, and `preserves the completed assessment snapshot`. Assert valid base fields, revision, assistance, history, completion, and original difficulty survive; missing metadata does not appear; invalid metadata does not quarantine a valid base record. An invalid base record still follows existing quarantine behavior.
- [x] Add session/store tests for generated summary installation, unavailable summary installation, free restart retaining the same puzzle assessment, and save/completion round-trip. Restoring a save or result must not invoke `worker.assess` or regenerate its puzzle.
- [x] Add a pending generated reply carrying an assessment, then cancel/switch/reset before it resolves. Assert both old puzzle and summary stay fenced. Extend daily tests to assert old formal IDs/eligibility and stored assessments take precedence over another construction.
- [x] Run `pnpm test:unit src/features/game/model/session.test.ts src/features/game/stores/asyncLifecycle.test.ts src/features/game/stores/dailyStore.test.ts src/storage/records.test.ts src/storage/repository.test.ts`; expect new metadata assertions to fail before implementation.
- [x] Decode the optional field only after the base puzzle/session is independently valid. Thread the generated sidecar through the existing guarded installation transaction. Keep snapshot cloning, save queues, revisions, leases, result creation, and dataset-reset handling in their existing owners. Use the options object to retain metadata on free restart; daily restart preserves its existing session snapshot.
- [x] Run `pnpm typecheck` and `pnpm test:unit src/features/game/model/session.test.ts src/features/game/stores/asyncLifecycle.test.ts src/features/game/stores/dailyStore.test.ts src/features/game/stores/sessionPersistence.test.ts src/storage/records.test.ts src/storage/repository.test.ts src/storage/saveQueue.test.ts src/features/records/model/records.test.ts`. Expect snapshots and existing daily/save/record facts to pass with no database migration or regrading.

### Task 6: Add Local CLI Assessment and Fixed-Seed Reports

**Files:** Create `tooling/sudoku-cli.ts`, `tooling/sudoku-cli.test.ts`, and `vite.cli.config.ts`; modify `package.json`, `tsconfig.node.json`, `.gitignore`, and README commands.

**Interfaces:** Export `runSudokuCli(args: readonly string[], io: { readText(path: string): Promise<string>; writeOutput(text: string): void; writeError(text: string): void }): Promise<0 | 1 | 2>` for adapter tests. The executable binds Node file/stdout/stderr operations and assigns its returned exit code. Keep these I/O functions out of the engine.

The command contract is `pnpm sudoku:cli assess --input <json> [--trace]`, `pnpm sudoku:cli batch --input <jsonl> [--trace]`, and `pnpm sudoku:cli generate --input <jsonl> [--trace]`. Assessment lines carry `{ id, board, rules, ratingVersion?, limits? }`; generation lines carry `{ id, input: GenerationInput, generationLimits?, assessmentLimits? }`. Missing assessment version/limits use the shared engine defaults. Each report includes `reportVersion: 1`, `id`, `request: AssessmentInput | null`, `assessment: AssessmentOutcome | null`, and optional successful `trace`. Generation reports additionally include `generation: { input: GenerationInput; limits: GenerationLimits; result: GenerationResult }`, retaining the exact raw outcome/source and normalized limits; a failed generation has null assessment/request. A malformed line uses null request and an `invalid` assessment with issues, its one-based line number, and `line-<number>` as the ID when its supplied ID cannot be decoded.

- [x] Add adapter tests for single JSON, ordered JSONL, all domain outcomes, unknown flags/version/type, malformed JSON at a numbered line, missing files, and explicit limits. Assert stdout contains only machine-readable reports; diagnostics go to stderr. Batch processing retains a report for malformed lines and continues in input order. Exit `0` means all requested assessments rated/generations succeeded; `1` means a domain/line failure; `2` means command or file-I/O failure.
- [x] Add a forced-fallback generation report using `{ maxLayouts: 0, searchNodes: 0, logicalSteps: 500, fallbackNodes: 1000000 }`. Assert its raw result matches `generatePuzzle` and source is `fallback`. Zero fallback budget remains a generation exhaustion report with no assessment, rather than a fabricated grade.
- [x] Run `pnpm test:unit tooling/sudoku-cli.test.ts`; expect missing CLI exports before implementation.
- [x] Implement argument parsing with Node's maintained `parseArgs`, local input decoding, and shared assessment/conversion functions. Decode CLI-only generation limits with the existing four keys and `DEFAULT_GENERATION_LIMITS` bounds before calling `generatePuzzle`; preserve the generator's own validation and accounting. Include line numbers and explicit issues in malformed-line reports. Keep per-policy defaults, grading, and metric calculation in the engine. `--trace` exposes only a successful assessment trace; timing, if recorded, is an adapter diagnostic outside the equality contract.
- [x] Configure an ES-only Vite CLI bundle at `dist-cli/sudoku-cli.js`, with the existing absolute `@` alias, external `node:` built-ins, `publicDir: false`, and output isolated from application builds. Set `build:cli` to `vite build --config vite.cli.config.ts`, `sudoku:cli` to `node dist-cli/sudoku-cli.js`, and include `pnpm build:cli` before browser checks in `check`. Include the config in Node type checking and ignore generated output. Test imports must not auto-run the executable; README examples build the CLI before invoking it.
- [x] Add an actual-process test in a Node-environment suite that builds the CLI once in its setup before spawning it against a temporary one-hole fixture. It must work during a clean `test:unit` run with no pre-existing bundle. Assert the Task 2 exact summary, argument forwarding, machine-readable stdout, and process exit code.
- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm test:unit tooling/sudoku-cli.test.ts`, `pnpm build:cli`, and an actual `pnpm sudoku:cli assess --input <one-hole-fixture-file>` process. Expect clean Node execution and the same exact summary from both the imported adapter and executable.

### Task 7: Verify Adapter Parity and the Complete Milestone

**Files:** Create `tests/e2e/rating.spec.ts`; modify `tests/e2e/worker.spec.ts`, storage/game browser tests only for missing regression coverage, and `README.md`, `docs/architecture.md`, `docs/variant-extension.md`. Update this plan with actual verification evidence.

**Interfaces:** Consume the executable reports, `AssessmentOutcome`, and the real built `WorkerRequest/WorkerResponse` contracts. Reuse production asset discovery and static preview conventions from `worker.spec.ts`; fixtures provide identical normalized requests to both adapters.

- [x] Add `returns identical assessments from Node and real production workers` over all eighteen type/tier fixtures plus complete, ungraded, exhausted, and shape-valid conflicting-givens (`invalid`) cases. Spawn the built Node CLI, send the same validated request to the real emitted worker, decode both, and assert exact compact-outcome equality. Malformed envelopes remain adapter rejection tests in Task 4 rather than being treated as accepted domain requests. At `/sudoku/`, repeat representative Classic and each variant assessment with explicit limits. Exclude diagnostics/timings from equality.
- [x] Add production generation-sidecar assertions for each type and stored-metadata browser regressions: reload a newly generated session, retain its summary, restore a legacy session with no summary, and keep a playable valid session whose sidecar is unsupported. Reuse existing cancellation, game, daily, learning, and storage tests rather than duplicating already covered player flows.
- [x] Run `pnpm build`, `pnpm build:subpath`, `pnpm build:cli`, then `pnpm test:e2e tests/e2e/rating.spec.ts tests/e2e/worker.spec.ts` across every configured project. Expect exact domain parity and restored snapshots after Tasks 1–6. Use the documented project-local browser cache when required; the conformance suite verifies the integrated contracts without manufacturing a failing test for already implemented behavior.
- [x] Run a fixed report corpus: all eighteen authored assessment fixtures and two seeds per type/tier, `rating-corpus-01` and `rating-corpus-02`, with shared default limits. Report generated/fallback frequencies, ungraded/exhausted outcomes, workload distributions, and diagnostic execution times separately. Confirm every rated generation summary agrees with its puzzle; investigate disagreement rather than changing fixtures or deriving an extra grade.
- [x] Update guidance with actual CLI examples, summary fields/count semantics, assessment-versus-generation versions, explicit unavailability behavior, ownership/import direction, and required rating-policy/fixture registration for future variants. Document that broader Classic terminal construction and `sudoku-v2` remain Phase B; this phase establishes their assessment foundation.
- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, `pnpm build:subpath`, `pnpm build:cli`, and `pnpm test:e2e`. Expect every configured check to pass. Record actual unavailable browser runtimes or unresolved failures; do not claim their checks passed.
- [x] Review `git diff --check`, the full changed-file list, boundaries, all frozen generation results, optional-metadata behavior, and corpus evidence. Complete the selected execution workflow's final review and address findings. Report Phase A outcomes and any material limitations; leave implementation changes uncommitted until requested.

## Completion Evidence

Post-review checks passed: type checking, ESLint, Prettier, 529 unit tests across 47 files, root/subpath/CLI builds, and all 370 browser tests with two expected desktop-only skips. Desktop/mobile/Firefox ran with two Workers; WebKit ran with one. The initial combined check had browser failures; the report preserves those failures and the exact successful rerun conditions rather than claiming that command passed.

All 36 historical generation cases are unchanged. Both adapters agree over the authored/domain fixture corpus and hosting roots. All 54 fixed report-corpus outcomes matched exactly after the review fixes. One fresh review identified two Important findings; regression tests and one fix pass resolved contradictory summary counts and missing independent higher-tier witnesses. No Minor findings were deferred. Local documentation links and `git diff --check` passed.

## Phase B Handoff

After Phase A is verified, prepare a separate implementation plan for seeded randomized Classic terminal construction, aggregate generation work accounting, independently demonstrated terminal equivalence-class diversity, `sudoku-v2` dispatch, legacy-version parsing, and a future Beijing-date daily cutover. Keep free-play defaults separate from date/type daily mapping and retain stored formal attempts. Variant diversity extensions and workload-derived numeric scoring remain separately reviewed changes.

## Plan Self-Review

- Approved Phase A requirements map to Tasks 1–7; the Phase B boundary and deferred work are explicit.
- Shared names and types are defined before their adapter/storage consumers. The engine has no transport, database, or Node-I/O dependency.
- The five Review Focus failure modes have named tests in their owning tasks.
- Tests combine frozen compatibility, known deduction facts, independent solutions/replay, and actual adapter execution. No result is certified only by calling the implementation under test again.
- This document defines interfaces, values, file ownership, and checkable outcomes; implementation bodies and uncalibrated scoring weights are left out.
