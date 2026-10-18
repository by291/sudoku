# Sudoku · 一格一念

A local Sudoku game with Chinese Web and native Android interfaces, powered by one reusable Rust engine.

- Six variants: Classic, Diagonal, Jigsaw, Killer, Thermo and Arrow.
- Free play with 19 variant/difficulty combinations, daily challenges and personal records.
- 32 courses with guided reasoning and interactive exercises.
- Notes, undo/redo, logical hints, pause/resume and local saves.
- Compatible backup files for moving player data between Web and Android.

The Web client is statically hosted and stores data in the browser. Android runs independently offline. Accounts, automatic cloud synchronization, social features and Web PWA installation are outside the scope.

## Quick start: Web

Install Node.js 26+, Corepack and Rust through rustup. The repository pins pnpm and the Rust toolchain.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. The development command builds the Rust/WASM package automatically; the first run installs the pinned binding tool. Restart it after changing Rust source.

```sh
pnpm exec playwright install chromium firefox webkit
pnpm check
```

`pnpm check` runs type checks, lint, formatting, unit tests, production builds and browser tests. See [development and deployment](docs/development.md) for individual commands, requirements, CI and troubleshooting.

## Quick start: Android

Install JDK 21, Android SDK platform 37 and NDK `29.0.14206865`, and configure `ANDROID_HOME` or `android/local.properties`.

```sh
cd android
./gradlew qualityCheck :app:assembleDebug
```

Debug APKs are produced separately for arm64-v8a and x86_64. See the [Android build guide](docs/android/build.md) for installation, release packaging and device checks.

## Documentation

The [documentation index](docs/README.md) groups maintained documents by topic.

| Topic                                                   | Document                                             |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Modes, variants, controls and player data               | [Product behavior](docs/product.md)                  |
| Rust ownership, generation, rating and seed identity    | [Engine](docs/engine.md)                             |
| Algorithm principles, supported techniques and research | [Algorithms](docs/algorithms/README.md)              |
| Vue workflows, lazy computation and browser persistence | [Web architecture](docs/architecture.md)             |
| Backup format, validation and replacement               | [Local backup](docs/local-backup.md)                 |
| Shared authored lessons and durable progress            | [Learning content](docs/learning.md)                 |
| Required variant registration and invariants            | [Adding a variant](docs/variant-extension.md)        |
| Android modules, native lifetime and state ownership    | [Android architecture](docs/android/architecture.md) |
| Room projections, migration and on-demand reads         | [Android data loading](docs/android/data-loading.md) |
| Native navigation, layout and accessibility             | [Android interface](docs/android/interface.md)       |

Read [repository guidelines](AGENTS.md) and the relevant topic before changing behavior. Android also has [local guidelines](android/AGENTS.md). Documentation, identifiers and code comments use English; player-facing copy uses Chinese.
