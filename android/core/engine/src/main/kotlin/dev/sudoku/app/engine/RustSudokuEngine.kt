package dev.sudoku.app.engine

import dev.sudoku.app.ffi.AssessmentIdentityDto
import dev.sudoku.app.ffi.AssessmentInputDto
import dev.sudoku.app.ffi.AssessmentResultDto
import dev.sudoku.app.ffi.AssessmentValidationDto
import dev.sudoku.app.ffi.BoardEditDto
import dev.sudoku.app.ffi.BoardQueryDto
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.CandidateResultDto
import dev.sudoku.app.ffi.ConflictResultDto
import dev.sudoku.app.ffi.EditInputDto
import dev.sudoku.app.ffi.EditResultDto
import dev.sudoku.app.ffi.GenerationOptionsDto
import dev.sudoku.app.ffi.GenerationResultDto
import dev.sudoku.app.ffi.GenerationVersionDto
import dev.sudoku.app.ffi.HintInputDto
import dev.sudoku.app.ffi.HintResultDto
import dev.sudoku.app.ffi.HintUnavailableDto
import dev.sudoku.app.ffi.HintValidationDto
import dev.sudoku.app.ffi.HintValidationInputDto
import dev.sudoku.app.ffi.PrepareInputDto
import dev.sudoku.app.ffi.PreparedPuzzle as NativePreparedPuzzle
import dev.sudoku.app.ffi.PuzzleContentDto
import dev.sudoku.app.ffi.ReviewInputDto
import dev.sudoku.app.ffi.StoredAssessmentDto
import dev.sudoku.app.ffi.TeachingStepInputDto
import dev.sudoku.app.ffi.TransformInputDto
import dev.sudoku.app.ffi.ValidationDto
import dev.sudoku.app.ffi.assess
import dev.sudoku.app.ffi.deriveSeed
import dev.sudoku.app.ffi.engineInfo
import dev.sudoku.app.ffi.generate
import dev.sudoku.app.ffi.hint
import dev.sudoku.app.ffi.preparePuzzle
import dev.sudoku.app.ffi.transformRules
import dev.sudoku.app.ffi.validateAssessment
import dev.sudoku.app.ffi.validateHintEvidence
import dev.sudoku.app.ffi.validatePuzzle
import dev.sudoku.app.ffi.validateTeachingStep
import dev.sudoku.app.model.AssessmentResult
import dev.sudoku.app.model.BoardEdit
import dev.sudoku.app.model.BoardLayers
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EditResult
import dev.sudoku.app.model.EngineInformation
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GeneratedPuzzle
import dev.sudoku.app.model.GenerationRequest
import dev.sudoku.app.model.HintResult
import dev.sudoku.app.model.LogicalStep
import dev.sudoku.app.model.PreparedPuzzle
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleAssessment
import dev.sudoku.app.model.PuzzleContent
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.RuleMetadata
import dev.sudoku.app.model.RuleViolation
import dev.sudoku.app.model.SudokuEngine
import dev.sudoku.app.model.Validation
import dev.sudoku.app.model.Variant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

class RustSudokuEngine(private val limits: NativeExecutionLimits = NativeExecutionLimits()) : SudokuEngine {
    override suspend fun information(): EngineOutcome<EngineInformation> = call(false) {
        val value = compatibleInformation()
        EngineOutcome.Completed(
            EngineInformation(
                value.bridgeVersion.toString(),
                value.puzzleVersion,
                value.variantPuzzleVersion,
                value.ratingVersion
            )
        )
    }

    override suspend fun deriveSeed(material: List<UByte>): EngineOutcome<List<UByte>> = guarded {
        val bytes = material.map { it.toByte() }.toByteArray()
        call(false) { EngineOutcome.Completed(deriveSeed(bytes).map { it.toUByte() }) }
    }

