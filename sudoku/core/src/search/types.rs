use crate::types::Board;

/// Exhaustion carries no count or partial first solution; it cannot prove uniqueness.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SearchResult {
    Complete {
        count: u8,
        solution: Option<Board>,
        nodes_visited: u64,
    },
    Incomplete {
        nodes_visited: u64,
    },
}
