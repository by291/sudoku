# Repository Guidelines

These instructions apply to the entire repository. Read the relevant scoped guide before editing its area; it supplements this file. A closer `AGENTS.md` takes precedence for files in its directory. When working from the repository root, open the scoped guide explicitly.

## Project and entry points

Sudoku has a Vue/TypeScript Web client and a Kotlin/Compose Android client sharing one synchronous Rust engine. Player data stays local; the Web client has no backend service.

- **Web:** `src/` and [Web guidelines](src/AGENTS.md); use the same guide for Web tests/tooling. Read [architecture](docs/architecture.md) for dependencies/ownership and [development](docs/development.md) for setup/deployment.
- **Rust/WASM:** `sudoku/core`, `sudoku/wasm` and [Rust guidelines](sudoku/AGENTS.md). Use [Engine](docs/engine.md) for computation/identity contracts and [algorithms](docs/algorithms/README.md) for mathematical changes.
- **Android:** `android/` and [Android guidelines](android/AGENTS.md); also read the Rust guide for `android/ffi`. Use Android [architecture](docs/android/architecture.md), [data loading](docs/android/data-loading.md) or [build](docs/android/build.md) for the changed boundary.
- **Product/data:** [Product](docs/product.md) owns player behavior, [learning](docs/learning.md) owns lessons and [backup](docs/local-backup.md) owns import/export. The [documentation index](docs/README.md) lists maintained topics.
- **Tests/extensions:** [Testing](docs/testing.md) owns coverage, fixture provenance and compatibility; follow the [variant checklist](docs/variant-extension.md) when adding a variant.

## Working conventions

- Write documentation, identifiers, comments, docstrings and test descriptions in English. Write player-facing copy in Chinese.
- Inspect Git status before editing and preserve unrelated work. Commit, push and merge only when the user authorizes the respective action; authorization already given for the current task remains valid.
- Use the repository's pinned tools. `package.json` owns Node requirements and pnpm; `rust-toolchain.toml` owns the Rust toolchain; Cargo manifests/lockfile and `android/gradle/libs.versions.toml` own dependency versions. Avoid copying changing version numbers into these instructions.
- Before introducing an API or materially changing an area, check its installed version, existing conventions and relevant official documentation. Prefer current first-party guidance; reuse research already done in the task.
- Keep maintained documentation under `docs/`, organized by topic. Update the existing topic when a contract changes. Do not add one-off plans, execution journals, screenshots or verification reports.
- Edit source manifests/configuration and regenerate through the owning build. Do not hand-edit generated WASM, TypeScript or Kotlin bindings, or commit ignored build output.

## Readability and responsibility

- Keep functions, components and modules focused on one coherent responsibility. Split by reasons to change, coupled state and dependencies, not arbitrary line limits. Introduce abstractions only for current clarity or meaningful reuse.
- Prefer descriptive domain names, named constants and explicit control flow. Avoid deeply nested branches, unrelated outcomes in nested ternaries, generic `utils` containers and callback-heavy context objects that merely shorten a file.
- Separate imports from declarations, adjacent functions, and meaningful stages with one blank line. Within workflows, distinguish guards, preparation, computation, side effects and results; keep tightly related calculations together. Declare variables separately.
- Keep a reactive workflow's state, derived values, actions and cleanup together. Do not scatter effects just to group every declaration of the same kind.
- Comments explain why correctness depends on a constraint: ownership/revision fencing, snapshots before suspension, save-before-switch ordering, random-call order or cancellation checkpoints. Place them beside the operation, preserve them when moving code and remove stale explanations. Add a brief responsibility comment at a complex module boundary when its ownership is otherwise unclear. Do not narrate obvious code.
- Document non-obvious public contracts: ownership/disposal, mutation, cancellation, preconditions, units and incomplete outcomes. Use JSDoc, rustdoc or KDoc as appropriate; do not repeat types or document every trivial accessor.
- Validate external and persisted input before mutation. Preserve atomic failure, distinguish incomplete/unavailable/cancelled outcomes from success, and never hide failures with empty catches or success-shaped defaults.
- Formatting tools handle layout, not logical paragraphs or responsibility boundaries. Review both; do not disable lint, type or formatting checks to pass a gate.

