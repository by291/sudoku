import groovy.json.JsonOutput
import groovy.json.JsonSlurper

plugins {
    id("sudoku.android.library")
    id("sudoku.android.hilt")
    alias(libs.plugins.serialization)
}

android {
    namespace = "dev.yigeyinian.sudoku.storage"
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

val generatedLessons = layout.buildDirectory.dir("generated/lessons")
val generateLessonAssets by tasks.registering {
    val source = file("../../../content/lessons/catalogue.json")
    inputs.file(source)
    outputs.dir(generatedLessons)
    doLast {
        val root = generatedLessons.get().asFile
        val assets = root.resolve("assets/lessons").apply { mkdirs() }
        val kotlin = root.resolve("kotlin/dev/yigeyinian/sudoku/storage").apply { mkdirs() }
        val document = JsonSlurper().parse(source) as Map<*, *>
        val lessons = document["lessons"] as List<*>
        fun quoted(value: Any?) = JsonOutput.toJson(value).replace("$", "\\$")
        val rows = lessons.map { raw ->
            val lesson = raw as Map<*, *>
            val id = lesson["id"] as String
            assets.resolve("$id.json").writeText(JsonOutput.toJson(lesson))
            val stages = (lesson["exercises"] as List<*>).sumOf {
                ((it as Map<*, *>)["stages"] as List<*>).size
            }
            "LessonDirectoryEntry(${quoted(id)}, ${quoted(lesson["title"])}, ${quoted(lesson["introduction"])}, " +
                "Variant.${(lesson["practiceVariant"] as String).uppercase()}, " +
                "Difficulty.${(lesson["practiceDifficulty"] as String).uppercase()}, $stages)"
        }
        kotlin.resolve("BundledLessonDirectory.kt").writeText(
            "package dev.yigeyinian.sudoku.storage\n" +
                "import dev.yigeyinian.sudoku.model.learning.LessonDirectoryEntry\n" +
                "import dev.yigeyinian.sudoku.model.Variant\nimport dev.yigeyinian.sudoku.model.Difficulty\n" +
                "internal object BundledLessonDirectory { val entries = listOf(\n${rows.joinToString(",\n")}\n) }\n"
        )
    }
}
androidComponents.onVariants { variant ->
    variant.sources.java?.addStaticSourceDirectory(generatedLessons.get().dir("kotlin").asFile.absolutePath)
    variant.sources.assets?.addStaticSourceDirectory(generatedLessons.get().dir("assets").asFile.absolutePath)
    variant.androidTest?.sources?.assets?.addStaticSourceDirectory(file("schemas").absolutePath)
}
tasks.named("preBuild") { dependsOn(generateLessonAssets) }

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
