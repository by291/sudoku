package dev.sudoku.app.storage

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

internal object SchemaMigrations {
    // Room 2.8.5's generated index-change migration rebuilds the compact result table.
    // Direct schema DDL preserves it in place and never reads or rewrites canonical payloads.
    val version2To3 = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE `summary_version` ADD COLUMN `projectionVersion` INTEGER NOT NULL DEFAULT 0")
            db.execSQL(
                "CREATE INDEX IF NOT EXISTS `index_result_summaries_variant_mode_challengeDate_id` " +
                    "ON `result_summaries` (`variant`, `mode`, `challengeDate`, `id`)"
            )
        }
    }
}
