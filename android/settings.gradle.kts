pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "sudoku-android"
include(":app", ":core:domain", ":core:engine", ":core:data", ":core:design", ":core:ui")
include(":feature:game", ":feature:learning", ":feature:records")
