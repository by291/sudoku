use serde_json::{Value, json};
use sudoku_core::logic::types::{
    AdvancedEvidenceKind, CandidateDomain, ColoringMode, Evidence, LogicalAction, LogicalStep,
    RuleEvidence, RuleEvidenceKind,
};
use sudoku_core::rules::types::Unit;

pub fn project_unit(unit: &Unit) -> Value {
    json!({"kind":unit.kind.as_str(),"index":unit.index})
}

pub fn project_domains(domains: &[CandidateDomain]) -> Value {
    json!(
        domains
            .iter()
            .map(|domain| json!({"cell":domain.cell,"mask":domain.mask.bits()}))
            .collect::<Vec<_>>()
    )
}

pub fn project_rule(evidence: &RuleEvidence) -> Value {
    let mut value = json!({"constraintId":evidence.constraint_id,"cells":evidence.cells,"digits":evidence.digits});
    match &evidence.kind {
        RuleEvidenceKind::Cage { sum, domains } => {
            value["kind"] = json!("cage");
            value["sum"] = json!(sum);
            value["domains"] = project_domains(domains);
        }
        RuleEvidenceKind::Thermo { path, bounds } => {
            value["kind"] = json!("thermo");
            value["path"] = json!(path);
            value["bounds"] = json!(
                bounds
                    .iter()
                    .map(|bound| json!({"cell":bound.cell,"min":bound.min,"max":bound.max}))
                    .collect::<Vec<_>>()
            );
        }
        RuleEvidenceKind::Arrow {
            circle,
            shaft,
            domains,
        } => {
            value["kind"] = json!("arrow");
            value["circle"] = json!(circle);
            value["shaft"] = json!(shaft);
            value["domains"] = project_domains(domains);
        }
    }
    value
}

pub fn project_step(step: &LogicalStep) -> Value {
    let evidence = match &step.evidence {
        Evidence::Rule(evidence) => project_rule(evidence),
        Evidence::Unit {
            unit,
            cells,
            digits,
            premises,
            units,
        } => {
            let mut value = json!({"kind":"unit","unit":project_unit(unit),"cells":cells,"digits":digits,"premises":premises.iter().map(project_rule).collect::<Vec<_>>()});
            if let Some(units) = units {
                value["units"] = json!(units.iter().map(project_unit).collect::<Vec<_>>());
            }
            value
        }
        Evidence::Advanced(evidence) => {
            let mut value = json!({"cells":evidence.cells,"digits":evidence.digits,"domains":project_domains(&evidence.domains)});
            match &evidence.kind {
                AdvancedEvidenceKind::Subset { unit, hidden } => {
                    value["kind"] = json!("subset");
                    value["unit"] = project_unit(unit);
                    value["hidden"] = json!(hidden);
                }
                AdvancedEvidenceKind::Fish { bases, covers } => {
                    value["kind"] = json!("fish");
                    value["bases"] = json!(bases.iter().map(project_unit).collect::<Vec<_>>());
                    value["covers"] = json!(covers.iter().map(project_unit).collect::<Vec<_>>());
                }
                AdvancedEvidenceKind::Wing { pivot, wings } => {
                    value["kind"] = json!("wing");
                    value["pivot"] = json!(pivot);
                    value["wings"] = json!(wings);
                }
                AdvancedEvidenceKind::Coloring {
                    mode,
                    colors,
                    links,
                } => {
                    value["kind"] = json!("coloring");
                    value["mode"] = json!(match mode {
                        ColoringMode::Trap => "trap",
                        ColoringMode::Wrap => "wrap",
                    });
                    value["colors"] = json!(colors);
                    value["links"] = json!(
                        links
                            .iter()
                            .map(|link| json!({"unit":project_unit(&link.unit),"cells":link.cells}))
                            .collect::<Vec<_>>()
                    );
                }
            }
            value
        }
    };
    let mut value = json!({"technique":step.technique.as_str(),"evidence":evidence});
    match &step.action {
        LogicalAction::Placement { cell, digit } => {
            value["kind"] = json!("placement");
            value["cell"] = json!(cell);
            value["digit"] = json!(digit);
        }
        LogicalAction::Elimination { removals } => {
            value["kind"] = json!("elimination");
            value["removals"] = json!(
                removals
                    .iter()
                    .map(|removal| json!({"cell":removal.cell,"digit":removal.digit}))
                    .collect::<Vec<_>>()
            );
        }
    }
    value
}
