use super::rules::{unit_to_core, unit_to_dto};
use super::values::{core_indices, index, indices};
use crate::dto::logic::{
    AdvancedEvidenceDto, BoundDto, ColoringLinkDto, ColoringModeDto, DomainDto, EvidenceDto,
    HintResultDto, HintUnavailableDto, LogicalStepDto, PlacementDto, RemovalDto, RuleEvidenceDto,
    TechniqueDto, UnitEvidenceDto, UnitEvidenceKindDto,
};
use crate::dto::values::DigitDto;
use sudoku_core::hint::{HintResult, HintUnavailable, Placement};
use sudoku_core::logic::techniques::Technique;
use sudoku_core::logic::types::{
    AdvancedEvidence, AdvancedEvidenceKind, CandidateDomain, CellBound, ColoringLink, ColoringMode,
    Evidence, LogicalAction, LogicalStep, Removal, RuleEvidence, RuleEvidenceKind,
};
use sudoku_core::types::{CandidateMask, CoreResult, Digit, EngineError};

impl From<TechniqueDto> for Technique {
    fn from(value: TechniqueDto) -> Self {
        match value {
            TechniqueDto::NakedSingle => Self::NakedSingle,
            TechniqueDto::HiddenSingle => Self::HiddenSingle,
            TechniqueDto::LockedCandidate => Self::LockedCandidate,
            TechniqueDto::NakedPair => Self::NakedPair,
            TechniqueDto::HiddenPair => Self::HiddenPair,
            TechniqueDto::NakedTriple => Self::NakedTriple,
            TechniqueDto::HiddenTriple => Self::HiddenTriple,
            TechniqueDto::XWing => Self::XWing,
            TechniqueDto::Swordfish => Self::Swordfish,
            TechniqueDto::XYWing => Self::XYWing,
            TechniqueDto::SimpleColoring => Self::SimpleColoring,
            TechniqueDto::CageDistinct => Self::CageDistinct,
            TechniqueDto::CageRemainder => Self::CageRemainder,
            TechniqueDto::CageCombination => Self::CageCombination,
            TechniqueDto::ThermoBound => Self::ThermoBound,
            TechniqueDto::ArrowEquation => Self::ArrowEquation,
            TechniqueDto::ArrowCombination => Self::ArrowCombination,
        }
    }
}

impl From<Technique> for TechniqueDto {
    fn from(value: Technique) -> Self {
        match value {
            Technique::NakedSingle => Self::NakedSingle,
            Technique::HiddenSingle => Self::HiddenSingle,
            Technique::LockedCandidate => Self::LockedCandidate,
            Technique::NakedPair => Self::NakedPair,
            Technique::HiddenPair => Self::HiddenPair,
            Technique::NakedTriple => Self::NakedTriple,
            Technique::HiddenTriple => Self::HiddenTriple,
            Technique::XWing => Self::XWing,
            Technique::Swordfish => Self::Swordfish,
            Technique::XYWing => Self::XYWing,
            Technique::SimpleColoring => Self::SimpleColoring,
            Technique::CageDistinct => Self::CageDistinct,
            Technique::CageRemainder => Self::CageRemainder,
            Technique::CageCombination => Self::CageCombination,
            Technique::ThermoBound => Self::ThermoBound,
            Technique::ArrowEquation => Self::ArrowEquation,
            Technique::ArrowCombination => Self::ArrowCombination,
        }
    }
}

fn domains_to_dto(domains: &[CandidateDomain]) -> CoreResult<Vec<DomainDto>> {
    domains
        .iter()
        .map(|domain| {
            Ok(DomainDto {
                cell: index(domain.cell)?,
                mask: domain.mask.bits(),
            })
        })
        .collect()
}

