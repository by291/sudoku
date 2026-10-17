package dev.yigeyinian.sudoku.navigation

import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith

private const val NAVIGATION_DURATION_MS = 240
private const val FOREGROUND_SCALE = 0.96f
private const val BACKGROUND_SCALE = 1.04f

internal fun forwardTransition(): ContentTransform =
    (fadeIn(navigationAnimation()) + scaleIn(navigationAnimation(), initialScale = FOREGROUND_SCALE)) togetherWith
        (fadeOut(navigationAnimation()) + scaleOut(navigationAnimation(), targetScale = BACKGROUND_SCALE))

// A completed gesture continues the same transform instead of switching from shrink to crossfade.
internal fun backTransition(): ContentTransform =
    (fadeIn(navigationAnimation()) + scaleIn(navigationAnimation(), initialScale = BACKGROUND_SCALE)) togetherWith
        (fadeOut(navigationAnimation()) + scaleOut(navigationAnimation(), targetScale = FOREGROUND_SCALE))

private fun navigationAnimation() = tween<Float>(NAVIGATION_DURATION_MS, easing = FastOutSlowInEasing)