    override suspend fun generate(request: GenerationRequest): EngineOutcome<GeneratedPuzzle> = guarded {
        val seed = request.seed.map { it.toByte() }.toByteArray()
        val version = if (request.variant ==
            Variant.CLASSIC
        ) {
            GenerationVersionDto.CLASSIC_V11
        } else {
            GenerationVersionDto.VARIANTS_V11
        }
        val options = GenerationOptionsDto(request.variant.native(), request.difficulty.native(), version, null)
        call(true, limits.generationDeadlineMs) { token ->
            when (val result = generate(seed, options, token)) {
                is GenerationResultDto.Ready -> {
                    val source = result.puzzle
                    val puzzle =
                        Puzzle(
                            source.givens.playerBoard(),
                            source.solution.playerBoard(),
                            source.rules.player(),
                            source.difficulty.player(),
                            source.seed,
                            if (source.puzzleVersion ==
                                GenerationVersionDto.CLASSIC_V11
                            ) {
                                "sudoku-v11"
                            } else {
                                "sudoku-variants-v11"
                            }
                        )
                    EngineOutcome.Completed(
                        GeneratedPuzzle(puzzle, PuzzleAssessment.Rated(result.assessment.player())),
                        result.metrics.constructionWork.toLong()
                    )
                }
                is GenerationResultDto.BudgetExhausted -> EngineOutcome.BudgetExhausted(
                    result.metrics.constructionWork.toLong()
                )
                is GenerationResultDto.Failed -> EngineOutcome.Failed(result.reason)
            }
        }
    }

    override suspend fun prepare(rules: PuzzleRules): EngineOutcome<PreparedPuzzle> = guarded {
        val input = PrepareInputDto(rules.native(), null)
        NativeCalls.run(true, limits.analysisDeadlineMs, discard = { it.discard() }) { token ->
            compatibleInformation()
            val native = preparePuzzle(input, token)
            try {
                EngineOutcome.Completed(
                    OwnedPreparedPuzzle(native, native.metadata().player(), limits),
                    native.preparationWork().toLong()
                )
            } catch (failure: Exception) {
                native.close()
                throw failure
            }
        }
    }

    override suspend fun assess(board: List<Int>, rules: PuzzleRules): EngineOutcome<AssessmentResult> = guarded {
        val input = AssessmentInputDto(board.nativeBoard(), rules.native(), null, null, null, null)
        call(true) { token ->
            val response = assess(input, token)
            when (val result = response.result) {
                is AssessmentResultDto.Rated -> EngineOutcome.Completed(
                    AssessmentResult(
                        PuzzleAssessment.Rated(result.summary.player()),
                        result.trace.map {
                            it.player()
                        }
                    ),
                    response.workUsed.toLong()
                )
                is AssessmentResultDto.BudgetExhausted -> EngineOutcome.BudgetExhausted(response.workUsed.toLong())
                is AssessmentResultDto.Ungraded -> EngineOutcome.Completed(
                    AssessmentResult(PuzzleAssessment.Unavailable("ungraded", emptyList()), emptyList()),
                    response.workUsed.toLong()
                )
                is AssessmentResultDto.Invalid -> EngineOutcome.Completed(
                    AssessmentResult(
                        PuzzleAssessment.Unavailable("invalid-input", result.issues.toList()),
                        emptyList()
                    ),
                    response.workUsed.toLong()
                )
            }
        }
    }

    override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> = guarded {
        val input =
            PuzzleContentDto(
                content.givens.nativeBoard(),
                content.solution.nativeBoard(),
                content.rules.native(),
                content.difficulty.native()
            )
        call(true) { token -> validatePuzzle(input, token).playerValidation() }
    }

    override suspend fun validateAssessment(
        value: PuzzleAssessment?,
        variant: Variant,
        difficulty: Difficulty
    ): EngineOutcome<PuzzleAssessment?> = guarded {
        // Optional historical metadata may be malformed without invalidating playable puzzle content.
        val input = try {
            value?.native()
        } catch (failure: IllegalArgumentException) {
            StoredAssessmentDto.Malformed(listOf(failure.message ?: "Invalid assessment summary"))
        } catch (failure: IllegalStateException) {
            StoredAssessmentDto.Malformed(listOf(failure.message ?: "Invalid assessment summary"))
        }
        val identity = AssessmentIdentityDto(variant.native(), difficulty.native())
        call(false) {
            when (val result = validateAssessment(input, identity)) {
                AssessmentValidationDto.Absent -> EngineOutcome.Completed(null)
                is AssessmentValidationDto.Present -> EngineOutcome.Completed(result.value.player())
            }
        }
    }

