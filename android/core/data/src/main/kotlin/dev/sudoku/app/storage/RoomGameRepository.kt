package dev.sudoku.app.storage

import androidx.room.withTransaction
import dev.sudoku.app.model.BackupExport
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.EditorToken
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.LocalBackup
import dev.sudoku.app.model.MAX_SAFE_INTEGER
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.PortableCodec
import dev.sudoku.app.model.PreviousSession
import dev.sudoku.app.model.ResultRecord
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.SettingsUpdate
import dev.sudoku.app.model.SnapshotValidationUnavailable
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.updated
import dev.sudoku.app.model.variant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Orders application writes and fences cross-instance updates with Room transactions. */
class RoomGameRepository(private val database: SudokuDatabase, validator: MathematicalValidator) :
    GameRepository {
    private val codec = PortableCodec(validator)
    override val datasetEpochs = database.invalidationTracker.createFlow("dataset")
        .map { database.sudokuDao().dataset()?.epoch ?: 0L }.distinctUntilChanged()

    private val dao = database.sudokuDao()
    private val writes = Mutex()
    private val summaries = database.summaryDao()

    override suspend fun claimEditor(
        sessionId: String,
        ownerId: String
    ): StorageOutcome<EditorToken> = write {
        require(sessionId.isNotBlank() && sessionId.length <= 200 && ownerId.isNotBlank())

        database.withTransaction {
            val state = dataset()
            val generation = increment(state.editorGeneration)
            dao.putDataset(
                state.copy(
                    editorGeneration = generation,
                    editorOwner = ownerId,
                    editorSession = sessionId
                )
            )
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
        val prepared = prepareSessionWrite(record)

        database.withTransaction {
            assertEditor(dataset(), token)
            checkConflict(
                token.sessionId == session.id,
                StorageFailureKind.OWNERSHIP_LOST,
                "Editor owns another session"
            )

            // A formal ID may have an immutable result even when its active session is absent.
            val daily = validated.metadata as? SessionMetadata.Daily
            if (expectedRevision == 0L && daily?.formalAttempt == true) {
                checkConflict(
                    dao.result(validated.id) == null,
                    StorageFailureKind.REVISION_CONFLICT,
                    "Formal attempt already completed"
                )
            }

            val current = dao.session(session.id)
            checkConflict(
                (current?.revision ?: 0) == expectedRevision,
                StorageFailureKind.REVISION_CONFLICT,
                "Saved revision changed"
            )

            putSessionWithProjection(prepared)
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
        val prepared = prepareSessionWrite(record)

        database.withTransaction {
            val state = dataset()
            assertEditor(state, token)
            checkConflict(
                token.sessionId == session.id && dao.session(session.id) == null,
                StorageFailureKind.REVISION_CONFLICT,
                "Replacement identity exists"
            )

            val slotIds = summaries.slotIds(
                validated.mode.name,
                validated.puzzle.rules.variant.wireName
            )
            val slots = slotIds.map { checkNotNull(dao.session(it)) }
            checkConflict(
                slots.size <= 1,
                StorageFailureKind.REVISION_CONFLICT,
                "Multiple active slots"
            )

            // Claiming the new editor supersedes the previous generation for this owner.
            if (slots.isNotEmpty()) {
                val current = slots.single()
                checkConflict(
                    previous != null &&
                        current.id == previous.id &&
                        current.revision == previous.revision &&
                        previous.token.sessionId == previous.id &&
                        previous.token.epoch == state.epoch &&
                        previous.token.ownerId == token.ownerId,
                    StorageFailureKind.REVISION_CONFLICT,
                    "Previous active session changed"
                )
                dao.deleteSession(current.id, current.revision)
                summaries.deleteSession(current.id)
            } else {
                checkConflict(
                    previous == null,
                    StorageFailureKind.REVISION_CONFLICT,
                    "Previous active session disappeared"
                )
            }

            putSessionWithProjection(prepared)
        }

        record
    }

    override suspend fun readSettings(): StorageOutcome<Settings> = access {
        val raw = dao.settings() ?: return@access Settings()

        codec.json.decodeFromString<Settings>(raw.payload).also(codec::validateSettings)
    }

    override suspend fun updateSettings(
        update: SettingsUpdate,
        expectedEpoch: Long
    ): StorageOutcome<Settings> = write {
        database.withTransaction {
            assertEpoch(dataset(), expectedEpoch)

            val current = dao.settings()?.let {
                codec.json.decodeFromString<Settings>(it.payload).also(codec::validateSettings)
            } ?: Settings()
            val next = current.updated(update)
            codec.validateSettings(next)

            dao.putSettings(
                SettingsEntity(payload = codec.encodeRecord(Settings.serializer(), next))
            )

            next
        }
    }

    override suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>> = access {
        dao.lessons().map {
            codec.json.decodeFromString<LessonProgress>(it.payload).also(codec::validateLesson)
        }
    }

    override suspend fun writeLessonProgress(
        progress: LessonProgress,
        expectedEpoch: Long
    ): StorageOutcome<Unit> = write {
        codec.validateLesson(progress)

        val entity =
            LessonEntity(
                progress.lessonId,
                codec.encodeRecord(LessonProgress.serializer(), progress)
            )

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
        val sessions = backup.sessions.map { original ->
            val record = original.copy(revision = 1)
            PreparedSessionWrite(
                entity = sessionEntity(record),
                projection = SessionSummaryEntity(
                    id = record.session.id,
                    revision = record.revision,
                    facts = record.session.summaryFields()
                ),
                completion = null
            )
        }
        val results = backup.results.map(::prepareResultWrite)
        val lessons = backup.lessons.map {
            LessonEntity(it.lessonId, codec.encodeRecord(LessonProgress.serializer(), it))
        }
        val settings =
            SettingsEntity(payload = codec.encodeRecord(Settings.serializer(), backup.settings))

        database.withTransaction {
            val state = dataset()
            assertEpoch(state, preview.expectedEpoch)

            val next = nextDataset(state)

            clearCollections()
            sessions.forEach { prepared ->
                // The backup owns original results separately from active session snapshots.
                dao.putSession(prepared.entity)
                summaries.putSession(prepared.projection)
            }
            results.forEach { putOriginalResult(it) }
            lessons.forEach { dao.putLesson(it) }
            dao.putSettings(settings)

            // Mark coverage and publish the new epoch in the same replacement transaction.
            summaries.sessionCoverage(complete = true)
            summaries.resultCoverage(complete = true)
            dao.putDataset(next)
        }
    }

    override suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport> = write {
        val snapshot = database.withTransaction {
            ExportRows(
                sessions = dao.sessions(),
                results = dao.results(),
                lessons = dao.lessons(),
                settings = dao.settings(),
                quarantined = dao.quarantineCount()
            )
        }

        var excluded = 0
        val sessions = snapshot.sessions.mapNotNull { entity ->
            try {
                codec.decodeSessionEntity(entity)
            } catch (error: IllegalArgumentException) {
                excluded++
                null
            }
        }

        val results = snapshot.results.mapNotNull { entity ->
            try {
                codec.decodeResultEntity(entity)
            } catch (error: IllegalArgumentException) {
                excluded++
                null
            }
        }

        val lessons = snapshot.lessons.mapNotNull { entity ->
            try {
                codec.json.decodeFromString<LessonProgress>(
                    entity.payload
                ).also(codec::validateLesson)
            } catch (error: IllegalArgumentException) {
                excluded++
                null
            }
        }

        val settings = try {
            snapshot.settings?.let {
                codec.json.decodeFromString<Settings>(it.payload).also(codec::validateSettings)
            }
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

        // Apply the same transfer limits used by restoration before reporting an export.
        val text = codec.encodeBackup(backup)
        val validated = codec.decodeBackup(text)

        BackupExport(validated, text, excluded, snapshot.quarantined)
    }

    override suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit> = write {
        database.withTransaction {
            val state = dataset()
            assertEpoch(state, expectedEpoch)

            val next = nextDataset(state)

            clearCollections()
            summaries.sessionCoverage(complete = true)
            summaries.resultCoverage(complete = true)
            dao.putDataset(next)
        }
    }

    override suspend fun countQuarantined(): StorageOutcome<Int> = access { dao.quarantineCount() }

    override suspend fun removeQuarantined(): StorageOutcome<Unit> = write { dao.clearQuarantine() }

    private fun nextDataset(state: DatasetEntity): DatasetEntity = DatasetEntity(
        epoch = increment(state.epoch),
        editorGeneration = increment(state.editorGeneration)
    )

    private fun prepareSessionWrite(record: SessionRecord): PreparedSessionWrite {
        val session = record.session
        val projection = SessionSummaryEntity(session.id, record.revision, session.summaryFields())
        val completion = session.completion?.let {
            prepareResultWrite(ResultRecord(session = session))
        }

        return PreparedSessionWrite(sessionEntity(record), projection, completion)
    }

    private fun prepareResultWrite(record: ResultRecord): PreparedResultWrite {
        val session = record.session

        return PreparedResultWrite(
            resultEntity(record),
            ResultSummaryEntity(session.id, session.summaryFields())
        )
    }

    private suspend fun putSessionWithProjection(prepared: PreparedSessionWrite) {
        dao.putSession(prepared.entity)
        summaries.putSession(prepared.projection)
        prepared.completion?.let { putOriginalResult(it) }
    }

    private suspend fun putOriginalResult(prepared: PreparedResultWrite) {
        // INSERT IGNORE preserves the first completion when a saved game is replayed.
        if (dao.putOriginalResult(prepared.entity) != -1L) {
            summaries.putResult(prepared.projection)
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
        summaries.clearSessions()
        summaries.clearResults()
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
            codec.encodeRecord(SessionRecord.serializer(), record)
        )
    }

    private fun resultEntity(record: ResultRecord): ResultEntity {
        val session = record.session

        return ResultEntity(
            session.id,
            session.mode.name,
            session.puzzle.rules.variant.wireName,
            (session.metadata as? SessionMetadata.Daily)?.challengeDate,
            codec.encodeRecord(ResultRecord.serializer(), record)
        )
    }

    private fun increment(value: Long): Long {
        require(value in 0 until MAX_SAFE_INTEGER) { "Counter exceeds portable integer range" }
        return value + 1
    }

    private suspend fun <T> write(operation: suspend () -> T): StorageOutcome<T> = writes.withLock {
        access(operation)
    }

    private suspend fun <T> access(operation: suspend () -> T): StorageOutcome<T> =
        withContext(Dispatchers.IO) {
            try {
                StorageOutcome.Success(operation())
            } catch (error: CancellationException) {
                throw error
            } catch (error: RepositoryConflict) {
                StorageOutcome.Failure(
                    StorageFailure(
                        error.kind,
                        error.message ?: "Storage conflict"
                    )
                )
            } catch (error: SnapshotValidationUnavailable) {
                StorageOutcome.Failure(
                    StorageFailure(
                        StorageFailureKind.UNAVAILABLE,
                        error.message ?: "Validation unavailable"
                    )
                )
            } catch (error: IllegalArgumentException) {
                val message = error.message ?: "Invalid data"
                val failure = StorageFailure(StorageFailureKind.INVALID_DATA, message)
                StorageOutcome.Failure(failure)
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

private class RepositoryConflict(val kind: StorageFailureKind, message: String) :
    IllegalStateException(message)

private fun checkConflict(condition: Boolean, kind: StorageFailureKind, message: String) {
    if (!condition) {
        throw RepositoryConflict(kind, message)
    }
}

private data class PreparedSessionWrite(
    val entity: SessionEntity,
    val projection: SessionSummaryEntity,
    val completion: PreparedResultWrite?
)

private data class PreparedResultWrite(
    val entity: ResultEntity,
    val projection: ResultSummaryEntity
)

private data class ExportRows(
    val sessions: List<SessionEntity>,
    val results: List<ResultEntity>,
    val lessons: List<LessonEntity>,
    val settings: SettingsEntity?,
    val quarantined: Int
)
