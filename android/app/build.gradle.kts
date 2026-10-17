plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose)
    alias(libs.plugins.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// AGP resource shrinking requires ABI APK splits to be disabled for app bundles.
val splitApksByAbi = providers.gradleProperty("splitApksByAbi").map(String::toBooleanStrict).orElse(true).get()

android {
    namespace = "dev.yigeyinian.sudoku"
    compileSdk = 37
    defaultConfig {
        applicationId = "dev.yigeyinian.sudoku"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "dev.yigeyinian.sudoku.SudokuTestRunner"
        if (!splitApksByAbi) {
            ndk { abiFilters.addAll(listOf("arm64-v8a", "x86_64")) }
        }
    }
    splits {
        abi {
            isEnable = splitApksByAbi
            reset()
            include("arm64-v8a", "x86_64")
            isUniversalApk = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    buildFeatures { compose = true }
    sourceSets.named("androidTest") {
        assets.directories.add(file("../core/domain/src/test/resources").absolutePath)
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    lint { abortOnError = true }
}

dependencies {
    implementation(project(":core:domain"))
    implementation(project(":core:engine"))
    implementation(project(":core:data"))
    implementation(project(":core:ui"))
    implementation(project(":core:design"))
    implementation(project(":feature:game"))
    implementation(project(":feature:learning"))
    implementation(project(":feature:records"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.icons)
    implementation(libs.activity.compose)
    implementation(libs.android.core)
    implementation(libs.lifecycle.compose)
    implementation(libs.lifecycle.process)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.lifecycle.navigation)
    implementation(libs.hilt.compose)
    implementation(libs.navigation.ui)
    implementation(libs.navigation.event.compose)
    implementation(libs.navigation.runtime)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.serialization)
    implementation(libs.coroutines.android)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.coroutines.test)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.test)
    androidTestImplementation(libs.android.test.junit)
    androidTestImplementation(libs.android.test.runner)
    androidTestImplementation(libs.android.test.core)
    androidTestImplementation(libs.hilt.testing)
    kspAndroidTest(libs.hilt.compiler)
    debugImplementation(libs.compose.test.manifest)
    debugImplementation(libs.compose.tooling)
}
