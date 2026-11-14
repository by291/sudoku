pub mod arrow;
pub mod diagonal;
pub mod jigsaw;
pub mod killer;
pub mod thermo;

use crate::control::ExecutionControl;
use crate::random::SeededRandom;
use crate::types::Board;

pub(super) struct GeometryInput<'layout> {
    pub terminal: &'layout Board,
    pub random: &'layout mut SeededRandom,
    pub control: &'layout mut ExecutionControl,
}
