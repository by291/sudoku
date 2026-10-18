plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "dev.sudoku.app.engine"
    compileSdk = 37
    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    testOptions.unitTests.all {
        val catalogue = file("../../../resources/lessons/catalogue.json")
        it.inputs.file(catalogue)
        it.systemProperty("sudoku.learningCatalogue", catalogue.absolutePath)
        it.systemProperty("jna.library.path", file("../../../target/debug").absolutePath)
    }
}

val buildNative = tasks.register<Exec>("buildNative") {
    group = "build"
    workingDir(rootProject.projectDir)
    commandLine("bash", "scripts/build-native.sh", layout.buildDirectory.get().asFile.absolutePath)
    inputs.files(fileTree("../../../sudoku/core/src"), fileTree("../../ffi/src"))
    inputs.files("../../../Cargo.toml", "../../../Cargo.lock", "../../ffi/Cargo.toml", "../../ffi/uniffi.toml")
    inputs.file("../../scripts/build-native.sh")
    inputs.file("../../../rust-toolchain.toml")
    outputs.dir(layout.buildDirectory.dir("generated/uniffi"))
    outputs.dir(layout.buildDirectory.dir("generated/jniLibs"))
}

androidComponents.onVariants { variant ->
    variant.sources.kotlin?.addStaticSourceDirectory(
        layout.buildDirectory.dir("generated/uniffi").get().asFile.absolutePath
    )
    variant.sources.jniLibs?.addStaticSourceDirectory(
        layout.buildDirectory.dir("generated/jniLibs").get().asFile.absolutePath
    )
}

tasks.named("preBuild") { dependsOn(buildNative) }

dependencies {
    implementation(project(":core:domain"))
    implementation(libs.coroutines.android)
    implementation(libs.androidx.annotation)
    implementation(libs.jna) {
        artifact { type = "aar" }
    }
    testImplementation(libs.kotlin.test)
    testImplementation(libs.coroutines.test)
    testRuntimeOnly("net.java.dev.jna:jna:${libs.versions.jna.get()}")
    androidTestImplementation(libs.android.test.junit)
    androidTestImplementation(libs.android.test.runner)
    androidTestImplementation(libs.coroutines.test)
}

// Packaging is gated by host tests, including all authored stages through the native adapter.
tasks.register("validateLearningContent") {
    group = "verification"
    description = "Validates bundled teaching content before Android asset packaging."
    dependsOn("testDebugUnitTest")
}
