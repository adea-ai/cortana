// Re-export the core modules so module files can keep their historical
// `crate::config` / `crate::store` paths; they resolve through this facade.
pub use cortana_core::*;

pub mod answer;
pub mod embed;
pub mod evaluation;
pub mod memory_evaluation;
pub mod reflection;
pub mod retrieval;
