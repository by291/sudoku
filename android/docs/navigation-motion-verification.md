# Navigation motion verification

Date: 2026-10-17.

## Diagnosis and change

The installed Navigation 3 1.2.0 source defaults to 700 ms crossfades for ordinary navigation and a separate predictive return scale of 0.7. The app now supplies one reversible 240 ms scale/fade family, with the exact same return transform for toolbar/system Back and predictive Back. This follows the official [Navigation 3 animation extension points](https://developer.android.com/guide/navigation/navigation-3/animate-destinations).

GameRoute previously intercepted Back with an ordinary BackHandler. It now registers a suspending save-before-leave action with the app navigation owner. The app relays Activity Compose predictive events into a dedicated NavigationEvent input for Navigation 3's seekable scene. The completion event is held until the save guard resolves, preventing cancellation animation followed by a second pop when saving is slow. Cancellation never invokes the save guard; rejection reverses the preview and retains the current screen. Only the scene handler uses this dedicated dispatcher, leaving Material dialogs/sheets on the activity dispatcher with normal dismissal priority. Home has no enabled page-back handler, preserving system back-to-launcher behavior.

NavigationEvent 1.1.1 is now an explicit dependency at the same version already required by Navigation 3. This uses its public dispatcher/input and Compose state APIs rather than duplicating the scene animation engine. References: [NavigationEvent handling](https://developer.android.com/guide/navigation/navigation-event/handle-back) and the installed AndroidX source artifacts.

The game freezes its outgoing presentation during saving and navigation, and blocks touch, keyboard, and accessibility actions on that departing snapshot. A failed/cancelled leave restores live state. Pause, time settlement, writes, editor release, and native resource disposal still run through GameController. Cancelling preparation always invalidates outstanding transition ownership, but only an actual PREPARING state publishes preparation feedback. Normal Back no longer inserts a cancellation caption above the board or swaps in the pause cover before departure.

## Verification

- A controller regression first failed on the unwanted cancellation caption. All 12 GameController tests now pass, including save failure/retry and existing generation/commit cancellation checks.
- The [original game gesture regression](verification/2026-10-17-back-motion/gesture-red.txt) failed because Home was absent during a partially dragged Back gesture.
- The [slow-save animation regression](verification/2026-10-17-back-motion/save-motion-red.txt) failed because the Home preview disappeared after gesture completion while a controlled save remained pending.
- [21 instrumentation checks](verification/2026-10-17-back-motion/player-tests.txt) passed: the complete PlayerWorkflowTest suite plus three NavigationMotionTest cases. These cover both edge origins in the game, preview cancellation without pausing, completion and restored saves, held progress during slow saves, rejected saves and another gesture, modal dismissal, and existing home/lesson/record navigation and input flows.
- After updating the test harness to use Activity Compose's LocalActivity API, all [three motion checks](verification/2026-10-17-back-motion/motion-tests.txt) passed again.
- Formatting, `qualityCheck :app:assembleDebug :app:assembleDebugAndroidTest --offline --no-daemon`, and `git diff --check` passed.

Tests used the disposable `codex-back-check` API 37.2 ARM emulator at 360 × 800 dp. A real system edge swipe was also injected with Android input in gesture navigation mode: [in-progress frame](verification/2026-10-17-back-motion/gesture-in-progress.png) and [settled Home](verification/2026-10-17-back-motion/home-after-return.png). These images supplement deterministic event-driven tests; they are not a frame-by-frame recording or physical-device smoothness measurement. Physical touch, TalkBack, and launcher transition rendering were not newly verified. The personal emulator was untouched; the disposable emulator was stopped and deleted after verification.
