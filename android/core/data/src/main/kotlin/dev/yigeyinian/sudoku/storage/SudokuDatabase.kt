package dev.yigeyinian.sudoku.storage

import androidx.room.AutoMigration
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase

@Entity(tableName = "sessions", indices = [Index("mode"), Index("variant"), Index("challengeDate")])
data class SessionEntity(
    @PrimaryKey val id: String,
    val revision: Long,
    val mode: String,
    val variant: String,
    val challengeDate: String?,
    val payload: String
)

@Entity(tableName = "results", indices = [Index("mode"), Index("variant"), Index("challengeDate")])
data class ResultEntity(
    @PrimaryKey val id: String,
    val mode: String,
    val variant: String,
    val challengeDate: String?,
    val payload: String
)

@Entity(tableName = "lessons")
data class LessonEntity(@PrimaryKey val id: String, val payload: String)

@Entity(tableName = "settings")
data class SettingsEntity(@PrimaryKey val id: String = "preferences", val payload: String)

@Entity(tableName = "dataset")
data class DatasetEntity(
    @PrimaryKey val id: Int = 1,
    val epoch: Long = 0,
    val editorGeneration: Long = 0,
    val editorOwner: String? = null,
    val editorSession: String? = null
)

@Entity(tableName = "quarantine")
data class QuarantineEntity(@PrimaryKey val id: String, val source: String, val payload: String, val reason: String)

@Dao
interface SudokuDao {
    @Query("SELECT * FROM sessions ORDER BY id")
    suspend fun sessions(): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE id = :id")
    suspend fun session(id: String): SessionEntity?

    @Query("SELECT * FROM results ORDER BY id")
    suspend fun results(): List<ResultEntity>

    @Query("SELECT * FROM results WHERE id = :id")
    suspend fun result(id: String): ResultEntity?

    @Query("SELECT * FROM lessons ORDER BY id")
    suspend fun lessons(): List<LessonEntity>

    @Query("SELECT * FROM settings WHERE id = 'preferences'")
    suspend fun settings(): SettingsEntity?

    @Query("SELECT * FROM dataset WHERE id = 1")
    suspend fun dataset(): DatasetEntity?

    @Query("SELECT COUNT(*) FROM quarantine")
    suspend fun quarantineCount(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putSession(value: SessionEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun putOriginalResult(value: ResultEntity): Long

    // Repeated completion saves retain the original timestamp; restore inserts only after clearing.
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun putLesson(value: LessonEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putSettings(value: SettingsEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putDataset(value: DatasetEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putQuarantine(value: QuarantineEntity)

    @Query("DELETE FROM sessions WHERE id = :id AND revision = :revision")
    suspend fun deleteSession(id: String, revision: Long): Int

    @Query("DELETE FROM results WHERE id = :id AND payload = :payload")
    suspend fun deleteResult(id: String, payload: String): Int

    @Query("DELETE FROM lessons WHERE id = :id AND payload = :payload")
    suspend fun deleteLesson(id: String, payload: String): Int

    @Query("DELETE FROM sessions")
    suspend fun clearSessions()

    @Query("DELETE FROM results")
    suspend fun clearResults()

    @Query("DELETE FROM lessons")
    suspend fun clearLessons()

    @Query("DELETE FROM settings")
    suspend fun clearSettings()

    @Query("DELETE FROM quarantine")
    suspend fun clearQuarantine()
}

@Database(
    entities = [
        SessionEntity::class,
        SessionSummaryEntity::class,
        ResultSummaryEntity::class,
        SummaryVersionEntity::class,
        ResultEntity::class,
        LessonEntity::class,
        SettingsEntity::class,
        DatasetEntity::class,
        QuarantineEntity::class
    ],
    version = 2,
    autoMigrations = [AutoMigration(from = 1, to = 2)],
    exportSchema = true
)
abstract class SudokuDatabase : RoomDatabase() {
    abstract fun sudokuDao(): SudokuDao
    abstract fun summaryDao(): SummaryDao
}
