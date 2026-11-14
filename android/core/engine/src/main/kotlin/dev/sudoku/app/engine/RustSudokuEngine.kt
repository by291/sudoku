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
import dev.sudoku.app.ffi.PreparedPuzzle as NativePreparedPuzzle
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
import dev.sudoku.app.model.BOARD_SIZE
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

/** Own the Kotlin entry points for version-checked native computation. */
class RustSudokuEngine(private val limits: NativeExecutionLimits = NativeExecutionLimits()) :
    SudokuEngine {
    override suspend fun information(): EngineOutcome<EngineInformation> =
        call(NativeLane.INTERACTIVE) {
            val value = compatibleInformation()
            EngineOutcome.Completed(
                EngineInformation(
                    bridgeVersion = value.bridgeVersion.toString(),
                    puzzleVersion = value.puzzleVersion,
                    variantPuzzleVersion = value.variantPuzzleVersion,
                    ratingVersion = value.ratingVersion
                )
            )
        }

    override suspend fun deriveSeed(material: List<UByte>): EngineOutcome<List<UByte>> = guarded {
        val bytes = material.map { it.toByte() }.toByteArray()

        call(NativeLane.INTERACTIVE) {
            EngineOutcome.Completed(deriveSeed(bytes).map { it.toUByte() })
        }
    }

    override suspend fun generate(request: GenerationRequest): EngineOutcome<GeneratedPuzzle> =
        guarded {
            val seed = request.seed.map { it.toByte() }.toByteArray()
            val version = if (request.variant == Variant.CLASSIC) {
                GenerationVersionDto.CLASSIC_V12
            } else {
                GenerationVersionDto.VARIANTS_V12
            }
            val options = GenerationOptionsDto(
                variant = request.variant.native(),
                difficulty = request.difficulty.native(),
                puzzleVersion = version,
                limits = null
            )

            call(NativeLane.ANALYSIS) { token ->
                when (val result = generate(seed, options, token)) {
                    is GenerationResultDto.Ready -> {
                        val source = result.puzzle
                        val puzzle =
                            Puzzle(
                                givens = source.givens.playerBoard(),
                                solution = source.solution.playerBoard(),
                                rules = source.rules.player(),
                                difficulty = source.difficulty.player(),
                                seed = source.seed,
                                puzzleVersion = when (source.puzzleVersion) {
                                    GenerationVersionDto.CLASSIC_V12 -> CLASSIC_PUZZLE_VERSION
                                    GenerationVersionDto.VARIANTS_V12 -> VARIANT_PUZZLE_VERSION
                                }
                            )

                        EngineOutcome.Completed(
                            GeneratedPuzzle(
                                puzzle,
                                PuzzleAssessment.Rated(result.assessment.player())
                            )
                        )
                    }
                    is GenerationResultDto.Incomplete -> EngineOutcome.Incomplete
                    is GenerationResultDto.Failed -> EngineOutcome.Failed(result.reason)
                }
            }
        }

    override suspend fun prepare(rules: PuzzleRules): EngineOutcome<PreparedPuzzle> = guarded {
        val input = PrepareInputDto(rules.native())

        val discard: (OwnedPreparedPuzzle) -> Unit = { it.discard() }
        NativeCalls.run(NativeLane.ANALYSIS, limits.requestDeadlineMs, discard) { token ->
            compatibleInformation()
            val native = preparePuzzle(input, token)
            EngineOutcome.Completed(ownPreparedPuzzle(native, limits))
        }
    }

    override suspend fun assess(
        board: List<Int>,
        rules: PuzzleRules
    ): EngineOutcome<AssessmentResult> = guarded {
        val input = AssessmentInputDto(
            board = board.nativeBoard(),
            rules = rules.native(),
            ratingVersion = null,
            limits = null
        )

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

    override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
        validationBoundary {
            val input =
                PuzzleContentDto(
                    givens = content.givens.nativeBoard(),
                    solution = content.solution.nativeBoard(),
                    rules = content.rules.native(),
                    difficulty = content.difficulty.native()
                )

            call(NativeLane.ANALYSIS) { token -> validatePuzzle(input, token).playerValidation() }
        }

    override suspend fun validateAssessment(
        value: PuzzleAssessment?,
        variant: Variant,
        difficulty: Difficulty
    ): EngineOutcome<PuzzleAssessment?> = guarded {
        // Malformed optional historical metadata does not invalidate playable content.
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

                    // Accept the retired reason and preserve its original spelling in history.
                    val historicalReason = (value as? PuzzleAssessment.Unavailable)?.reason
                    val preserved = if (
                        historicalReason == "budget-exhausted" &&
                        validated is PuzzleAssessment.Unavailable &&
                        validated.reason == "incomplete"
                    ) {
                        validated.copy(reason = historicalReason)
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
                is HintValidationDto.Invalid -> {
                    val issues = result.issues.toList()
                    EngineOutcome.Completed(Validation.Invalid(issues))
                }
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
        require(candidates.size == BOARD_SIZE) { "Teaching candidate state requires 81 cells" }

        val input =
            TeachingStepInputDto(
                board = board.nativeBoard(),
                candidates = candidates.map { it.nativeMask() },
                rules = rules.native(),
                step = step.native()
            )

        call(NativeLane.ANALYSIS) { token -> validateTeachingStep(input, token).playerValidation() }
    }

    private suspend fun <T> call(
        lane: NativeLane,
        action: (CancellationToken) -> EngineOutcome<T>
    ): EngineOutcome<T> = NativeCalls.run(lane, limits.requestDeadlineMs) { token ->
        compatibleInformation()
        action(token)
    }
}

private const val NATIVE_BRIDGE_VERSION = 3u
private const val CLASSIC_PUZZLE_VERSION = "sudoku-v12"
private const val VARIANT_PUZZLE_VERSION = "sudoku-variants-v12"
internal const val RATING_VERSION = "sudoku-rating-v2"

/** Transfer ownership only after an independent metadata snapshot has been created. */
internal fun ownPreparedPuzzle(
    native: NativePreparedPuzzle,
    limits: NativeExecutionLimits
): OwnedPreparedPuzzle {
    var transferred = false
    try {
        val prepared = OwnedPreparedPuzzle(native, native.metadata().player(), limits)
        transferred = true

        return prepared
    } finally {
        // Downcall or linkage failure still leaves the unpublished handle owned here.
        if (!transferred) {
            native.close()
        }
    }
}

/** Reject a native library with an incompatible bridge or algorithm identity. */
internal fun compatibleInformation(information: EngineInfo = engineInfo()): EngineInfo {
    check(
        information.bridgeVersion == NATIVE_BRIDGE_VERSION &&
            information.puzzleVersion == CLASSIC_PUZZLE_VERSION &&
            information.variantPuzzleVersion == VARIANT_PUZZLE_VERSION &&
            information.ratingVersion == RATING_VERSION
    ) { "Native engine version mismatch" }
    return information
}

/** Distinguish invalid caller values from an unavailable native state before dispatch. */
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
private suspend fun validationBoundary(
    action: suspend () -> EngineOutcome<Validation>
): EngineOutcome<Validation> = when (val outcome = guarded(action)) {
    is EngineOutcome.InvalidInput -> {
        val validation = Validation.Invalid(listOf(outcome.message))
        EngineOutcome.Completed(validation)
    }
    else -> outcome
}
