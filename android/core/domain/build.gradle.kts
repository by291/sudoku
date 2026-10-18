plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.serialization)
}

kotlin { jvmToolchain(21) }

sourceSets.test { resources.srcDir("../../../resources") }

// The Web interop step consumes this test output, including after Gradle restores cached results.
tasks.test {
    outputs.file(layout.buildDirectory.file("interop/android-backup-v1.json"))
}

dependencies {
    api(libs.serialization)
    api(libs.coroutines)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.coroutines.test)
}
