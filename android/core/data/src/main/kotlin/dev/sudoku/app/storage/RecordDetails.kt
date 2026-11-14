package dev.sudoku.app.storage

import androidx.room.withTransaction
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.PortableCodec
import dev.sudoku.app.model.ResultRecord
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.variant

/** Validates selected canonical records and fences each repair against its captured source. */
internal class RecordDetails(
    private val database: SudokuDatabase,
    validator: MathematicalValidator
) {
    private val dao = database.sudokuDao()
    private val summaries = database.summaryDao()
    private val codec = PortableCodec(validator)

    private suspend fun epoch() = dao.dataset()?.epoch ?: 0L

    /** Reads one session; maintenance can restrict the capture to its starting dataset. */
    suspend fun readSession(
        id: String,
        expectedEpoch: Long? = null
    ): StorageOutcome<SessionRecord?> = storageRead {
        val (epoch, entity) = database.withTransaction {
            val epoch = epoch()
            if (expectedEpoch != null && epoch != expectedEpoch) {
                throw StaleRecordSnapshot()
            }

            epoch to dao.session(id)
        }
        if (entity == null) {
            return@storageRead null
        }

        val record = try {
            codec.decodeSessionEntity(entity)
        } catch (error: IllegalArgumentException) {
            database.withTransaction {
                assertSessionSource(epoch, entity)
                dao.deleteSession(id, entity.revision)
                summaries.deleteSession(id)
                dao.putQuarantine(
                    QuarantineEntity(
                        id = "sessions:$id",
                        source = "sessions",
                        payload = entity.payload,
                        reason = error.message ?: "Invalid session"
                    )
                )
            }
            throw error
        }

        val facts = record.session.summaryFields()
        val projected = SessionSummaryEntity(id, record.revision, facts)

        database.withTransaction {
            // Validation can suspend, and a deleted row can be recreated at the same revision.
            assertSessionSource(epoch, entity)

            // The validated payload owns the derived index fields as well as the projection.
            val indexed = entity.copy(
                mode = facts.mode,
                variant = facts.variant,
                challengeDate = facts.challengeDate
            )
            if (indexed != entity) {
                dao.putSession(indexed)
            }
            if (summaries.session(id) != projected || indexed != entity) {
                summaries.putSession(projected)
            }
        }

        record
    }

    /** Reads one immutable result and repairs only the source that was validated. */
    suspend fun readResult(id: String, expectedEpoch: Long? = null): StorageOutcome<ResultRecord?> =
        storageRead {
            val (epoch, entity) = database.withTransaction {
                val epoch = epoch()
                if (expectedEpoch != null && epoch != expectedEpoch) {
                    throw StaleRecordSnapshot()
                }

                epoch to dao.result(id)
            }
            if (entity == null) {
                return@storageRead null
            }

            val record = try {
                codec.decodeResultEntity(entity)
            } catch (error: IllegalArgumentException) {
                database.withTransaction {
                    assertResultSource(epoch, entity)
                    dao.deleteResult(id, entity.payload)
                    summaries.deleteResult(id)
                    dao.putQuarantine(
                        QuarantineEntity(
                            id = "results:$id",
                            source = "results",
                            payload = entity.payload,
                            reason = error.message ?: "Invalid result"
                        )
                    )
                }
                throw error
            }

            val facts = record.session.summaryFields()
            val projected = ResultSummaryEntity(id, facts)

            database.withTransaction {
                assertResultSource(epoch, entity)

                // Updating derived columns must not rewrite the immutable first-completion payload.
                val hasIndexMismatch = entity.mode != facts.mode ||
                    entity.variant != facts.variant || entity.challengeDate != facts.challengeDate
                if (hasIndexMismatch) {
                    dao.updateResultIdentity(
                        ResultIndexIdentity(
                            id = id,
                            mode = facts.mode,
                            variant = facts.variant,
                            challengeDate = facts.challengeDate
                        )
                    )
                }
                if (summaries.result(id) != projected || hasIndexMismatch) {
                    summaries.deleteResult(id)
                    summaries.putResult(projected)
                }
            }

            record
        }

    /** Resolves the authoritative active slot, then validates its selected canonical record. */
    suspend fun readSlot(mode: GameMode, variant: Variant): StorageOutcome<SessionRecord?> =
        storageRead {
            require(mode != GameMode.DAILY)

            val (epoch, ids) = database.withTransaction {
                epoch() to summaries.slotIds(mode.name, variant.wireName)
            }
            check(ids.size <= 1) { "Multiple active slots" }

            val id = ids.singleOrNull() ?: return@storageRead null
            val record = readSession(id, expectedEpoch = epoch).value() ?: return@storageRead null

            // Validation can repair an incorrect index; that does not make it the requested slot.
            val session = record.session
            record.takeIf {
                session.mode == mode &&
                    (mode != GameMode.FREE || session.puzzle.rules.variant == variant)
            }
        }

    private suspend fun assertSessionSource(epoch: Long, entity: SessionEntity) {
        if (epoch() != epoch || dao.session(entity.id) != entity) {
            throw StaleRecordSnapshot()
        }
    }

    private suspend fun assertResultSource(epoch: Long, entity: ResultEntity) {
        if (epoch() != epoch || dao.result(entity.id) != entity) {
            throw StaleRecordSnapshot()
        }
    }
}

internal suspend fun PortableCodec.decodeSessionEntity(entity: SessionEntity): SessionRecord {
    val record = decodeSessionRecord(entity.payload)
    require(record.session.id == entity.id && record.revision == entity.revision) {
        "Session payload does not match its stored identity"
    }

    return record
}

internal suspend fun PortableCodec.decodeResultEntity(entity: ResultEntity): ResultRecord {
    val record = decodeResultRecord(entity.payload)
    require(record.session.id == entity.id && record.session.completion != null) {
        "Result payload does not match its stored identity"
    }

    return record
}
