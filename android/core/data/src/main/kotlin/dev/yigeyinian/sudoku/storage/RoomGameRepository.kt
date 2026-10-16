package dev.yigeyinian.sudoku.storage

import androidx.room.withTransaction
import dev.yigeyinian.sudoku.model.BackupExport
import dev.yigeyinian.sudoku.model.BackupPreview
import dev.yigeyinian.sudoku.model.EditorToken
import dev.yigeyinian.sudoku.model.GameMode
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.GameSession
import dev.yigeyinian.sudoku.model.InvalidPortableData
import dev.yigeyinian.sudoku.model.LessonProgress
import dev.yigeyinian.sudoku.model.LocalBackup
import dev.yigeyinian.sudoku.model.MAX_SAFE_INTEGER
import dev.yigeyinian.sudoku.model.MathematicalValidator
import dev.yigeyinian.sudoku.model.PortableCodec
import dev.yigeyinian.sudoku.model.PreviousSession
import dev.yigeyinian.sudoku.model.ResultRecord
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.SnapshotValidationUnavailable
import dev.yigeyinian.sudoku.model.StorageFailure
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.variant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString

/** One application-scoped writer owns ordering; Room transactions provide cross-instance fencing. */
class RoomGameRepository(private val database: SudokuDatabase, validator: MathematicalValidator) : GameRepository {
    private val codec = PortableCodec(validator)
    private val dao = database.sudokuDao()
    private val writes = Mutex()

    override suspend fun claimEditor(sessionId: String, ownerId: String): StorageOutcome<EditorToken> = write {
        require(sessionId.isNotBlank() && sessionId.length <= 200 && ownerId.isNotBlank())
        database.withTransaction {
            val state = dataset()
            val generation = increment(state.editorGeneration)
            dao.putDataset(state.copy(editorGeneration = generation, editorOwner = ownerId, editorSession = sessionId))
            EditorToken(ownerId, sessionId, state.epoch, generation)
        }
    }

    override suspend fun releaseEditor(token: EditorToken): StorageOutcome<Unit> = write {
        database.withTransaction {
            val state = dataset()
            assertEditor(state, token)
            dao.putDataset(
                state.copy(
                    editorOwner = null,
                    editorSession = null,
                    editorGeneration = increment(state.editorGeneration)
                )
            )
        }
    }

    override suspend fun writeSession(
        session: GameSession,
        expectedRevision: Long,
        token: EditorToken
    ): StorageOutcome<SessionRecord> = write {
        val validated = codec.validateSession(session)
        val record = SessionRecord(revision = increment(expectedRevision), session = validated)
        val entity = sessionEntity(record)
        val result = validated.completion?.let { resultEntity(ResultRecord(session = validated)) }
        database.withTransaction {
            assertEditor(dataset(), token)
            checkConflict(
                token.sessionId == session.id,
                StorageFailureKind.OWNERSHIP_LOST,
                "Editor owns another session"
            )
            val current = dao.session(session.id)
            checkConflict(
                (current?.revision ?: 0) == expectedRevision,
                StorageFailureKind.REVISION_CONFLICT,
                "Saved revision changed"
            )
            dao.putSession(entity)
            if (result != null) {
                // INSERT IGNORE retains the first completion even when an old attempt is replayed.
                dao.putOriginalResult(result)
            }
        }
        record
    }

    override suspend fun replaceActiveSession(
        session: GameSession,
        token: EditorToken,
        previous: PreviousSession?
    ): StorageOutcome<SessionRecord> = write {
        val validated = codec.validateSession(session)
        require(validated.mode != GameMode.DAILY) { "Daily attempts cannot replace an active slot" }
        val record = SessionRecord(revision = 1, session = validated)
        val entity = sessionEntity(record)
        database.withTransaction {
            val state = dataset()
            assertEditor(state, token)
            checkConflict(
                token.sessionId == session.id && dao.session(session.id) == null,
                StorageFailureKind.REVISION_CONFLICT,
                "Replacement identity exists"
            )
            val slots = dao.sessions().filter {
                it.mode == validated.mode.name &&
                    (validated.mode != GameMode.FREE || it.variant == validated.puzzle.rules.variant.wireName)
            }
            checkConflict(slots.size <= 1, StorageFailureKind.REVISION_CONFLICT, "Multiple active slots")
            if (slots.isNotEmpty()) {
                val current = slots.single()
                checkConflict(
                    previous != null && current.id == previous.id && current.revision == previous.revision &&
                        previous.token.epoch == state.epoch &&
                        previous.token.ownerId == token.ownerId,
                    StorageFailureKind.REVISION_CONFLICT,
                    "Previous active session changed"
                )
                dao.deleteSession(current.id, current.revision)
            } else {
                checkConflict(
                    previous == null,
                    StorageFailureKind.REVISION_CONFLICT,
                    "Previous active session disappeared"
                )
            }
            dao.putSession(entity)
            validated.completion?.let { dao.putOriginalResult(resultEntity(ResultRecord(session = validated))) }
        }
        record
    }

