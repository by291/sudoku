//! Test-only JSON projection; portable core types have no serialization or binding dependency.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sudoku_core::puzzle::Puzzle;
use sudoku_core::rules::types::{Arrow, Cage, PreparedRules, PuzzleRules, RuleConstraint};
use sudoku_core::types::{Board, CoreResult, Difficulty, EngineError};

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum RuleDto {
    Classic,
    Diagonal,
    Jigsaw { regions: Vec<Vec<usize>> },
    Killer { cages: Vec<CageDto> },
    Thermo { paths: Vec<Vec<usize>> },
    Arrow { arrows: Vec<ArrowDto> },
}

#[derive(Deserialize, Serialize)]
struct CageDto {
    cells: Vec<usize>,
    sum: u16,
}

#[derive(Deserialize, Serialize)]
struct ArrowDto {
    circle: usize,
    shaft: Vec<usize>,
}

impl From<RuleDto> for PuzzleRules {
    fn from(value: RuleDto) -> Self {
        match value {
            RuleDto::Classic => Self::Classic,
            RuleDto::Diagonal => Self::Diagonal,
            RuleDto::Jigsaw { regions } => Self::Jigsaw { regions },
            RuleDto::Killer { cages } => Self::Killer {
                cages: cages
                    .into_iter()
                    .map(|cage| Cage {
                        cells: cage.cells,
                        sum: cage.sum,
                    })
                    .collect(),
            },
            RuleDto::Thermo { paths } => Self::Thermo { paths },
            RuleDto::Arrow { arrows } => Self::Arrow {
                arrows: arrows
                    .into_iter()
                    .map(|arrow| Arrow {
                        circle: arrow.circle,
                        shaft: arrow.shaft,
                    })
                    .collect(),
            },
        }
    }
}

pub fn decode_rules(value: &Value) -> CoreResult<PuzzleRules> {
    serde_json::from_value::<RuleDto>(value.clone())
        .map(PuzzleRules::from)
        .map_err(|error| EngineError::invalid(error.to_string()))
}

pub fn project_rule_value(rules: &PuzzleRules) -> Value {
    match rules {
        PuzzleRules::Classic => json!({"kind":"classic"}),
        PuzzleRules::Diagonal => json!({"kind":"diagonal"}),
        PuzzleRules::Jigsaw { regions } => json!({"kind":"jigsaw", "regions":regions}),
        PuzzleRules::Killer { cages } => {
            json!({"kind":"killer", "cages": cages.iter().map(|cage| json!({"cells":cage.cells,"sum":cage.sum})).collect::<Vec<_>>() })
        }
        PuzzleRules::Thermo { paths } => json!({"kind":"thermo", "paths":paths}),
        PuzzleRules::Arrow { arrows } => {
            json!({"kind":"arrow", "arrows": arrows.iter().map(|arrow| json!({"circle":arrow.circle,"shaft":arrow.shaft})).collect::<Vec<_>>() })
        }
    }
}

pub fn project_rules(prepared: &PreparedRules) -> Value {
    let metadata = prepared.metadata();
    let units: Vec<Value> = metadata
        .units
        .iter()
        .map(|unit| json!({"kind":unit.kind.as_str(),"index":unit.index,"cells":unit.cells}))
        .collect();
    let constraints: Vec<Value> = metadata
        .constraints
        .iter()
        .map(|constraint| match constraint {
            RuleConstraint::Cage {
                id,
                index,
                cells,
                sum,
            } => json!({"kind":"cage","id":id,"index":index,"cells":cells,"sum":sum}),
            RuleConstraint::Thermo { id, index, cells } => {
                json!({"kind":"thermo","id":id,"index":index,"cells":cells})
            }
            RuleConstraint::Arrow { id, index, cells } => {
                json!({"kind":"arrow","id":id,"index":index,"circle":cells[0],"shaft":cells[1..]})
            }
        })
        .collect();
    json!({"rules":project_rule_value(&metadata.rules),"units":units,"constraints":constraints,
        "cellUnits":metadata.cell_units,"cellConstraints":metadata.cell_constraints,
        "duplicatePeers":metadata.duplicate_peers,"relatedCells":metadata.related_cells})
}

pub fn decode_puzzle(value: &Value) -> CoreResult<Puzzle> {
    let givens: Vec<u8> = serde_json::from_value(value["givens"].clone())
        .map_err(|error| EngineError::invalid(error.to_string()))?;
    let solution: Vec<u8> = serde_json::from_value(value["solution"].clone())
        .map_err(|error| EngineError::invalid(error.to_string()))?;
    let difficulty = match value["difficulty"].as_str() {
        Some("easy") => Difficulty::Easy,
        Some("medium") => Difficulty::Medium,
        Some("hard") => Difficulty::Hard,
        Some("expert") => Difficulty::Expert,
        _ => return Err(EngineError::invalid("Invalid puzzle difficulty")),
    };
    Ok(Puzzle {
        givens: Board::try_from(givens.as_slice())?,
        solution: Board::try_from(solution.as_slice())?,
        rules: decode_rules(&value["rules"])?,
        difficulty,
    })
}