    override suspend fun validateHint(
        hint: HintResult,
        board: List<Int>,
        rules: PuzzleRules
    ): EngineOutcome<Validation> = guarded {
        val input = HintValidationInputDto(hint.native(), rules.native(), board.nativeBoard())
        call(true) { token ->
            when (val result = validateHintEvidence(input, token)) {
                is HintValidationDto.Valid -> EngineOutcome.Completed(Validation.Valid)
                is HintValidationDto.Invalid -> EngineOutcome.Completed(Validation.Invalid(result.issues.toList()))
            }
        }
    }

    override suspend fun transformRules(
        rules: PuzzleRules,
        symmetry: Int,
        complement: Boolean
    ): EngineOutcome<PuzzleRules> = guarded {
        require(symmetry in 0..7) { "Invalid spatial symmetry" }
        val input = TransformInputDto(rules.native(), symmetry.toUByte(), complement)
        call(false) { EngineOutcome.Completed(transformRules(input).player()) }
    }

    override suspend fun validateTeachingStep(
        board: List<Int>,
        candidates: List<Int>,
        rules: PuzzleRules,
        step: LogicalStep
    ): EngineOutcome<Validation> = guarded {
        require(candidates.size == 81) { "Teaching candidate state requires 81 cells" }
        val input =
            TeachingStepInputDto(
                board.nativeBoard(),
                candidates.map { it.nativeMask() },
                rules.native(),
                step.native()
            )
        call(true) { token -> validateTeachingStep(input, token).playerValidation() }
    }

