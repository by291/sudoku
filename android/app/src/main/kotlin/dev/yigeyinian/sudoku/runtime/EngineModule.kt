package dev.yigeyinian.sudoku.runtime

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dev.yigeyinian.sudoku.engine.RustSudokuEngine
import dev.yigeyinian.sudoku.model.SudokuEngine
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object EngineModule {
    @Provides
    @Singleton
    fun engine(): SudokuEngine = RustSudokuEngine()
}
