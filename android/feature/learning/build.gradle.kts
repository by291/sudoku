plugins { id("sudoku.android.feature") }

android { namespace = "dev.sudoku.app.feature.learning" }

androidComponents.onVariants { variant ->
    variant.hostTests.values.forEach { hostTest ->
        hostTest.sources.resources?.addStaticSourceDirectory("../../../content")
    }
    variant.deviceTests.values.forEach { deviceTest ->
        deviceTest.sources.assets?.addStaticSourceDirectory("../../../content")
    }
}
