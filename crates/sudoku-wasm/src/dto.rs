use serde::Serialize;
use tsify::Tsify;

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub bridge_version: u32,
    pub puzzle_version: &'static str,
    pub variant_puzzle_version: &'static str,
    pub rating_version: &'static str,
}
