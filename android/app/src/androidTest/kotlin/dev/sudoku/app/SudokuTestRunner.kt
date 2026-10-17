package dev.sudoku.app

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner
import dagger.hilt.android.testing.HiltTestApplication

class SudokuTestRunner : AndroidJUnitRunner() {
    override fun newApplication(loader: ClassLoader?, name: String?, context: Context?): Application =
        super.newApplication(loader, HiltTestApplication::class.java.name, context)
}