fn domains_to_core(domains: Vec<DomainDto>) -> CoreResult<Vec<CandidateDomain>> {
    domains
        .into_iter()
        .map(|domain| {
            Ok(CandidateDomain {
                cell: usize::try_from(domain.cell)
                    .map_err(|_| EngineError::invalid("Domain cell exceeds platform bounds"))?,
                mask: CandidateMask::try_from(domain.mask)?,
            })
        })
        .collect()
}

fn digits_to_core(digits: Vec<DigitDto>) -> CoreResult<Vec<u8>> {
    digits
        .into_iter()
        .map(|digit| Digit::try_from(digit.0).map(|digit| digit.value()))
        .collect()
}

fn checked_digit(digit: DigitDto) -> CoreResult<u8> {
    Ok(Digit::try_from(digit.0)?.value())
}

pub fn rule_to_dto(evidence: &RuleEvidence) -> CoreResult<RuleEvidenceDto> {
    let constraint_id = evidence.constraint_id.clone();
    let cells = indices(&evidence.cells)?;
    let digits = evidence.digits.iter().copied().map(DigitDto).collect();
    Ok(match &evidence.kind {
        RuleEvidenceKind::Cage { sum, domains } => RuleEvidenceDto::Cage {
            constraint_id,
            cells,
            digits,
            sum: *sum,
            domains: domains_to_dto(domains)?,
        },
        RuleEvidenceKind::Thermo { path, bounds } => RuleEvidenceDto::Thermo {
            constraint_id,
            cells,
            digits,
            path: indices(path)?,
            bounds: bounds
                .iter()
                .map(|bound| {
                    Ok(BoundDto {
                        cell: index(bound.cell)?,
                        min: DigitDto(bound.min),
                        max: DigitDto(bound.max),
                    })
                })
                .collect::<CoreResult<_>>()?,
        },
        RuleEvidenceKind::Arrow {
            circle,
            shaft,
            domains,
        } => RuleEvidenceDto::Arrow {
            constraint_id,
            cells,
            digits,
            circle: index(*circle)?,
            shaft: indices(shaft)?,
            domains: domains_to_dto(domains)?,
        },
    })
}

fn rule_to_core(evidence: RuleEvidenceDto) -> CoreResult<RuleEvidence> {
    let (constraint_id, cells, digits, kind) = match evidence {
        RuleEvidenceDto::Cage {
            constraint_id,
            cells,
            digits,
            sum,
            domains,
        } => (
            constraint_id,
            cells,
            digits,
            RuleEvidenceKind::Cage {
                sum,
                domains: domains_to_core(domains)?,
            },
        ),
        RuleEvidenceDto::Thermo {
            constraint_id,
            cells,
            digits,
            path,
            bounds,
        } => (
            constraint_id,
            cells,
            digits,
            RuleEvidenceKind::Thermo {
                path: core_indices(path)?,
                bounds: bounds
                    .into_iter()
                    .map(|bound| {
                        Ok(CellBound {
                            cell: usize::try_from(bound.cell).map_err(|_| {
                                EngineError::invalid("Bound cell exceeds platform bounds")
                            })?,
                            min: checked_digit(bound.min)?,
                            max: checked_digit(bound.max)?,
                        })
                    })
                    .collect::<CoreResult<_>>()?,
            },
        ),
        RuleEvidenceDto::Arrow {
            constraint_id,
            cells,
            digits,
            circle,
            shaft,
            domains,
        } => (
            constraint_id,
            cells,
            digits,
            RuleEvidenceKind::Arrow {
                circle: usize::try_from(circle)
                    .map_err(|_| EngineError::invalid("Arrow circle exceeds platform bounds"))?,
                shaft: core_indices(shaft)?,
                domains: domains_to_core(domains)?,
            },
        ),
    };
    Ok(RuleEvidence {
        constraint_id,
        cells: core_indices(cells)?,
        digits: digits_to_core(digits)?,
        kind,
    })
}

