//! The entities (contact) domain — the contacts pillar's authoritative store.
//!
//! - [`model`] — wire ↔ row mapping and the request/response body shapes.
//! - [`repo`] — parameterized data access (list/get/create/update/delete plus
//!   the bulk lookup and find-by-name idempotency helpers).
//! - [`routes`] — the axum handlers carrying the DOTTED `entities.*`
//!   operationIds.

pub mod model;
pub mod repo;
pub mod routes;

pub use routes::router;
