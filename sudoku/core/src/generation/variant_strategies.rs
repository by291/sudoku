use crate::rules::types::SudokuVariant;

#[derive(Clone, Copy, Debug)]
pub struct GenerationCapabilities {
    pub allows_digit_map: bool,
    pub allows_complement: bool,
}

pub fn capabilities(variant: SudokuVariant) -> GenerationCapabilities {
    match variant {
        SudokuVariant::Classic | SudokuVariant::Diagonal | SudokuVariant::Jigsaw => {
            GenerationCapabilities {
                allows_digit_map: true,
                allows_complement: true,
            }
        }
        SudokuVariant::Killer | SudokuVariant::Thermo => GenerationCapabilities {
            allows_digit_map: false,
            allows_complement: true,
        },
        SudokuVariant::Arrow => GenerationCapabilities {
            allows_digit_map: false,
            allows_complement: false,
        },
    }
}