fn advanced_to_dto(evidence: &AdvancedEvidence) -> CoreResult<AdvancedEvidenceDto> {
    let cells = indices(&evidence.cells)?;
    let digits = evidence.digits.iter().copied().map(DigitDto).collect();
    let domains = domains_to_dto(&evidence.domains)?;
    Ok(match &evidence.kind {
        AdvancedEvidenceKind::Subset { unit, hidden } => AdvancedEvidenceDto::Subset {
            cells,
            digits,
            domains,
            unit: unit_to_dto(*unit)?,
            hidden: *hidden,
        },
        AdvancedEvidenceKind::Fish { bases, covers } => AdvancedEvidenceDto::Fish {
            cells,
            digits,
            domains,
            bases: bases
                .iter()
                .copied()
                .map(unit_to_dto)
                .collect::<CoreResult<_>>()?,
            covers: covers
                .iter()
                .copied()
                .map(unit_to_dto)
                .collect::<CoreResult<_>>()?,
        },
        AdvancedEvidenceKind::Wing { pivot, wings } => AdvancedEvidenceDto::Wing {
            cells,
            digits,
            domains,
            pivot: index(*pivot)?,
            wings: [index(wings[0])?, index(wings[1])?],
        },
        AdvancedEvidenceKind::Coloring {
            mode,
            colors,
            links,
        } => AdvancedEvidenceDto::Coloring {
            cells,
            digits,
            domains,
            mode: match mode {
                ColoringMode::Trap => ColoringModeDto::Trap,
                ColoringMode::Wrap => ColoringModeDto::Wrap,
            },
            colors: [indices(&colors[0])?, indices(&colors[1])?],
            links: links
                .iter()
                .map(|link| {
                    Ok(ColoringLinkDto {
                        unit: unit_to_dto(link.unit)?,
                        cells: [index(link.cells[0])?, index(link.cells[1])?],
                    })
                })
                .collect::<CoreResult<_>>()?,
        },
    })
}

fn advanced_to_core(evidence: AdvancedEvidenceDto) -> CoreResult<AdvancedEvidence> {
    let (cells, digits, domains, kind) = match evidence {
        AdvancedEvidenceDto::Subset {
            cells,
            digits,
            domains,
            unit,
            hidden,
        } => (
            cells,
            digits,
            domains,
            AdvancedEvidenceKind::Subset {
                unit: unit_to_core(unit)?,
                hidden,
            },
        ),
        AdvancedEvidenceDto::Fish {
            cells,
            digits,
            domains,
            bases,
            covers,
        } => (
            cells,
            digits,
            domains,
            AdvancedEvidenceKind::Fish {
                bases: bases
                    .into_iter()
                    .map(unit_to_core)
                    .collect::<CoreResult<_>>()?,
                covers: covers
                    .into_iter()
                    .map(unit_to_core)
                    .collect::<CoreResult<_>>()?,
            },
        ),
        AdvancedEvidenceDto::Wing {
            cells,
            digits,
            domains,
            pivot,
            wings,
        } => (
            cells,
            digits,
            domains,
            AdvancedEvidenceKind::Wing {
                pivot: usize::try_from(pivot)
                    .map_err(|_| EngineError::invalid("Wing pivot exceeds platform bounds"))?,
                wings: [
                    usize::try_from(wings[0])
                        .map_err(|_| EngineError::invalid("Wing cell exceeds platform bounds"))?,
                    usize::try_from(wings[1])
                        .map_err(|_| EngineError::invalid("Wing cell exceeds platform bounds"))?,
                ],
            },
        ),
        AdvancedEvidenceDto::Coloring {
            cells,
            digits,
            domains,
            mode,
            colors,
            links,
        } => {
            let [first, second] = colors;
            (
                cells,
                digits,
                domains,
                AdvancedEvidenceKind::Coloring {
                    mode: match mode {
                        ColoringModeDto::Trap => ColoringMode::Trap,
                        ColoringModeDto::Wrap => ColoringMode::Wrap,
                    },
                    colors: [core_indices(first)?, core_indices(second)?],
                    links: links
                        .into_iter()
                        .map(|link| {
                            Ok(ColoringLink {
                                unit: unit_to_core(link.unit)?,
                                cells: [
                                    usize::try_from(link.cells[0]).map_err(|_| {
                                        EngineError::invalid("Link cell exceeds platform bounds")
                                    })?,
                                    usize::try_from(link.cells[1]).map_err(|_| {
                                        EngineError::invalid("Link cell exceeds platform bounds")
                                    })?,
                                ],
                            })
                        })
                        .collect::<CoreResult<_>>()?,
                },
            )
        }
    };
    Ok(AdvancedEvidence {
        cells: core_indices(cells)?,
        digits: digits_to_core(digits)?,
        domains: domains_to_core(domains)?,
        kind,
    })
}

