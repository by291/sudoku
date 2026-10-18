package dev.sudoku.app.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class PortableCodecTest {
    private val validator = object : MathematicalValidator {
        override suspend fun validatePuzzle(content: PuzzleContent) =
            EngineOutcome.Completed<Validation>(Validation.Valid)

        override suspend fun validateAssessment(value: PuzzleAssessment?, variant: Variant, difficulty: Difficulty) =
            EngineOutcome.Completed(value)
    }

    @Test fun `portable and local records preserve legacy surrogate code units and millisecond instants`() = runTest {
        val codec = PortableCodec(validator)
        val puzzle = puzzleFixture().copy(seed = "legacy\uD800text", puzzleVersion = "old\uDC00")
        val session = createSession(puzzle, SessionMetadata.Free, "legacy", "2026-10-16T01:02:03.004Z")
        val backup = LocalBackup(
            exportedAt = "2026-10-16T01:02:03.000Z",
            sessions = listOf(
                SessionRecord(
                    revision = 3,
                    session = session
                )
            ),
            results = emptyList(),
            lessons = listOf(
                LessonProgress(
                    "retired-course",
                    "2026-10-16T01:02:03.004Z"
                )
            ),
            settings = Settings()
        )

        val backupText = codec.encodeBackup(backup)
        val decoded = codec.decodeBackup(backupText)
        val record = backup.sessions.single()
        val recordText = codec.encodeRecord(SessionRecord.serializer(), record)
        val decodedRecord = codec.decodeSessionRecord(recordText)

        assertEquals(backup, decoded)
        assertTrue(backupText.contains("\\ud800", ignoreCase = true))
        assertTrue(backupText.contains("\\udc00", ignoreCase = true))
        assertEquals(record, decodedRecord)
        assertTrue(recordText.contains("\\ud800", ignoreCase = true))
        assertTrue(recordText.contains("\\udc00", ignoreCase = true))
        assertTrue(recordText.contains("\"assessment\":null"))
    }

    @Test fun `local records preserve histories above portable transfer limits`() = runTest {
        val codec = PortableCodec(validator)
        val initial = createSession(puzzleFixture(), SessionMetadata.Free, "long-game", "2026-10-16T01:02:03.004Z")
        val empty = BoardLayers(initial.entries, initial.notes)
        val noted = empty.copy(notes = empty.notes.toMutableList().also { it[0] = 1 })
        val history = List(BackupLimits.HISTORY_PER_SESSION + 1) { index ->
            if (index % 2 == 0) HistoryMove(empty, noted) else HistoryMove(noted, empty)
        }
        val session = initial.copy(notes = noted.notes, undoStack = history)
        val record = SessionRecord(revision = 2001, session = session)
        val text = codec.encodeRecord(SessionRecord.serializer(), record)

        assertEquals(record, codec.decodeSessionRecord(text))

        val backup = LocalBackup(
            exportedAt = "2026-10-16T01:02:03.000Z",
            sessions = listOf(record),
            results = emptyList(),
            lessons = emptyList(),
            settings = Settings()
        )
        assertFailsWith<InvalidPortableData> { codec.decodeBackup(codec.encodeBackup(backup)) }
    }

    @Test fun `history chains must connect to the current board`() = runTest {
        val codec = PortableCodec(validator)
        val session = createSession(puzzleFixture(), SessionMetadata.Free, "bad", "2026-10-16T01:02:03.004Z")
        val empty = BoardLayers(session.entries, session.notes)
        val entered = empty.copy(entries = empty.entries.toMutableList().also { it[0] = 1 })
        val disconnected = session.copy(undoStack = listOf(HistoryMove(empty, entered)))

        assertFailsWith<InvalidPortableData> { codec.validateSession(disconnected) }
    }

    @Test fun `typed invalid input is conclusive corruption at the portable boundary`() = runTest {
        val invalid = object : MathematicalValidator by validator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
                EngineOutcome.InvalidInput("Invalid region cell")
        }
        val session = createSession(puzzleFixture(), SessionMetadata.Free, "invalid", "2026-10-16T01:02:03.004Z")

        assertFailsWith<InvalidPortableData> { PortableCodec(invalid).validateSession(session) }
    }

    @Test fun `exhausted validator preserves data as unavailable`() = runTest {
        val exhausted = object : MathematicalValidator by validator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
                EngineOutcome.BudgetExhausted()
        }
        val codec = PortableCodec(exhausted)
        val session = createSession(puzzleFixture(), SessionMetadata.Free, "retry", "2026-10-16T01:02:03.004Z")

        assertFailsWith<SnapshotValidationUnavailable> { codec.validateSession(session) }
    }

    @Test fun `optional malformed assessment does not reject a valid game`() = runTest {
        val codec = PortableCodec(validator)
        val session = createSession(
            puzzleFixture(),
            SessionMetadata.Free,
            "assessment",
            "2026-10-16T01:02:03.004Z"
        )
        val backup = LocalBackup(
            exportedAt = "2026-10-16T01:02:03.000Z",
            sessions = listOf(
                SessionRecord(
                    revision = 1,
                    session = session
                )
            ),
            results = emptyList(),
            lessons = emptyList(),
            settings = Settings()
        )
        val text = codec.encodeBackup(backup).replace(
            "\"mode\":\"free\"",
            "\"assessment\":{\"status\":\"rated\",\"summary\":false},\"mode\":\"free\""
        )

        val decoded = codec.decodeBackup(text)

        assertTrue(decoded.sessions.single().session.assessment is PuzzleAssessment.Unavailable)
    }

    @Test fun `missing portable settings flags are rejected instead of defaulting`() = runTest {
        val codec = PortableCodec(validator)
        val text = """
            {
                "backupVersion":1,
                "exportedAt":"2026-10-16T01:02:03.000Z",
                "sessions":[],
                "results":[],
                "lessons":[],
                "settings":{}
            }
        """.trimIndent()

        assertFailsWith<InvalidPortableData> { codec.decodeBackup(text) }
    }

    @Test fun `throwing validator is unavailable rather than corrupt data`() = runTest {
        val throwing = object : MathematicalValidator by validator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
                throw IllegalStateException("native unavailable")
        }
        val session = createSession(puzzleFixture(), SessionMetadata.Free, "retry", "2026-10-16T01:02:03.004Z")

        assertFailsWith<SnapshotValidationUnavailable> { PortableCodec(throwing).validateSession(session) }
    }

    @Test fun `codec preserves all nineteen supported rule and difficulty identities`() = runTest {
        val codec = PortableCodec(validator)
        val rules = listOf(
            PuzzleRules.Classic,
            PuzzleRules.Diagonal,
            PuzzleRules.Jigsaw(List(9) { region -> List(9) { region * 9 + it } }),
            PuzzleRules.Killer(
                listOf(
                    Cage(
                        listOf(
                            0,
                            1
                        ),
                        3
                    )
                )
            ),
            PuzzleRules.Thermo(
                listOf(
                    listOf(
                        0,
                        1
                    )
                )
            ),
            PuzzleRules.Arrow(
                listOf(
                    ArrowClue(
                        0,
                        listOf(
                            1,
                            2
                        )
                    )
                )
            )
        )
        for (rule in rules) {
            for (difficulty in rule.variant.difficulties) {
                val puzzle = puzzleFixture().copy(
                    rules = rule,
                    difficulty = difficulty,
                    puzzleVersion = if (rule == PuzzleRules.Classic) "sudoku-v11" else "sudoku-variants-v11"
                )
                val session = createSession(puzzle, SessionMetadata.Free, "matrix", "2026-10-16T01:02:03.004Z")
                val backup = LocalBackup(
                    exportedAt = "2026-10-16T01:02:03.000Z",
                    sessions = listOf(
                        SessionRecord(
                            revision = 1,
                            session = session
                        )
                    ),
                    results = emptyList(),
                    lessons = emptyList(),
                    settings = Settings()
                )

                val decoded = codec.decodeBackup(codec.encodeBackup(backup))

                assertEquals(rule, decoded.sessions.single().session.puzzle.rules)
                assertEquals(difficulty, decoded.sessions.single().session.puzzle.difficulty)
            }
        }
    }

    @Test fun `legacy classic records normalize without changing historical identity`() = runTest {
        val codec = PortableCodec(validator)
        val session = createSession(
            puzzleFixture().copy(
                seed = "old-seed",
                puzzleVersion = "sudoku-v1"
            ),
            SessionMetadata.Free,
            "legacy",
            "2026-10-16T01:02:03.004Z"
        )
        val backup = LocalBackup(
            exportedAt = "2026-10-16T01:02:03.000Z",
            sessions = listOf(
                SessionRecord(
                    revision = 42,
                    session = session
                )
            ),
            results = emptyList(),
            lessons = emptyList(),
            settings = Settings()
        )
        val legacy = codec.encodeBackup(backup).replace(
            "\"formatVersion\":2",
            "\"formatVersion\":1"
        ).replace(
            "\"rules\":{\"kind\":\"classic\"},",
            ""
        )

        val decoded = codec.decodeBackup(legacy).sessions.single()

        assertEquals(2, decoded.formatVersion)
        assertEquals(42, decoded.revision)
        assertEquals("old-seed", decoded.session.puzzle.seed)
    }

    @Test fun `validation owns snapshots before suspending native computation`() = runTest {
        val mutableEntries = MutableList(81) { 0 }
        val mutating = object : MathematicalValidator by validator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> {
                mutableEntries[0] = 9
                return EngineOutcome.Completed(Validation.Valid)
            }
        }
        val session = createSession(
            puzzleFixture(),
            SessionMetadata.Free,
            "snapshot",
            "2026-10-16T01:02:03.004Z"
        ).copy(entries = mutableEntries)

        val validated = PortableCodec(mutating).validateSession(session)

        assertEquals(0, validated.entries[0])
    }
}
