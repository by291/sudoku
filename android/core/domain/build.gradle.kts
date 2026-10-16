plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.serialization)
}

kotlin { jvmToolchain(21) }

sourceSets.test { resources.srcDir("../../../content") }

dependencies {
    api(libs.serialization)
    api(libs.coroutines)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.coroutines.test)
}
