# Android Guidelines

Follow the root repository guidelines and the approved Android design in `../docs/superpowers/specs/2026-10-16-android-client-design.md`.

- Keep all Android-specific sources, including the Rust FFI adapter, in this directory. Reuse `../sudoku/core`.
- Use Kotlin with four-space indentation, explicit imports, braces, descriptive names, and blank lines between meaningful workflow stages.
- Write Chinese player copy and English identifiers, comments, documentation, and test descriptions.
- Keep Kotlin-only contracts in `core/domain`, native ownership in `core/engine`, persistence and asset loading in `core/data`, generic theme in `core/design`, controlled board presentation in `core/ui`, and complete workflows in `feature/game`, `feature/learning`, and `feature/records`. App owns bootstrap and navigation only.
- Apply no Sudoku algorithm in Kotlin. All edits and mathematical facts come from the engine contract.
- Features expose Route entry points; screens and ViewModels stay internal. Features never import sibling features, app, data implementations, or generated bindings. Generic design has no domain dependencies. Build defaults live in `build-logic`, and Gradle checks configured project edges.
- Use immutable UI state and lifecycle-aware collection. Release native objects only after their in-flight calls return.
- Treat persisted and imported data as untrusted. Preserve inconclusive records and distinguish cancellation, timeout, exhaustion, and failure.
- Keep every player operation consistent across touch, keyboard, and hints. Do not put native calls or database writes in composable bodies.
- Run `./gradlew qualityCheck :app:assembleDebug` for changes spanning modules. Run focused JVM or instrumentation tests while developing.
- Do not commit, reset, or change unrelated Web/Rust work without explicit authorization.