    override suspend fun listSessions(): StorageOutcome<List<SessionRecord>> = access {
        val snapshot = database.withTransaction { dataset().epoch to dao.sessions() }
        val records = mutableListOf<SessionRecord>()
        for (entity in snapshot.second) {
            try {
                val record = codec.decodeSessionRecord(entity.payload)
                require(
                    record.formatVersion == 2 && record.revision == entity.revision && record.session.id == entity.id
                )
                records += record
            } catch (error: Exception) {
                preserveUnavailable(error)
                quarantineSession(snapshot.first, entity, error.message ?: "Invalid session")
            }
        }
        records
    }

    override suspend fun listResults(): StorageOutcome<List<ResultRecord>> = access {
        val snapshot = database.withTransaction { dataset().epoch to dao.results() }
        val records = mutableListOf<ResultRecord>()
        for (entity in snapshot.second) {
            try {
                val record = codec.decodeResultRecord(entity.payload)
                require(
                    record.formatVersion == 2 && record.session.id == entity.id && record.session.completion != null
                )
                records += record
            } catch (error: Exception) {
                preserveUnavailable(error)
                database.withTransaction {
                    if (dataset().epoch == snapshot.first && dao.deleteResult(entity.id, entity.payload) == 1) {
                        dao.putQuarantine(
                            QuarantineEntity(
                                "results:${entity.id}",
                                "results",
                                entity.payload,
                                error.message ?: "Invalid result"
                            )
                        )
                    }
                }
            }
        }
        records
    }

    override suspend fun readSettings(): StorageOutcome<Settings> = access {
        val raw = dao.settings() ?: return@access Settings()
        codec.json.decodeFromString<Settings>(raw.payload).also(codec::validateSettings)
    }

    override suspend fun writeSettings(settings: Settings, expectedEpoch: Long): StorageOutcome<Unit> = write {
        codec.validateSettings(settings)
        val entity = SettingsEntity(payload = encode(settings))
        database.withTransaction {
            assertEpoch(dataset(), expectedEpoch)
            dao.putSettings(entity)
        }
    }

    override suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>> = access {
        dao.lessons().map { codec.json.decodeFromString<LessonProgress>(it.payload).also(codec::validateLesson) }
    }

    override suspend fun writeLessonProgress(progress: LessonProgress, expectedEpoch: Long): StorageOutcome<Unit> =
        write {
            codec.validateLesson(progress)
            val entity = LessonEntity(progress.lessonId, encode(progress))
            database.withTransaction {
                assertEpoch(dataset(), expectedEpoch)
                dao.putLesson(entity)
            }
        }

    override suspend fun readDatasetEpoch(): StorageOutcome<Long> = access {
        database.withTransaction { dataset().epoch }
    }

    override suspend fun previewBackup(text: String): StorageOutcome<BackupPreview> = access {
        val epoch = database.withTransaction { dataset().epoch }
        BackupPreview(codec.decodeBackup(text), epoch)
    }

    override suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit> = write {
        // Revalidate immutable copies outside the transaction, then fence the preview at commit.
        val backup = codec.decodeBackup(codec.encodeBackup(preview.backup))
        val sessions = backup.sessions.map { sessionEntity(it.copy(revision = 1)) }
        val results = backup.results.map(::resultEntity)
        val lessons = backup.lessons.map { LessonEntity(it.lessonId, encode(it)) }
        val settings = SettingsEntity(payload = encode(backup.settings))
        database.withTransaction {
            val state = dataset()
            assertEpoch(state, preview.expectedEpoch)
            clearCollections()
            sessions.forEach { dao.putSession(it) }
            results.forEach { dao.putOriginalResult(it) }
            lessons.forEach { dao.putLesson(it) }
            dao.putSettings(settings)
            dao.putDataset(
                DatasetEntity(epoch = increment(state.epoch), editorGeneration = increment(state.editorGeneration))
            )
        }
    }

    override suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport> = write {
        val snapshot = database.withTransaction {
            ExportRows(
                dataset().epoch,
                dao.sessions(),
                dao.results(),
                dao.lessons(),
                dao.settings(),
                dao.quarantineCount()
            )
        }
        var excluded = 0
        val sessions = snapshot.sessions.mapNotNull { entity ->
            try {
                val record = codec.decodeSessionRecord(entity.payload)
                record
            } catch (error: Exception) {
                preserveUnavailable(error)
                excluded++
                null
            }
        }
        val results = snapshot.results.mapNotNull { entity ->
            try {
                val record = codec.decodeResultRecord(entity.payload)
                require(record.session.completion != null)
                record
            } catch (error: Exception) {
                preserveUnavailable(error)
                excluded++
                null
            }
        }
        val lessons = snapshot.lessons.mapNotNull { entity ->
            try {
                codec.json.decodeFromString<LessonProgress>(entity.payload).also(codec::validateLesson)
            } catch (error: IllegalArgumentException) {
                excluded++
                null
            }
        }
        val settings = try {
            snapshot.settings?.let { codec.json.decodeFromString<Settings>(it.payload).also(codec::validateSettings) }
                ?: Settings()
        } catch (error: IllegalArgumentException) {
            excluded++
            Settings()
        }
        val backup =
            LocalBackup(
                exportedAt = exportedAt,
                sessions = sessions,
                results = results,
                lessons = lessons,
                settings = settings
            )
        val text = codec.encodeBackup(backup)
        val validated = codec.decodeBackup(text)
        BackupExport(validated, text, excluded, snapshot.quarantined)
    }

