package dev.sudoku.app.storage

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.SudokuEngine
import dev.sudoku.app.model.learning.LearningContentRepository
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object StorageModule {
    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): SudokuDatabase =
        Room.databaseBuilder(context, SudokuDatabase::class.java, "sudoku-local.db").build()

    @Provides
    @Singleton
    fun repository(database: SudokuDatabase, engine: SudokuEngine): GameRepository =
        RoomGameRepository(database, engine)

    @Provides
    @Singleton
    fun readRepository(database: SudokuDatabase, engine: SudokuEngine): GameReadRepository =
        RoomReadRepository(database, engine)

    @Provides
    @Singleton
    fun learningContent(@ApplicationContext context: Context): LearningContentRepository =
        AssetLearningContentRepository(context)
}
