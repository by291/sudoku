# Web development and deployment

For Android requirements and packaging, use [Android build](android/build.md). Mathematical invariants and Rust commands belong to [Engine](engine.md) and [the core README](../sudoku/core/README.md).

## Requirements and setup

Use Node.js 26 or later and the repository-pinned pnpm 12.11.2. TypeScript is pinned to 6.0.3 for compatibility with the installed lint tooling.

Install Rust through rustup as well. `rust-toolchain.toml` pins Rust 1.98.0, Clippy, rustfmt and the `wasm32-unknown-unknown` target. Development, type checking, unit tests and production builds run `pnpm wasm:build` first. It compiles the separate Rust core and binding crates and installs the pinned wasm-bindgen CLI automatically on the first run. Generated JS/WASM/declarations stay under the ignored workspace package; no manually copied binary is required.

After changing Rust source, restart `pnpm dev` to rebuild WASM. Vite owns the emitted binary URL at both `/` and `/sudoku/`; computation loads lazily, and initialization failures offer retry in the affected workflow. Summary browsing and navigation do not require WASM readiness.

Repository text uses LF line endings on every platform. Git attributes, EditorConfig, and Prettier enforce the same convention, including Windows checkouts with `core.autocrlf` enabled.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

Open the Local URL printed by Vite. No server account, API keys, or backend service is required.

## Commands

| Command                             | Purpose                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| `pnpm wasm:build`                   | Build pinned Rust/WASM and generated TypeScript contracts         |
| `pnpm dev`                          | Start the development server on loopback                          |
| `pnpm typecheck`                    | Check Vue, browser, worker, Node-config, and browser-test types   |
| `pnpm lint`                         | Check correctness, Vue conventions, and module boundaries         |
| `pnpm format:check` / `pnpm format` | Check or apply formatting                                         |
| `pnpm test:rust`                    | Run the Rust workspace's algorithm and adapter tests              |
| `pnpm test:unit`                    | Run domain, store, component, and storage tests                   |
| `pnpm build`                        | Create the production `dist/` directory                           |
| `pnpm build:subpath`                | Create the `/sudoku/` verification build in `dist-subpath/`       |
| `pnpm preview`                      | Serve the production build locally                                |
| `pnpm test:e2e`                     | Test the production build in Chromium, Firefox, and mobile WebKit |
| `pnpm check`                        | Run Rust tests, Web checks, builds, and browser tests             |

Build before running `test:e2e` directly. Playwright starts preview servers on ports 4173 and 4174; its second server builds and tests `/sudoku/` deployment in `dist-subpath/`. Test output, traces, and screenshots are ignored by Git. Tests use isolated browser contexts, fixture records for lengthy completion scenarios, and real production workers for generation and hints.

Every production build validates all 32 bundled lessons and their 116 teaching stages with Rust/WASM before emitting the verified catalogue. Invalid proofs, incomplete validation, and validator errors fail the build. Runtime loading retains structural checks without repeating these mathematical proofs; saved-game and backup validation still runs at its existing boundaries.

## Browser installation and local output

Playwright's installed browser binaries must match the pinned package. If a host cannot launch from its default cache, use a separate ignored cache with the same location during installation and test execution. In PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD '.tools/playwright-browsers'
pnpm exec playwright install --no-remove chromium firefox webkit
pnpm check
```

Browser screenshots and traces belong under ignored `test-results/`; browser HTML reports use `playwright-report/`. These outputs are disposable and are not project documentation. Checked-in independent input/oracle fixtures remain under `tests/`.

## Continuous integration and dependency updates

[CI](../.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatches. Ubuntu 24.04 jobs install Node.js 26 and the `packageManager`-pinned pnpm with a frozen lockfile. Rust native tests and Clippy, TypeScript checks, lint, formatting, Web unit tests, and root/subpath builds run before browser jobs. Full comparisons against the retired TypeScript engine are not part of CI; browser jobs retain real WASM contract tests and player workflows. Desktop Chromium, mobile Chromium, Firefox, and WebKit run as separate matrix jobs; WebKit uses one worker. Browser jobs download the WASM package and both production deployments from the checks job instead of rebuilding Rust or the application. Each job installs its browser with system dependencies and retains its HTML report, failure screenshots, and traces for seven days. Rust build jobs cache Cargo dependencies, target output, and private CLI tools, with keys partitioned by platform, toolchain, manifests, lockfile, and source inputs. Actions use release commit hashes, and superseded runs are cancelled.

[Android CI](../.github/workflows/android.yml) checks and builds the native client and verifies the portable backup contract in both directions: the current Web exporter must match the checked-in fixture, Android imports and exports that fixture, and Web restores the actual Android output. It does not run device instrumentation tests. The domain test declares its exported backup as a Gradle output so cached test results retain the file required by Web.

[Dependency graph submission](../.github/workflows/dependency-submission.yml) resolves the Android Gradle dependencies and submits them to GitHub on pushes to `main` (or manual dispatch on `main`), retaining the graph artifact for seven days. Only that job has `contents: write`; pull-request checks remain read-only. Submission requires the repository dependency graph to be enabled.

[Dependabot](../.github/dependabot.yml) checks pnpm/npm packages, GitHub Actions, the Cargo workspace, Android Gradle dependencies and wrapper, and the pinned Rust toolchain every Monday at 09:00 Asia/Shanghai. Minor and patch version updates are grouped per ecosystem; major updates remain separate. Updates use pull requests and the same CI checks. Rust toolchain updates remain individual pull requests; the workspace `rust-version` remains the independently declared minimum supported compiler. The WASM build resolves its private `wasm-bindgen-cli` version from locked Cargo metadata and replaces an older local CLI when necessary; an explicit `WASM_BINDGEN` override must already match.

## Static deployment

Upload the complete `dist/` directory to a static HTTPS host. The application uses hash routes, so refreshing a game route does not require server-side route rewriting. Preserve the emitted worker asset and its relative location; the host must allow same-origin module workers.

For a deployment under `/sudoku/`:

```sh
pnpm build:subpath
```

Serve the resulting `dist-subpath/` output at the matching path. Changing the host/origin creates a separate browser-local data area. There is no service worker; PWA/offline installation is outside the product scope.

## Change verification

Run checks appropriate to the changed boundary. Vue/TypeScript type checking is separate from Vite build success. Build Rust/WASM before checking its consumers. Preserve independently established fixture expectations and test behavior rather than private helper structure. See [Testing](testing.md) for ownership and the versioned compatibility policy.

Documentation changes require content, formatting and local-link checks; they do not require unrelated application suites. Changes to test output paths additionally require the affected test files to type-check and remain discoverable. Report actual executed coverage in the change summary. Do not add dated task plans, run logs, screenshots or one-off verification reports to the maintained documentation.
