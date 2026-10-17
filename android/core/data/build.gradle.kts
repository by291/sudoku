plugins {
    id("sudoku.android.library")
    id("sudoku.android.hilt")
    alias(libs.plugins.serialization)
}

android {
    namespace = "dev.yigeyinian.sudoku.storage"
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

androidComponents.onVariants { variant ->
    variant.androidTest?.sources?.assets?.addStaticSourceDirectory(file("schemas").absolutePath)
    variant.sources.assets?.addStaticSourceDirectory(file("../../../content").absolutePath)
}

dependencies {
    implementation(project(":core:domain"))
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.serialization)
    implementation(libs.coroutines.android)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.coroutines.test)
    androidTestImplementation(libs.room.testing)
    androidTestImplementation(libs.android.test.junit)
    androidTestImplementation(libs.android.test.runner)
    androidTestImplementation(libs.android.test.core)
    androidTestImplementation(libs.coroutines.test)
}

// The immutable bundled asset is proved during the build, never on the player's navigation path.
tasks.named("preBuild") { dependsOn(":core:engine:validateLearningContent") }
