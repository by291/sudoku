package dev.sudoku.app.game

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.DailyStatus
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import java.time.Instant
import javax.inject.Inject

internal sealed interface EntrySheet {
    data class Setup(val variant: Variant) : EntrySheet

    data object Daily : EntrySheet

    data object Continue : EntrySheet
}

internal data class GameEntryUiState(
    val epoch: Long? = null,
    val sheet: EntrySheet? = null,
    val loading: Boolean = true,
    val hasLoadedSnapshot: Boolean = false,
    val hasSaves: Boolean = false,
    val singleSaveId: String? = null,
    val saves: List<SummaryItem> = emptyList(),
    val next: SummaryCursor? = null,
    val freeSave: GameSummary? = null,
    val freePending: Boolean = false,
    val daily: Map<Variant, DailyStatus> = emptyMap(),
    val sheetLoading: Boolean = false,
    val sheetError: String? = null,
    val today: String = challengeDate(Instant.now()),
    val error: String? = null
)

@HiltViewModel
internal class GameEntryViewModel @Inject constructor(
    reads: GameReadRepository,
    repository: GameRepository,
    savedState: SavedStateHandle
) : ViewModel() {
    private val controller = GameEntryController(
        reads,
        repository,
        viewModelScope,
        restoredSheet = restoredSheet(savedState),
        rememberSheet = { sheet ->
            savedState["entrySheet"] = when (sheet) {
                is EntrySheet.Setup -> "setup"
                EntrySheet.Daily -> "daily"
                EntrySheet.Continue -> "continue"
                null -> null
            }
            savedState["entryVariant"] = (sheet as? EntrySheet.Setup)?.variant?.name
        }
    )
    val uiState = controller.uiState

    fun open() = controller.open()

    fun refresh() = controller.refresh()

    fun showSetup(daily: Boolean) = controller.showSetup(daily)

    fun showContinue() = controller.showContinue()

    fun dismissSheet() = controller.dismissSheet()

    fun loadSheet(daily: Boolean, variant: Variant) = controller.loadSheet(daily, variant)

    fun loadSaves(more: Boolean = false) = controller.loadSaves(more)
}

private fun restoredSheet(savedState: SavedStateHandle): EntrySheet? = when (savedState.get<String>("entrySheet")) {
    "setup" -> EntrySheet.Setup(
        Variant.entries.find {
            it.name == savedState.get<String>("entryVariant")
        } ?: Variant.CLASSIC
    )
    "daily" -> EntrySheet.Daily
    "continue" -> EntrySheet.Continue
    else -> null
}