    private suspend fun <T> call(
        long: Boolean,
        deadlineMs: Long = limits.analysisDeadlineMs,
        action: (CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> = NativeCalls.run(long, deadlineMs) { token ->
        compatibleInformation()
        action(token)
    }
}

private fun compatibleInformation(): dev.sudoku.app.ffi.EngineInfo {
    val information = engineInfo()
    check(
        information.bridgeVersion == 1u && information.puzzleVersion == "sudoku-v11" &&
            information.variantPuzzleVersion == "sudoku-variants-v11" &&
            information.ratingVersion == "sudoku-rating-v2"
    ) { "Native engine version mismatch" }
    return information
}

private suspend fun <T> guarded(action: suspend () -> EngineOutcome<T>): EngineOutcome<T> = try {
    action()
} catch (failure: IllegalArgumentException) {
    EngineOutcome.Failed(failure.message ?: "Invalid native input")
} catch (failure: IllegalStateException) {
    EngineOutcome.Failed(failure.message ?: "Invalid native state")
}

private fun ValidationDto.playerValidation(): EngineOutcome<Validation> = when (this) {
    ValidationDto.Valid -> EngineOutcome.Completed(Validation.Valid)
    is ValidationDto.Invalid -> EngineOutcome.Completed(Validation.Invalid(issues.toList()))
    ValidationDto.BudgetExhausted -> EngineOutcome.BudgetExhausted()
}

/** A call leases immutable preparation, with no lock held during native computation. */
private class OwnedPreparedPuzzle(
    private val native: NativePreparedPuzzle,
    override val metadata: RuleMetadata,
    private val limits: NativeExecutionLimits
) : PreparedPuzzle {
    private val ownership = Any()
    private var closing = false
    private var inFlight = 0
    private val drained = CompletableDeferred<Unit>()
    private var destroyed = false

    private fun acquire(): NativePreparedPuzzle = synchronized(ownership) {
        check(!closing) { "Prepared puzzle is closed" }
        inFlight += 1
        native
    }

    private fun release() = synchronized(ownership) {
        inFlight -= 1
        if (closing && inFlight == 0) {
            drained.complete(Unit)
        }
    }

    private suspend fun <T> use(
        long: Boolean,
        operation: (NativePreparedPuzzle, CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> = NativeCalls.run(long, limits.analysisDeadlineMs) { token ->
        val handle = acquire()
        try {
            operation(handle, token)
        } finally {
            release()
        }
    }

    override suspend fun edit(givens: List<Int>, layers: BoardLayers, action: BoardEdit): EngineOutcome<EditResult> =
        guarded {
            require(layers.notes.size == 81) { "Notes require 81 masks" }
            val nativeAction = when (action) {
                is BoardEdit.Enter -> BoardEditDto.Enter(action.cell.nativeCell(), action.digit.nativeDigit())
                is BoardEdit.Erase -> BoardEditDto.Erase(action.cell.nativeCell())
                is BoardEdit.ToggleNote -> BoardEditDto.ToggleNote(
                    action.cell.nativeCell(),
                    action.digit.nativeDigit()
                )
                BoardEdit.GenerateNotes -> BoardEditDto.GenerateNotes
            }
            val input =
                EditInputDto(
                    givens.nativeBoard(),
                    layers.entries.nativeBoard(),
                    layers.notes.map {
                        it.nativeMask()
                    },
                    nativeAction,
                    null
                )
            use(action == BoardEdit.GenerateNotes) { handle, token ->
                val response = handle.edit(input, token)
                when (val result = response.result) {
                    is EditResultDto.Complete -> EngineOutcome.Completed(
                        EditResult(
                            result.entries.playerBoard(),
                            result.notes.map {
                                it.toInt()
                            },
                            result.changed,
                            result.boardComplete
                        ),
                        response.workUsed.toLong()
                    )
                    EditResultDto.BudgetExhausted -> EngineOutcome.BudgetExhausted(response.workUsed.toLong())
                }
            }
        }

    override suspend fun candidates(board: List<Int>): EngineOutcome<List<Int>> = guarded {
        val input = BoardQueryDto(board.nativeBoard(), null)
        use(true) { handle, token ->
            val response = handle.candidates(input, token)
            when (val result = response.result) {
                is CandidateResultDto.Complete -> EngineOutcome.Completed(
                    result.candidates.map {
                        it.toInt()
                    },
                    response.workUsed.toLong()
                )
                CandidateResultDto.BudgetExhausted -> EngineOutcome.BudgetExhausted(response.workUsed.toLong())
            }
        }
    }

    override suspend fun conflicts(board: List<Int>): EngineOutcome<List<RuleViolation>> = guarded {
        val input = BoardQueryDto(board.nativeBoard(), null)
        use(true) { handle, token ->
            val response = handle.conflicts(input, token)
            when (val result = response.result) {
                is ConflictResultDto.Complete -> EngineOutcome.Completed(
                    result.violations.map {
                        it.player()
                    },
                    response.workUsed.toLong()
                )
                is ConflictResultDto.BudgetExhausted -> EngineOutcome.BudgetExhausted(response.workUsed.toLong())
            }
        }
    }

    override suspend fun isComplete(board: List<Int>): EngineOutcome<Boolean> = guarded {
        val input = board.nativeBoard()
        use(false) { handle, _ -> EngineOutcome.Completed(handle.isComplete(input)) }
    }

    override suspend fun reviewEntries(board: List<Int>, solution: List<Int>): EngineOutcome<List<Int>> = guarded {
        val input = ReviewInputDto(board.nativeBoard(), solution.nativeBoard())
        use(false) { handle, _ -> EngineOutcome.Completed(handle.reviewEntries(input).map { it.toInt() }) }
    }

    override suspend fun hint(board: List<Int>, solution: List<Int>): EngineOutcome<HintResult> = guarded {
        val input = HintInputDto(board.nativeBoard(), solution.nativeBoard(), metadata.rules.native(), null, null)
        use(true) { _, token ->
            val response = hint(input, token)
            val result = response.result
            if (result is HintResultDto.Unavailable && result.reason == HintUnavailableDto.BUDGET_EXHAUSTED) {
                EngineOutcome.BudgetExhausted(response.workUsed.toLong())
            } else {
                EngineOutcome.Completed(result.player(), response.workUsed.toLong())
            }
        }
    }

    override suspend fun close() {
        synchronized(ownership) {
            closing = true
            if (inFlight == 0) {
                drained.complete(Unit)
            }
        }
        // Coroutine cancellation cannot shorten native lifetime. Closing resumes only after every lease returns.
        withContext(NonCancellable + Dispatchers.IO) {
            drained.await()
            synchronized(ownership) {
                if (!destroyed) {
                    native.close()
                    destroyed = true
                }
            }
        }
    }

    fun discard() {
        NativeCalls.release {
            synchronized(ownership) {
                check(inFlight == 0)
                closing = true
                if (!destroyed) {
                    native.close()
                    destroyed = true
                }
                drained.complete(Unit)
            }
        }
    }
}
