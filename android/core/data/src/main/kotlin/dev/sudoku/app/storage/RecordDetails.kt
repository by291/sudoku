package dev.sudoku.app.storage

import androidx.room.withTransaction
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.PortableCodec
import dev.sudoku.app.model.ResultRecord
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.Variant

/** Validates only selected canonical records and repairs projections with epoch and source fences. */
internal class RecordDetails(private val database: SudokuDatabase, validator: MathematicalValidator) {
    private val dao = database.sudokuDao()
    private val summaries = database.summaryDao()
    private val codec = PortableCodec(validator)

    private suspend fun epoch() = dao.dataset()?.epoch ?: 0L

    suspend fun readSession(id: String): StorageOutcome<SessionRecord?> = storageRead {
        val (epoch, entity) = database.withTransaction { epoch() to dao.session(id) }
        if (entity == null) {
            return@storageRead null
        }

        val record = try {
            codec.decodeSessionRecord(entity.payload).also {
                require(it.session.id == id && it.revision == entity.revision)
            }
        } catch (error: IllegalArgumentException) {
            database.withTransaction {
                if (epoch() == epoch && dao.deleteSession(id, entity.revision) == 1) {
                    summaries.deleteSession(id)
                    dao.putQuarantine(
                        QuarantineEntity(
                            "sessions:$id",
                            "sessions",
                            entity.payload,
                            error.message ?: "Invalid session"
                        )
                    )
                }
            }
            throw error
        }

        // Validation can suspend; an old result must not repair or replace a newer canonical record.
        database.withTransaction {
            check(epoch() == epoch && dao.session(id)?.revision == entity.revision) {
                "Session changed during validation"
            }
            val projected = SessionSummaryEntity(id, record.revision, record.session.summaryFields())
            if (summaries.session(id) != projected) {
                summaries.putSession(projected)
            }
        }

        record
    }

    suspend fun readResult(id: String): StorageOutcome<ResultRecord?> = storageRead {
        val (epoch, entity) = database.withTransaction { epoch() to dao.result(id) }
        if (entity == null) {
            return@storageRead null
        }

        val record = try {
            codec.decodeResultRecord(entity.payload).also {
                require(it.session.id == id && it.session.completion != null)
            }
        } catch (error: IllegalArgumentException) {
            database.withTransaction {
                if (epoch() == epoch && dao.deleteResult(id, entity.payload) == 1) {
                    summaries.deleteResult(id)
                    dao.putQuarantine(
                        QuarantineEntity(
                            "results:$id",
                            "results",
                            entity.payload,
                            error.message ?: "Invalid result"
                        )
                    )
                }
            }
            throw error
        }

        // Validation can suspend; an old result must not repair or replace a newer canonical record.
        database.withTransaction {
            check(epoch() == epoch && dao.result(id)?.payload == entity.payload) { "Result changed during validation" }
            val projected = ResultSummaryEntity(id, record.session.summaryFields())
            if (summaries.result(id) != projected) {
                summaries.deleteResult(id)
                summaries.putResult(projected)
            }
        }

        record
    }

    suspend fun readSlot(mode: GameMode, variant: Variant): StorageOutcome<SessionRecord?> = storageRead {
        require(mode != GameMode.DAILY)
        val ids = summaries.slotIds(mode.name, variant.wireName)
        check(ids.size <= 1) { "Multiple active slots" }
        ids.firstOrNull()?.let { readSession(it).value() }
    }
}