fn evidence_to_dto(evidence: &Evidence) -> CoreResult<EvidenceDto> {
    Ok(match evidence {
        Evidence::Rule(evidence) => EvidenceDto::Rule(rule_to_dto(evidence)?),
        Evidence::Advanced(evidence) => EvidenceDto::Advanced(advanced_to_dto(evidence)?),
        Evidence::Unit {
            unit,
            cells,
            digits,
            premises,
            units,
        } => EvidenceDto::Unit(UnitEvidenceDto {
            kind: UnitEvidenceKindDto::Unit,
            unit: unit_to_dto(*unit)?,
            cells: indices(cells)?,
            digits: digits.iter().copied().map(DigitDto).collect(),
            premises: premises
                .iter()
                .map(rule_to_dto)
                .collect::<CoreResult<_>>()?,
            units: units
                .iter()
                .flatten()
                .copied()
                .map(unit_to_dto)
                .collect::<CoreResult<_>>()?,
        }),
    })
}

fn evidence_to_core(evidence: EvidenceDto) -> CoreResult<Evidence> {
    Ok(match evidence {
        EvidenceDto::Rule(evidence) => Evidence::Rule(rule_to_core(evidence)?),
        EvidenceDto::Advanced(evidence) => Evidence::Advanced(advanced_to_core(evidence)?),
        EvidenceDto::Unit(evidence) => Evidence::Unit {
            unit: unit_to_core(evidence.unit)?,
            cells: core_indices(evidence.cells)?,
            digits: digits_to_core(evidence.digits)?,
            premises: evidence
                .premises
                .into_iter()
                .map(rule_to_core)
                .collect::<CoreResult<_>>()?,
            units: Some(
                evidence
                    .units
                    .into_iter()
                    .map(unit_to_core)
                    .collect::<CoreResult<_>>()?,
            ),
        },
    })
}

pub fn step_to_dto(step: &LogicalStep) -> CoreResult<LogicalStepDto> {
    let technique = step.technique.into();
    let evidence = evidence_to_dto(&step.evidence)?;
    Ok(match &step.action {
        LogicalAction::Placement { cell, digit } => LogicalStepDto::Placement {
            technique,
            evidence,
            cell: index(*cell)?,
            digit: DigitDto(*digit),
        },
        LogicalAction::Elimination { removals } => LogicalStepDto::Elimination {
            technique,
            evidence,
            removals: removals
                .iter()
                .map(|removal| {
                    Ok(RemovalDto {
                        cell: index(removal.cell)?,
                        digit: DigitDto(removal.digit),
                    })
                })
                .collect::<CoreResult<_>>()?,
        },
    })
}

