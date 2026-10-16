package dev.yigeyinian.sudoku.feature.records

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import dev.yigeyinian.sudoku.model.BackupPreview
import dev.yigeyinian.sudoku.model.LocalBackup
import dev.yigeyinian.sudoku.model.Settings
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class RecordsScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun clearRequiresAnExplicitConfirmationAndCancelIsInitiallyFocused() {
        var cleared = false
        compose.setContent {
            MaterialTheme {
                RecordsScreen(RecordsUiState(loading = false, epoch = 1), {
                }, {}, {}, {}, {}, {}, {}, { cleared = true }, {})
            }
        }

        compose.onNodeWithText("清空本机数据").performScrollTo().performClick()
        compose.onNodeWithText("确认清空").assertIsDisplayed()
        compose.onNodeWithText("取消").assertIsFocused().performClick()

        compose.runOnIdle { assertFalse(cleared) }
        compose.onNodeWithText("清空本机数据").performScrollTo().performClick()
        compose.onNodeWithText("确认清空").performClick()
        compose.runOnIdle { assertTrue(cleared) }
    }

    @Test fun backupPreviewShowsCountsBeforeDestructiveReplacement() {
        var restored = false
        val backup =
            LocalBackup(
                exportedAt = "2026-10-16T01:02:03.004Z",
                sessions = emptyList(),
                results = emptyList(),
                lessons = emptyList(),
                settings = Settings()
            )
        compose.setContent {
            MaterialTheme {
                RecordsScreen(RecordsUiState(loading = false, epoch = 1, preview = BackupPreview(backup, 1)), {
                }, {}, {}, {}, {}, {}, {
                    restored =
                        true
                }, {}, {})
            }
        }

        compose.onNodeWithText("导出时间：2026-10-16T01:02:03.004Z", substring = true).assertIsDisplayed()
        compose.runOnIdle { assertFalse(restored) }
        compose.onNodeWithText("确认替换本机数据").performClick()
        compose.runOnIdle { assertTrue(restored) }
    }
}
