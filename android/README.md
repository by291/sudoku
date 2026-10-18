# Android client

Native Kotlin/Compose Sudoku using the shared Rust engine. The application is offline and supports the same variants, courses, daily challenges and portable backups as Web.

From this directory, with JDK 21 and the configured Android SDK/NDK:

```sh
./gradlew qualityCheck :app:assembleDebug
```

- [Build, installation and packaging](../docs/android/build.md)
- [Architecture and ownership](../docs/android/architecture.md)
- [Data loading and Room migrations](../docs/android/data-loading.md)
- [Interface and navigation](../docs/android/interface.md)
- [Local development guidelines](AGENTS.md)

The complete [project documentation](../docs/README.md) lives under the root `docs/` directory.