## Shared computation and compatibility

- Rust owns Sudoku rules, search, deductions, assessment and generation. Keep platform conversion in `sudoku/wasm` and `android/ffi`; do not introduce a production TypeScript or Kotlin solver.
- Preserve persisted formats, worker/FFI contracts, owned outputs, historical saved text and version-owned puzzle identities. Seeds contain exactly 32 bytes; new metadata uses strict lowercase 64-character hex and v12 identities. An incompatible change requires an explicit version/compatibility decision.
- Preserve deterministic random-call ordering, cooperative cancellation, bounded local exploration, exact-search restoration and rating-prefix semantics. Do not weaken correctness or local safety bounds to make deadline checks pass.
- For variants, keep explicit rule shapes and exhaustive registration. Distinguish full nine-digit units, duplicate-exclusion peers, highlights and arithmetic/path constraints. A new primitive needs candidates, conflicts, completion, exact counting, deductions/evidence, boundary validation and accessible presentation. Follow the variant checklist rather than adding scattered dispatch branches or a general-purpose plugin framework.
- Rust native tests own algorithm regressions. Preserve sealed independent fixtures and focused mathematical validators; never derive their expected outputs from the implementation under test. Comparisons between Rust-backed paths establish transport/consistency, not independent mathematical evidence. Do not restore the retired TypeScript engine or migration comparison harness.

## Setup and verification

Run commands from the repository root unless stated otherwise. Web setup is `corepack enable` and `pnpm install --frozen-lockfile`; `pnpm dev` builds WASM and starts Vite. Follow the development/build guides for browser and Android SDK installation.

Choose checks for the changed boundary; do not run unrelated suites for a documentation edit. Test observable behavior and invariants, use fixed seeds/independent fixtures, and separate arrangement, action and assertions with blank lines. Refactoring alone does not require tests that mirror private helpers.

| Change                                             | Verification                                                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation only                                 | Review content and relative links; run `pnpm exec prettier --check <changed-markdown-files>` and `git diff --check`                                   |
| Web source or dependencies                         | `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build`; check formatting and relevant player flows                                             |
| Browser behavior, workers or WASM boundary         | Build with `pnpm build`, then `pnpm exec playwright test <affected-specs> --project=<project>`; projects are `desktop`, `mobile`, `firefox`, `webkit` |
| Rust source, dependencies or contracts             | Use the native, Clippy and dependency checks in [Rust guidelines](sudoku/AGENTS.md); rebuild and test affected adapters/consumers                     |
| Android source, native packaging or backup interop | Use the scoped gates in [Android guidelines](android/AGENTS.md) and the [build guide](docs/android/build.md)                                          |

`pnpm typecheck`, `pnpm test:unit` and production builds rebuild WASM first. Direct Vitest/consumer commands need `pnpm wasm:build` after Rust changes. Vite build success does not establish Vue/TypeScript type correctness. Playwright normally builds its subpath deployment; `PLAYWRIGHT_USE_PREBUILT=1` requires both root and subpath builds to exist.

`pnpm check` runs the broad Rust/Web workflow; it does not include every Clippy, Android or device gate. CI definitions in `.github/workflows/` are the source of truth for remote checks. Report what actually ran, its result and any remaining coverage limits; distinguish local tests, device tests and remote CI.

## Maintaining these instructions

Keep root guidance cross-cutting and put area-specific rules in the nearest scoped guide. Link to detailed architecture and procedures instead of duplicating them. Add durable, actionable constraints; remove obsolete rules and verify paths/commands when their owners change. Keep task history and temporary workarounds out of this file unless they remain necessary project constraints.
