# Learning directory verification

Date: 2026-10-17.

## Approved presentation

The Android directory follows the approved mobile preview while retaining the application palette. A compact heading shows total progress, all six variants appear in two rows at normal phone text sizes, and one mint card offers Start, Continue, Next Lesson, or Review. Course-local numbered rows replace the repeated large cards and per-row buttons. Completed rows have a check mark and a text label; in-progress rows are also labeled. Every row remains independently accessible.

A pure feature presentation model derives recommendations from the authored catalogue and persisted progress. An unfinished current lesson in the selected variant takes priority, followed by the first unfinished lesson. A completed course offers its first lesson for review. Unknown historical completion IDs do not inflate the count. Stage labels use the same restored catalogue cursor as the lesson workflow. No recommendation writes progress or changes the exercise, persistence, or native computation contracts.

The directory uses a keyed `LazyColumn` with a 640 dp content limit, 48 dp minimum variant/action targets, and fewer variant columns at enlarged font scales. Course descriptions are abbreviated in the directory; full authored explanations remain available inside each lesson. Implementation follows the official [Compose lazy-list guidance](https://developer.android.com/develop/ui/compose/lists) and [accessible component defaults](https://developer.android.com/develop/ui/compose/accessibility/api-defaults), using the repository's Compose BOM 2026.09.00.

## Verification

`spotlessApply`, `qualityCheck`, app assembly, app test assembly, and learning feature test assembly passed. Five focused JVM regressions cover initial recommendations, unfinished current lessons and saved stages, advancing past completed lessons, variant isolation, and completed-course review.

Fourteen instrumentation checks passed on a disposable API 37.2 ARM emulator:

- [360 × 800 dp: four feature checks](verification/2026-10-17-learning-directory/phone-tests.txt), covering all six variant choices, recommendation callbacks, continuation, direct access to the last course row, review, loading-state action removal, and the existing guided-exercise/next-stage contract.
- [Home navigation: one check](verification/2026-10-17-learning-directory/navigation-test.txt), using the real application, native engine, and storage.
- [320 × 640 dp: three directory checks](verification/2026-10-17-learning-directory/small-tests.txt).
- [800 × 360 dp: three directory checks](verification/2026-10-17-learning-directory/landscape-tests.txt).
- [Dark 360 × 800 dp, 1.5 font scale: three directory checks](verification/2026-10-17-learning-directory/large-text-tests.txt).

The interaction regressions scroll through the lazy list to verify offscreen lessons remain reachable. Visual review used the actual application: [light phone](verification/2026-10-17-learning-directory/learning-phone.png) and [dark enlarged text](verification/2026-10-17-learning-directory/learning-large-text.png). The personal emulator was not used. TalkBack and physical-device testing were not newly performed.
