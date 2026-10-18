# Android Guidelines

These rules supplement the [repository guidelines](../AGENTS.md) for `android/`, including its Rust FFI adapter. For Rust work, also read the [Rust guidelines](../sudoku/AGENTS.md). Use [architecture](../docs/android/architecture.md) for module/ownership changes, [data loading](../docs/android/data-loading.md) for persistence and queries, and [build](../docs/android/build.md) for tooling, bindings and packaging.

## Ownership

- Keep Android-specific sources, including the Rust FFI adapter, in this directory. Reuse `../sudoku/core`; do not implement Sudoku algorithms in Kotlin.
- Keep Kotlin-only contracts in `core/domain`, native ownership in `core/engine`, persistence and asset loading in `core/data`, generic theme in `core/design`, and controlled board presentation in `core/ui`. App owns bootstrap, dependency composition, global preferences and navigation.
- Keep complete workflows in their feature. Routes connect platform lifecycle and navigation to an internal screen and ViewModel. Features never import sibling features, app, data implementations or generated bindings. Generic design has no domain dependencies.
- Use one owner for a complete transaction. `GameController` owns session transitions and ordered saves; `GameEntryController` owns entry queries. `RecordsViewModel` coordinates independent query and backup controllers. `LearningProgressWriter` owns durable advancement separately from lesson presentation.
- Keep Room schema/migrations, compact queries, projection validation, coverage and selected-detail repair under their focused data owners. Do not move business rules into generic utilities or introduce callback-heavy context objects to shorten files.
- Register every module and allowed project edge in the root build. `checkModuleDependencies` rejects unknown modules and forbidden edges. Build defaults belong in `build-logic`.

## Readability and contracts

- Use Kotlin with four-space indentation, explicit imports, braces and descriptive names. Write Chinese player copy and English identifiers, comments, documentation and test descriptions.
- Separate adjacent function/class declarations and distinct workflow stages with one blank line. Keep related properties and tightly coupled calculations together. The Android-local `.editorconfig` enables ktlint's declaration-spacing rule; the formatter cannot decide where input guards, preparation, side effects and returned results need a paragraph break.
- Prefer direct branches and named domain predicates over nested outcome selection. Keep short calls and conditions readable rather than retaining unnecessary multiline wrapping. Name non-obvious budgets, intervals and bit masks; ordinary board geometry and cohesive layout need no arbitrary extraction.
- Keep screens, ViewModels and implementation collaborators internal unless another module needs their contract. Public data describes facts; resource-owning objects expose validated operations and explicit disposal.
- Comment where correctness depends on ordering or ownership: immutable snapshots before suspension, operation generations, dataset epoch/revision/editor fences, save-before-switch and delayed native disposal. Explain what would break without the constraint; do not narrate obvious code.
- Use concise KDoc for non-obvious public contracts: resource lifetime, cancellation, mutation, milliseconds, preconditions and incomplete outcomes. Preserve these comments when moving code.

## State and platform boundaries

- Use immutable UI state and lifecycle-aware collection. Keep each state workflow with its derived values, actions and cleanup. Do not call native code or write the database in composable bodies.
- Snapshot mutable input before suspension. Retain operation and dataset fences when refactoring. Settings updates must preserve fields owned by other operations; late completions must not restore disposed owners.
- Release native handles only after actual in-flight execution returns. Distinguish conclusive invalid input from cancellation, timeout, budget exhaustion and unavailable execution. Inconclusive data must not authorize quarantine or destructive replacement.
- Keep unknown personal progress, summary coverage and query failure distinct from known-empty values. Preserve existing usable results during ordinary refresh, and invalidate old-epoch facts on restore/clear.
- Route touch, keyboard and hint operations through the same session actions. Keep keyboard ownership, modal focus, touch targets and non-color error/evidence semantics observable.
- Check the installed dependency version and relevant official documentation before introducing an API. The UniFFI Android cleaner configuration selects guarded API 34+ SystemCleaner and JNA below it; declare its generated `RequiresApi` dependency explicitly. Keep crate-local `ffi/uniffi.toml` discovery through Cargo metadata; `--config` expects global configuration. Change generator configuration and regenerate normally, never edit or suppress generated bindings.

## Verification

Run Gradle commands from `android/`, or use `android/gradlew -p android` from the repository root. Documentation-only changes use the root documentation checks.

- For Kotlin/build-source edits, run `./gradlew spotlessApply` and review logical paragraphs yourself. Do not disable formatter or lint checks to pass a gate.
- Run `./gradlew qualityCheck :app:assembleDebug` for changes spanning modules. The gate includes every registered Android module's debug lint, authored-source formatting, module directions and applicable JVM suites. Instrumentation and release checks are separate gates.
- Test observable behavior and domain invariants. Separate arrangement, action and assertions with blank lines. Use fixed independent fixtures; extraction alone does not require mirror tests of private helpers.
- For FFI configuration changes, rebuild generated bindings and packaged APKs, run host/native checks, and exercise affected runtime branches on disposable AVDs. Native cancellation tests must distinguish signalled return from work exhaustion.
- Preserve backup v1/session v2 compatibility and independent Web fixtures. Actual export/reimport evidence requires the Android-produced fixture, not a fixture regenerated from Android expectations.
- Report executed commands, suites, device/ABI and limitations in the change summary. Keep reusable instructions under the root `docs/android/`; do not commit dated verification reports, screenshots or run logs. Use explicit disposable device serials; never modify a personal emulator or physical device without authorization.