pub fn step_to_core(step: LogicalStepDto) -> CoreResult<LogicalStep> {
    let (technique, evidence, action) = match step {
        LogicalStepDto::Placement {
            technique,
            evidence,
            cell,
            digit,
        } => (
            technique,
            evidence,
            LogicalAction::Placement {
                cell: usize::try_from(cell)
                    .map_err(|_| EngineError::invalid("Placement cell exceeds platform bounds"))?,
                digit: checked_digit(digit)?,
            },
        ),
        LogicalStepDto::Elimination {
            technique,
            evidence,
            removals,
        } => (
            technique,
            evidence,
            LogicalAction::Elimination {
                removals: removals
                    .into_iter()
                    .map(|removal| {
                        Ok(Removal {
                            cell: usize::try_from(removal.cell).map_err(|_| {
                                EngineError::invalid("Removal cell exceeds platform bounds")
                            })?,
                            digit: checked_digit(removal.digit)?,
                        })
                    })
                    .collect::<CoreResult<_>>()?,
            },
        ),
    };
    Ok(LogicalStep {
        technique: technique.into(),
        evidence: evidence_to_core(evidence)?,
        action,
    })
}

pub fn hint_to_dto(hint: &HintResult) -> CoreResult<HintResultDto> {
    Ok(match hint {
        HintResult::ReviewEntry { cell } => HintResultDto::ReviewEntry {
            cell: index(*cell)?,
        },
        HintResult::Unavailable(reason) => HintResultDto::Unavailable {
            reason: match reason {
                HintUnavailable::Complete => HintUnavailableDto::Complete,
                HintUnavailable::Unsupported => HintUnavailableDto::Unsupported,
                HintUnavailable::BudgetExhausted => HintUnavailableDto::BudgetExhausted,
            },
        },
        HintResult::Deduction { steps, placement } => HintResultDto::Deduction {
            steps: steps.iter().map(step_to_dto).collect::<CoreResult<_>>()?,
            placement: PlacementDto {
                cell: index(placement.cell)?,
                digit: DigitDto(placement.digit),
            },
        },
    })
}

pub fn hint_to_core(hint: HintResultDto) -> CoreResult<HintResult> {
    Ok(match hint {
        HintResultDto::ReviewEntry { cell } => HintResult::ReviewEntry {
            cell: usize::try_from(cell)
                .map_err(|_| EngineError::invalid("Review cell exceeds platform bounds"))?,
        },
        HintResultDto::Unavailable { reason } => HintResult::Unavailable(match reason {
            HintUnavailableDto::Complete => HintUnavailable::Complete,
            HintUnavailableDto::Unsupported => HintUnavailable::Unsupported,
            HintUnavailableDto::BudgetExhausted => HintUnavailable::BudgetExhausted,
        }),
        HintResultDto::Deduction { steps, placement } => HintResult::Deduction {
            steps: steps
                .into_iter()
                .map(step_to_core)
                .collect::<CoreResult<_>>()?,
            placement: Placement {
                cell: usize::try_from(placement.cell)
                    .map_err(|_| EngineError::invalid("Hint cell exceeds platform bounds"))?,
                digit: checked_digit(placement.digit)?,
            },
        },
    })
}

pub fn logic_to_dto(
    result: &sudoku_core::logic::types::LogicResult,
) -> CoreResult<crate::dto::logic::LogicResultDto> {
    use crate::dto::logic::LogicResultDto;
    use crate::dto::rating::ExhaustionCauseDto;
    use sudoku_core::logic::types::LogicStatus;
    let board = (&result.board).into();
    let steps = result
        .steps
        .iter()
        .map(step_to_dto)
        .collect::<CoreResult<_>>()?;
    Ok(match result.status {
        LogicStatus::Solved => LogicResultDto::Solved { board, steps },
        LogicStatus::Stalled => LogicResultDto::Stalled { board, steps },
        LogicStatus::WorkLimit => LogicResultDto::BudgetExhausted {
            board,
            steps,
            cause: ExhaustionCauseDto::WorkLimit,
        },
        LogicStatus::StepLimit => LogicResultDto::BudgetExhausted {
            board,
            steps,
            cause: ExhaustionCauseDto::LogicalStepLimit,
        },
    })
}
