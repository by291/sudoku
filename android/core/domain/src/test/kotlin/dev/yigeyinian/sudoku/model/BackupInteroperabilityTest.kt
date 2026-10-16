package dev.yigeyinian.sudoku.model

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class BackupInteroperabilityTest {
    @Test fun `actual Web export round trips all portable facts through Android codec`() = runTest {
        // This validates portable facts; actual native mathematical validation is a separate gate.
        val validator = object : MathematicalValidator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
                EngineOutcome.Completed(Validation.Valid)
            override suspend fun validateAssessment(
                value: PuzzleAssessment?,
                variant: Variant,
                difficulty: Difficulty
            ): EngineOutcome<PuzzleAssessment?> = EngineOutcome.Completed(value)
        }
        val source = checkNotNull(javaClass.getResource("/interop/web-backup-v1.json")).readText()
        val codec = PortableCodec(validator)

        val decoded = codec.decodeBackup(source)
        val exported = codec.encodeBackup(decoded.copy(sessions = decoded.sessions.map { it.copy(revision = 1) }))
        val roundTrip = codec.decodeBackup(exported)

        assertEquals(19, decoded.sessions.size)
        assertEquals(20, decoded.results.size)
        assertEquals(
            19,
            decoded.sessions.map {
                it.session.puzzle.rules.variant to it.session.puzzle.difficulty
            }.distinct().size
        )
        assertEquals(
            setOf(GameMode.FREE, GameMode.LEARNING, GameMode.DAILY),
            decoded.sessions.map {
                it.session.mode
            }.toSet()
        )
        assertTrue(
            decoded.sessions.all {
                it.session.undoStack.isNotEmpty() && it.session.redoStack.isNotEmpty() &&
                    it.session.notes.any { mask -> mask != 0 }
            }
        )
        assertEquals(
            "old\uD800seed",
            decoded.results.single {
                it.session.id == "legacy-surrogate-result"
            }.session.puzzle.seed
        )
        assertEquals("2026-10-16T01:02:03.004Z", decoded.lessons.single().completedAt)
        assertEquals(5, decoded.settings.lessonStages?.get("killer-combined"))
        assertEquals(decoded.copy(sessions = decoded.sessions.map { it.copy(revision = 1) }), roundTrip)
        File("build/interop").mkdirs()
        File("build/interop/android-backup-v1.json").writeText(exported)
    }
}
