import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.getByType

/** Features depend on contracts and controlled presentation, never sibling features or implementations. */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("sudoku.android.compose")
            pluginManager.apply("sudoku.android.hilt")

            listOf(":core:domain", ":core:design", ":core:ui").forEach { path ->
                dependencies.add("implementation", dependencies.project(mapOf("path" to path)))
            }
            val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
            listOf(
                "activity-compose",
                "lifecycle-compose",
                "lifecycle-viewmodel",
                "hilt-compose",
                "coroutines-android"
            ).forEach { alias ->
                dependencies.add("implementation", libs.findLibrary(alias).get())
            }
            dependencies.add("testImplementation", libs.findLibrary("kotlin-test").get())
            dependencies.add("testImplementation", libs.findLibrary("coroutines-test").get())
            dependencies.add("androidTestImplementation", dependencies.platform(libs.findLibrary("compose-bom").get()))
            listOf("compose-test", "android-test-junit", "android-test-runner", "android-test-core").forEach { alias ->
                dependencies.add("androidTestImplementation", libs.findLibrary(alias).get())
            }
            dependencies.add("debugImplementation", libs.findLibrary("compose-test-manifest").get())
        }
    }
}
