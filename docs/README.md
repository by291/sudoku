# Documentation

These documents describe maintained behavior, architecture and development workflows. Read the relevant topic before changing code. Task plans, execution journals, screenshots, benchmark dumps and one-off verification reports are not maintained documentation; Git history retains previously committed material.

## Shared product and engine

| Topic                                    | Contents                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| [Product behavior](product.md)           | Modes, variants, controls, assistance, timing and local-data policy               |
| [Engine](engine.md)                      | Rust responsibilities, generation/rating, deterministic seeds and compatibility   |
| [Algorithms](algorithms/README.md)       | Constraint search, logical techniques, rating, generation and research references |
| [Learning content](learning.md)          | Shared catalogue schema, authored evidence and durable advancement                |
| [Local backup](local-backup.md)          | Portable format, limits, validation, export and replacement                       |
| [Adding a variant](variant-extension.md) | Registration points and required mathematical/presentation support                |

## Testing

[Testing and independent fixtures](testing.md) explains Rust-native coverage, WASM/browser contracts, fixture provenance and versioned regression policy.

## Web

| Topic                                        | Contents                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| [Architecture](architecture.md)              | Vue feature ownership, lazy WASM, workers, IndexedDB and resource lifetime |
| [Development and deployment](development.md) | Setup, commands, CI, browser tooling and static hosting                    |

## Android

| Topic                                   | Contents                                                    |
| --------------------------------------- | ----------------------------------------------------------- |
| [Architecture](android/architecture.md) | Modules, state owners, native execution and disposal        |
| [Data loading](android/data-loading.md) | Bootstrap, compact reads, Room migrations and consistency   |
| [Interface](android/interface.md)       | Navigation, game/lesson layouts, loading and accessibility  |
| [Build and packaging](android/build.md) | Toolchains, APKs, generation, alignment and device commands |

## Source-level references

[Repository guidelines](../AGENTS.md) and [Android guidelines](../android/AGENTS.md) define coding conventions. [Rust core](../sudoku/core/README.md), [WASM adapter](../sudoku/wasm/README.md) and [test ownership and fixtures](testing.md) retain instructions next to their source owners. Executable tests and independent oracle fixtures remain under their normal test directories.
