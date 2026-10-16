import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.getByType

/** Adds Compose to an Android library without coupling generic presentation to player models. */
class AndroidComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("sudoku.android.library")
            pluginManager.apply("org.jetbrains.kotlin.plugin.compose")
            extensions.configure<LibraryExtension> { buildFeatures.compose = true }

            val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
            dependencies.add("implementation", dependencies.platform(libs.findLibrary("compose-bom").get()))
            listOf("compose-ui", "compose-foundation", "compose-material3", "compose-icons").forEach { alias ->
                dependencies.add("implementation", libs.findLibrary(alias).get())
            }
            dependencies.add("debugImplementation", libs.findLibrary("compose-tooling").get())
        }
    }
}
