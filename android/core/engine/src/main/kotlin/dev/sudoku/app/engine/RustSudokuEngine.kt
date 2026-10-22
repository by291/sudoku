package dev.sudoku.app.engine

import dev.sudoku.app.ffi.AssessmentIdentityDto
import dev.sudoku.app.ffi.AssessmentInputDto
import dev.sudoku.app.ffi.AssessmentResultDto
import dev.sudoku.app.ffi.AssessmentValidationDto
import dev.sudoku.app.ffi.CancellationToken
import dev.sudoku.app.ffi.EngineInfo
import dev.sudoku.app.ffi.GenerationOptionsDto
import dev.sudoku.app.ffi.GenerationResultDto
import dev.sudoku.app.ffi.GenerationVersionDto
import dev.sudoku.app.ffi.HintValidationDto
import dev.sudoku.app.ffi.HintValidationInputDto
import dev.sudoku.app.ffi.PrepareInputDto
import dev.sudoku.app.ffi.PuzzleContentDto
import dev.sudoku.app.ffi.StoredAssessmentDto
import dev.sudoku.app.ffi.TeachingStepInputDto
import dev.sudoku.app.ffi.TransformInputDto
import dev.sudoku.app.ffi.ValidationDto
import dev.sudoku.app.ffi.assess
import dev.sudoku.app.ffi.deriveSeed
import dev.sudoku.app.ffi.engineInfo
import dev.sudoku.app.ffi.generate
import dev.sudoku.app.ffi.preparePuzzle
import dev.sudoku.app.ffi.transformRules
import dev.sudoku.app.ffi.validateAssessment
import dev.sudoku.app.ffi.validateHintEvidence
import dev.sudoku.app.ffi.validatePuzzle
import dev.sudoku.app.ffi.validateTeachingStep
import dev.sudoku.app.model.AssessmentResult
import dev.sudoku.app.model.Difficulty
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
import dev.sudoku.app.model.SudokuEngine
import dev.sudoku.app.model.Validation
import dev.sudoku.app.model.Variant

class RustSudokuEngine(private val limits: NativeExecutionLimits = NativeExecutionLimits()) : SudokuEngine {
    override suspend fun information(): EngineOutcome<EngineInformation> = call(NativeLane.INTERACTIVE) {
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
        call(NativeLane.INTERACTIVE) { EngineOutcome.Completed(deriveSeed(bytes).map { it.toUByte() }) }
    }

