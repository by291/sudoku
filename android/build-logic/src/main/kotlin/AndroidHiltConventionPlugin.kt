import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.getByType

/** Keeps dependency injection and its KSP generator aligned with the version catalogue. */
class AndroidHiltConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            fun configureInjection() {
                pluginManager.apply("com.google.devtools.ksp")
                pluginManager.apply("com.google.dagger.hilt.android")

                val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
                dependencies.add("implementation", libs.findLibrary("hilt-android").get())
                dependencies.add("ksp", libs.findLibrary("hilt-compiler").get())
            }

            // Consumers may list Hilt before Android; its configurations must exist before registration.
            pluginManager.withPlugin("com.android.application") { configureInjection() }
            pluginManager.withPlugin("com.android.library") { configureInjection() }
        }
    }
}
