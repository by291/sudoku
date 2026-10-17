package dev.sudoku.app.game

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.GameLaunch
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.SudokuEngine
import javax.inject.Inject

@HiltViewModel
internal class GameViewModel @Inject constructor(
    engine: SudokuEngine,
    repository: GameRepository,
    reads: dev.sudoku.app.model.GameReadRepository,
    savedState: SavedStateHandle
) : ViewModel() {
    private val controller =
        GameController(engine, repository, reads, viewModelScope, savedState["savedSessionId"], {
            savedState["savedSessionId"] =
                it
        })
    val uiState = controller.uiState
    fun open(launch: GameLaunch) = controller.open(launch)
    fun startNew(launch: GameLaunch) = controller.startNew(launch)
    fun confirmPracticeReplacement() = controller.confirmPracticeReplacement()
    fun cancelPracticeReplacement() = controller.cancelPracticeReplacement()
    fun selectCell(cell: Int) = controller.selectCell(cell)
    fun enterDigit(digit: Int) = controller.enterDigit(digit)
    fun toggleNote(digit: Int) = controller.toggleNote(digit)
    fun erase() = controller.erase()
    fun toggleNotes() = controller.toggleNotes()
    fun undo() = controller.undo()
    fun redo() = controller.redo()
    fun resume() = controller.resume()
    fun pause() = controller.pause()
    fun requestHint() = controller.requestHint()
    fun nextHint() = controller.nextHint()
    fun applyHint() = controller.applyHint()
    fun dismissHint() = controller.dismissHint()
    fun generateNotes() = controller.generateNotes()
    fun checkEntries() = controller.checkEntries()
    fun restart() = controller.restart()
    fun retrySave() = controller.retrySave()
    fun cancelPreparation() = controller.cancelPreparation()
    fun setShowTimer(show: Boolean) = controller.setShowTimer(show)
    fun setHighlightConflicts(show: Boolean) = controller.setHighlightConflicts(show)
    suspend fun leave(): Boolean = controller.leave()
    override fun onCleared() {
        controller.dispose()
    }
}