    override suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit> = write {
        database.withTransaction {
            val state = dataset()
            assertEpoch(state, expectedEpoch)
            clearCollections()
            dao.putDataset(
                DatasetEntity(epoch = increment(state.epoch), editorGeneration = increment(state.editorGeneration))
            )
        }
    }

    override suspend fun countQuarantined(): StorageOutcome<Int> = access { dao.quarantineCount() }
    override suspend fun removeQuarantined(): StorageOutcome<Unit> = write { dao.clearQuarantine() }

    private suspend fun quarantineSession(epoch: Long, entity: SessionEntity, reason: String) {
        database.withTransaction {
            if (dataset().epoch == epoch && dao.deleteSession(entity.id, entity.revision) == 1) {
                dao.putQuarantine(QuarantineEntity("sessions:${entity.id}", "sessions", entity.payload, reason))
            }
        }
    }

    private suspend fun dataset(): DatasetEntity {
        val current = dao.dataset()
        if (current != null) {
            return current
        }
        return DatasetEntity().also { dao.putDataset(it) }
    }

    private suspend fun clearCollections() {
        dao.clearSessions()
        dao.clearResults()
        dao.clearLessons()
        dao.clearSettings()
        dao.clearQuarantine()
    }

    private fun assertEpoch(state: DatasetEntity, epoch: Long) = checkConflict(
        epoch in 0..MAX_SAFE_INTEGER && state.epoch == epoch,
        StorageFailureKind.REVISION_CONFLICT,
        "Dataset changed after operation started"
    )
    private fun assertEditor(state: DatasetEntity, token: EditorToken) {
        assertEpoch(state, token.epoch)
        checkConflict(
            state.editorOwner == token.ownerId && state.editorSession == token.sessionId &&
                state.editorGeneration == token.generation,
            StorageFailureKind.OWNERSHIP_LOST,
            "Editor ownership changed"
        )
    }

    private fun sessionEntity(record: SessionRecord): SessionEntity {
        val session = record.session
        return SessionEntity(
            session.id,
            record.revision,
            session.mode.name,
            session.puzzle.rules.variant.wireName,
            (session.metadata as? SessionMetadata.Daily)?.challengeDate,
            encode(record)
        )
    }
    private fun resultEntity(record: ResultRecord): ResultEntity {
        val session = record.session
        return ResultEntity(
            session.id,
            session.mode.name,
            session.puzzle.rules.variant.wireName,
            (session.metadata as? SessionMetadata.Daily)?.challengeDate,
            encode(record)
        )
    }
    private inline fun <reified T> encode(value: T): String = escapeSurrogates(codec.json.encodeToString(value))
    private fun escapeSurrogates(text: String): String = buildString {
        text.forEach { if (it.isSurrogate()) append("\\u${it.code.toString(16).padStart(4, '0')}") else append(it) }
    }
    private fun increment(value: Long): Long {
        require(value in 0 until MAX_SAFE_INTEGER) { "Counter exceeds portable integer range" }
        return value + 1
    }
    private fun preserveUnavailable(error: Exception) {
        if (error is CancellationException || error is SnapshotValidationUnavailable) {
            throw error
        }
    }
    private suspend fun <T> write(operation: suspend () -> T): StorageOutcome<T> = writes.withLock { access(operation) }
    private suspend fun <T> access(operation: suspend () -> T): StorageOutcome<T> = withContext(Dispatchers.IO) {
        try {
            StorageOutcome.Success(operation())
        } catch (error: CancellationException) {
            throw error
        } catch (error: RepositoryConflict) {
            StorageOutcome.Failure(StorageFailure(error.kind, error.message ?: "Storage conflict"))
        } catch (error: SnapshotValidationUnavailable) {
            StorageOutcome.Failure(
                StorageFailure(
                    StorageFailureKind.UNAVAILABLE,
                    error.message ?: "Validation unavailable"
                )
            )
        } catch (error: IllegalArgumentException) {
            StorageOutcome.Failure(StorageFailure(StorageFailureKind.INVALID_DATA, error.message ?: "Invalid data"))
        } catch (error: Exception) {
            StorageOutcome.Failure(
                StorageFailure(
                    StorageFailureKind.WRITE_FAILED,
                    error.message ?: "Database operation failed"
                )
            )
        }
    }
}

private class RepositoryConflict(val kind: StorageFailureKind, message: String) : IllegalStateException(message)
private fun checkConflict(condition: Boolean, kind: StorageFailureKind, message: String) {
    if (!condition) {
        throw RepositoryConflict(kind, message)
    }
}
private data class ExportRows(
    val epoch: Long,
    val sessions: List<SessionEntity>,
    val results: List<ResultEntity>,
    val lessons: List<LessonEntity>,
    val settings: SettingsEntity?,
    val quarantined: Int
)
