package dev.sudoku.app.runtime

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dev.sudoku.app.engine.RustSudokuEngine
import dev.sudoku.app.model.SudokuEngine
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object EngineModule {
    @Provides
    @Singleton
    fun engine(): SudokuEngine = RustSudokuEngine()
}
