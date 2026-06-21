//! The unified-search slice for contacts.
//!
//! `POST /search` (operationId `search.search`) returns ranked contact hits to
//! the orchestrator's federated search. The operationId is PINNED to
//! `search.search`: the orchestrator resolves `pillar(id).search.search`, so a
//! wrong id means contacts search never federates. Ranking and the cap mirror
//! core's search handler verbatim (exact 1.0 / prefix 0.8 / contains 0.5, cap
//! 20) and the hit `uri` is the canonical single-colon `pops:contacts/contact/<id>`.

pub mod routes;

pub use routes::router;
