use crate::types::Board;

/// Exhaustion carries no count or partial first solution; it cannot prove uniqueness.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SearchResult {
    Complete {
        count: u8,
        solution: Option<Board>,
        nodes_visited: u64,
        work_used: u64,
    },
    BudgetExhausted {
        nodes_visited: u64,
        work_used: u64,
    },
}

impl SearchResult {
    pub(crate) fn with_work_used(self, total: u64) -> Self {
        match self {
            Self::Complete {
                count,
                solution,
                nodes_visited,
                ..
            } => Self::Complete {
                count,
                solution,
                nodes_visited,
                work_used: total,
            },
            Self::BudgetExhausted { nodes_visited, .. } => Self::BudgetExhausted {
                nodes_visited,
                work_used: total,
            },
        }
    }
}
