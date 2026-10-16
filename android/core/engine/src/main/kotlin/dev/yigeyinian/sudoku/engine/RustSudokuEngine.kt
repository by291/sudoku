package dev.yigeyinian.sudoku.engine

import dev.yigeyinian.sudoku.ffi.AssessmentIdentityDto
import dev.yigeyinian.sudoku.ffi.AssessmentInputDto
import dev.yigeyinian.sudoku.ffi.AssessmentResultDto
import dev.yigeyinian.sudoku.ffi.AssessmentValidationDto
import dev.yigeyinian.sudoku.ffi.BoardEditDto
import dev.yigeyinian.sudoku.ffi.BoardQueryDto
import dev.yigeyinian.sudoku.ffi.CancellationToken
import dev.yigeyinian.sudoku.ffi.CandidateResultDto
import dev.yigeyinian.sudoku.ffi.ConflictResultDto
import dev.yigeyinian.sudoku.ffi.EditInputDto
import dev.yigeyinian.sudoku.ffi.EditResultDto
import dev.yigeyinian.sudoku.ffi.GenerationOptionsDto
import dev.yigeyinian.sudoku.ffi.GenerationResultDto
import dev.yigeyinian.sudoku.ffi.GenerationVersionDto
import dev.yigeyinian.sudoku.ffi.HintInputDto
import dev.yigeyinian.sudoku.ffi.HintResultDto
import dev.yigeyinian.sudoku.ffi.HintUnavailableDto
import dev.yigeyinian.sudoku.ffi.HintValidationDto
import dev.yigeyinian.sudoku.ffi.HintValidationInputDto
import dev.yigeyinian.sudoku.ffi.PrepareInputDto
import dev.yigeyinian.sudoku.ffi.PreparedPuzzle as NativePreparedPuzzle
import dev.yigeyinian.sudoku.ffi.PuzzleContentDto
import dev.yigeyinian.sudoku.ffi.ReviewInputDto
import dev.yigeyinian.sudoku.ffi.StoredAssessmentDto
import dev.yigeyinian.sudoku.ffi.TeachingStepInputDto
import dev.yigeyinian.sudoku.ffi.TransformInputDto
import dev.yigeyinian.sudoku.ffi.ValidationDto
import dev.yigeyinian.sudoku.ffi.assess
import dev.yigeyinian.sudoku.ffi.deriveSeed
import dev.yigeyinian.sudoku.ffi.engineInfo
import dev.yigeyinian.sudoku.ffi.generate
import dev.yigeyinian.sudoku.ffi.hint
import dev.yigeyinian.sudoku.ffi.preparePuzzle
import dev.yigeyinian.sudoku.ffi.transformRules
import dev.yigeyinian.sudoku.ffi.validateAssessment
import dev.yigeyinian.sudoku.ffi.validateHintEvidence
import dev.yigeyinian.sudoku.ffi.validatePuzzle
import dev.yigeyinian.sudoku.ffi.validateTeachingStep
import dev.yigeyinian.sudoku.model.AssessmentResult
import dev.yigeyinian.sudoku.model.BoardEdit
import dev.yigeyinian.sudoku.model.BoardLayers
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.EditResult
import dev.yigeyinian.sudoku.model.EngineInformation
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GeneratedPuzzle
import dev.yigeyinian.sudoku.model.GenerationRequest
import dev.yigeyinian.sudoku.model.HintResult
import dev.yigeyinian.sudoku.model.LogicalStep
import dev.yigeyinian.sudoku.model.PreparedPuzzle
import dev.yigeyinian.sudoku.model.Puzzle
import dev.yigeyinian.sudoku.model.PuzzleAssessment
import dev.yigeyinian.sudoku.model.PuzzleContent
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.RuleMetadata
import dev.yigeyinian.sudoku.model.RuleViolation
import dev.yigeyinian.sudoku.model.SudokuEngine
import dev.yigeyinian.sudoku.model.Validation
import dev.yigeyinian.sudoku.model.Variant
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

private fun compatibleInformation(): dev.yigeyinian.sudoku.ffi.EngineInfo {
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
