plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.compose) apply false
    alias(libs.plugins.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.spotless)
}

// Compose UI tests otherwise resolve Espresso 3.5, whose hidden input API is absent on API 37.
subprojects {
    listOf("com.android.library", "com.android.application").forEach { androidPlugin ->
        pluginManager.withPlugin(androidPlugin) {
            dependencies.add("androidTestImplementation", rootProject.libs.espresso.core)
        }
    }
}

spotless {
    kotlin {
        target("**/src/**/*.kt")
        targetExclude("**/build/**")
        ktlint("1.7.1").setEditorConfigPath(".editorconfig")
    }
    kotlinGradle {
        target("**/*.gradle.kts")
        targetExclude("**/build/**", ".gradle/**")
        ktlint("1.7.1").setEditorConfigPath(".editorconfig")
    }
}

val checkModuleDependencies = tasks.register("checkModuleDependencies") {
    group = "verification"
    description = "Checks Android module ownership against the approved architecture."
}

gradle.projectsEvaluated {
    val presentation = setOf(":core:domain", ":core:design", ":core:ui")
    val features = setOf(":feature:game", ":feature:learning", ":feature:records")
    val allowed = mapOf(
        ":app" to presentation + features + setOf(":core:engine", ":core:data"),
        ":core:domain" to emptySet(),
        ":core:engine" to setOf(":core:domain"),
        ":core:data" to setOf(":core:domain"),
        ":core:design" to emptySet(),
        ":core:ui" to setOf(":core:domain", ":core:design"),
        ":feature:game" to presentation,
        ":feature:learning" to presentation,
        ":feature:records" to presentation
    )
    // Gradle creates container projects for nested paths; every other project needs an owner.
    val containers = allowed.keys.flatMap { path ->
        path.split(":").drop(1).dropLast(1).runningFold("") { parent, name -> "$parent:$name" }.drop(1)
    }.toSet()
    val structuralContainers = containers.filter { path ->
        val container = project(path)
        !container.buildFile.exists() && container.configurations.isEmpty()
    }
    val registeredProjects = allowed.keys + structuralContainers
    val configuredProjects = subprojects.map { it.path }.toSet()
    val edges = allowed.keys.associateWith { owner ->
        project(owner).configurations.flatMap { configuration ->
            configuration.dependencies.withType<org.gradle.api.artifacts.ProjectDependency>().map { it.path }
        }.toSet()
    }
    checkModuleDependencies.configure {
        inputs.property("edges", edges)
        inputs.property("projects", configuredProjects)
        doLast {
            val unregistered = configuredProjects - registeredProjects
            check(unregistered.isEmpty()) { "Unregistered Android modules: ${unregistered.sorted().joinToString()}" }

            val forbidden = edges.flatMap { (owner, dependencies) ->
                (dependencies - owner - allowed.getValue(owner)).map { "$owner -> $it" }
            }
            check(forbidden.isEmpty()) { "Forbidden dependencies: ${forbidden.joinToString()}" }
        }
    }
    tasks.named("qualityCheck") {
        // App lint does not replace each library's own source and manifest checks.
        dependsOn(
            allowed.keys.filter { owner ->
                val plugins = project(owner).plugins
                plugins.hasPlugin("com.android.library") || plugins.hasPlugin("com.android.application")
            }.map { "$it:lintDebug" }
        )
    }
}

tasks.register("qualityCheck") {
    group = "verification"
    dependsOn("spotlessCheck", checkModuleDependencies)
    dependsOn(":core:domain:test", ":core:engine:testDebugUnitTest", ":core:data:testDebugUnitTest")
    dependsOn(":app:testDebugUnitTest")
    dependsOn(
        ":feature:game:testDebugUnitTest",
        ":feature:learning:testDebugUnitTest",
        ":feature:records:testDebugUnitTest"
    )
}
