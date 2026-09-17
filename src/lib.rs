// The library surface is split across workspace crates so compile units stay
// independent: cortana-core holds storage, memory, and ingestion;
// cortana-retrieval holds the embedding/answer engine; cortana-server holds
// the HTTP API and relay; cortana-mcp holds the MCP server. This facade
// re-exports the full module tree so `cortana::api`, `cortana::store`, and
// friends keep working for the binary and integration tests.
pub use cortana_mcp::*;
pub use cortana_server::*;
