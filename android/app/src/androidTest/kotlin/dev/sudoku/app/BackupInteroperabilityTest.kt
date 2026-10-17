package dev.sudoku.app

import androidx.test.platform.app.InstrumentationRegistry
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.StorageOutcome
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@HiltAndroidTest
class BackupInteroperabilityTest {
    @get:Rule val hiltRule = HiltAndroidRule(this)

    @Inject lateinit var repository: GameRepository

    @Before fun injectDependencies() {
        hiltRule.inject()
    }

    @Test
    fun actualWebExportPassesAndroidRustValidationAndExportsEquivalentFacts() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val source = instrumentation.context.assets.open("interop/web-backup-v1.json").bufferedReader().use {
            it.readText()
        }
        val preview = repository.previewBackup(source)
        assertTrue(preview is StorageOutcome.Success)
        preview as StorageOutcome.Success
        assertTrue(repository.restoreBackup(preview.value) is StorageOutcome.Success)

        val original = Json.parseToJsonElement(source).jsonObject
        val exportedAt = original.getValue("exportedAt").let { (it as JsonPrimitive).content }
        val exported = repository.exportBackup(exportedAt)
        assertTrue(exported is StorageOutcome.Success)
        exported as StorageOutcome.Success
        val normalized =
            JsonObject(
                original + (
                    "sessions" to JsonArray(
                        original.getValue("sessions").jsonArray.map { record ->
                            JsonObject(record.jsonObject + ("revision" to JsonPrimitive(1)))
                        }
                    )
                    )
            )

        assertEquals(normalized, Json.parseToJsonElement(exported.value.text))
        assertEquals(19, exported.value.backup.sessions.size)
        assertEquals(20, exported.value.backup.results.size)
        // Host verification restores this actual device-written output through the Web decoder.
        File(instrumentation.targetContext.filesDir, "android-roundtrip-v1.json").writeText(exported.value.text)
    }
}
