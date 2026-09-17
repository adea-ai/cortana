// Re-export the core and retrieval modules so `crate::` paths inside `mcp`
// keep resolving through this facade.
pub use cortana_retrieval::*;

pub mod mcp;