    override suspend fun generate(request: GenerationRequest): EngineOutcome<GeneratedPuzzle> = guarded {
        val seed = request.seed.map { it.toByte() }.toByteArray()
        val version = if (request.variant == Variant.CLASSIC) {
            GenerationVersionDto.CLASSIC_V12
        } else {
            GenerationVersionDto.VARIANTS_V12
        }
        val options = GenerationOptionsDto(request.variant.native(), request.difficulty.native(), version, null)
        call(NativeLane.ANALYSIS) { token ->
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
                            if (source.puzzleVersion == GenerationVersionDto.CLASSIC_V12) {
                                "sudoku-v12"
                            } else {
                                "sudoku-variants-v12"
                            }
                        )
                    EngineOutcome.Completed(
                        GeneratedPuzzle(puzzle, PuzzleAssessment.Rated(result.assessment.player()))
                    )
                }
                is GenerationResultDto.Incomplete -> EngineOutcome.Incomplete
                is GenerationResultDto.Failed -> EngineOutcome.Failed(result.reason)
            }
        }
    }

    override suspend fun prepare(rules: PuzzleRules): EngineOutcome<PreparedPuzzle> = guarded {
        val input = PrepareInputDto(rules.native())
        NativeCalls.run(NativeLane.ANALYSIS, limits.requestDeadlineMs, discard = { it.discard() }) { token ->
            compatibleInformation()
            val native = preparePuzzle(input, token)
            try {
                EngineOutcome.Completed(
                    OwnedPreparedPuzzle(native, native.metadata().player(), limits)
                )
            } catch (failure: Exception) {
                native.close()
                throw failure
            }
        }
    }

    override suspend fun assess(board: List<Int>, rules: PuzzleRules): EngineOutcome<AssessmentResult> = guarded {
        val input = AssessmentInputDto(board.nativeBoard(), rules.native(), null, null)
        call(NativeLane.ANALYSIS) { token ->
            val response = assess(input, token)
            when (val result = response.result) {
                is AssessmentResultDto.Rated -> EngineOutcome.Completed(
                    AssessmentResult.Rated(
                        result.summary.player(),
                        result.trace.map {
                            it.player()
                        }
                    )
                )
                is AssessmentResultDto.Incomplete -> EngineOutcome.Incomplete
                is AssessmentResultDto.Ungraded -> EngineOutcome.Completed(
                    AssessmentResult.Ungraded(result.variant.player())
                )
                is AssessmentResultDto.Invalid -> EngineOutcome.Completed(
                    AssessmentResult.Invalid(result.issues.map { it.player() })
                )
            }
        }
    }

    override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> = validationBoundary {
        val input =
            PuzzleContentDto(
                content.givens.nativeBoard(),
                content.solution.nativeBoard(),
                content.rules.native(),
                content.difficulty.native()
            )
        call(NativeLane.ANALYSIS) { token -> validatePuzzle(input, token).playerValidation() }
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
        call(NativeLane.INTERACTIVE) {
            when (val result = validateAssessment(input, identity)) {
                AssessmentValidationDto.Absent -> EngineOutcome.Completed(null)
                is AssessmentValidationDto.Present -> {
                    val validated = result.value.player()
                    // Validation accepts the retired reason, but stored history keeps its original spelling.
                    val preserved = if (value is PuzzleAssessment.Unavailable && value.reason == "budget-exhausted" &&
                        validated is PuzzleAssessment.Unavailable && validated.reason == "incomplete"
                    ) {
                        validated.copy(reason = value.reason)
                    } else {
                        validated
                    }
                    EngineOutcome.Completed(preserved)
                }
            }
        }
    }

    override suspend fun validateHint(
        hint: HintResult,
        board: List<Int>,
        rules: PuzzleRules
    ): EngineOutcome<Validation> = guarded {
        val input = HintValidationInputDto(hint.native(), rules.native(), board.nativeBoard())
        call(NativeLane.ANALYSIS) { token ->
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
        call(NativeLane.INTERACTIVE) { EngineOutcome.Completed(transformRules(input).player()) }
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
        call(NativeLane.ANALYSIS) { token -> validateTeachingStep(input, token).playerValidation() }
    }

    private suspend fun <T> call(lane: NativeLane, action: (CancellationToken) -> EngineOutcome<T>): EngineOutcome<T> =
        NativeCalls.run(lane, limits.requestDeadlineMs) { token ->
            compatibleInformation()
            action(token)
        }
}

internal fun compatibleInformation(information: EngineInfo = engineInfo()): EngineInfo {
    check(
        information.bridgeVersion == 3u && information.puzzleVersion == "sudoku-v12" &&
            information.variantPuzzleVersion == "sudoku-variants-v12" &&
            information.ratingVersion == "sudoku-rating-v2"
    ) { "Native engine version mismatch" }
    return information
}

internal suspend fun <T> guarded(action: suspend () -> EngineOutcome<T>): EngineOutcome<T> = try {
    action()
} catch (failure: IllegalArgumentException) {
    EngineOutcome.InvalidInput(failure.message ?: "Invalid native input")
} catch (failure: IllegalStateException) {
    EngineOutcome.Failed(failure.message ?: "Invalid native state")
}

private fun ValidationDto.playerValidation(): EngineOutcome<Validation> = when (this) {
    ValidationDto.Valid -> EngineOutcome.Completed(Validation.Valid)
    is ValidationDto.Invalid -> EngineOutcome.Completed(Validation.Invalid(issues.toList()))
    ValidationDto.Incomplete -> EngineOutcome.Incomplete
}

/** Invalid mathematical input is conclusive; execution failures remain retryable. */
private suspend fun validationBoundary(action: suspend () -> EngineOutcome<Validation>): EngineOutcome<Validation> =
    when (val outcome = guarded(action)) {
        is EngineOutcome.InvalidInput -> EngineOutcome.Completed(Validation.Invalid(listOf(outcome.message)))
        else -> outcome
    }
