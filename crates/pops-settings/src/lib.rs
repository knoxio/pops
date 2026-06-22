//! `pops-settings` — the Rust mirror of the TS `@pops/pillar-settings` package.
//!
//! It provides the federated Read/Update/Reset settings surface every pillar
//! serves byte-identically (`docs/plans/02-settings-federation.md` §4.4/§4.6,
//! US-S6): the wire types ([`Setting`] and the per-route response bodies), the
//! storage-agnostic RU+reset+seed [`service`] over an injected
//! [`SettingsStore`], read-side sensitive redaction ([`redact_sensitive`]) to a
//! fixed `__redacted__` sentinel, manifest → key-authority derivation
//! ([`derive_key_set`]), the gated, pillar-agnostic [`SettingsHandlers`], and
//! the axum [`settings_router`] whose utoipa `operation_id`s are pinned to the
//! DOT-form (`settings.get`, `settings.set`, …).
//!
//! Protocol is READ + UPDATE + RESET only. There is no create verb and no
//! delete verb — keys are a fixed declared set per pillar; DELETE is a reset
//! alias. The `ensure` write-once seed is internal-only.
//!
//! Every map output is a [`std::collections::BTreeMap`] so the serialized key
//! order is deterministic and sorted. HTTP JSON object key order is not
//! semantically significant; sorted order is chosen so the Rust and TS sides
//! produce comparable bytes.
//!
//! Parity with the TS schema is pinned by `tests/contract.rs`, which
//! round-trips a shared golden fixture (`tests/fixtures/settings.json`,
//! sorted-key JSON) the TS `contract-fixture` test also accepts.
//!
//! This is a standalone library crate: it has no in-tree consumer yet (the
//! contacts Rust pillar will mount it), so it ships compiled + tested-but-unused.

mod error;
mod handlers;
mod manifest;
pub mod openapi;
mod redact;
mod routes;
mod service;
mod wire;

pub use error::UnknownSettingKeyError;
pub use handlers::{HandlerError, SettingsGate, SettingsHandlers};
pub use manifest::{
    derive_key_set, DeclaredSettingsField, DeclaredSettingsGroup, DeclaredSettingsManifest,
    KeyDefaults,
};
pub use redact::{redact_sensitive, redact_sensitive_map, REDACTED};
pub use routes::{settings_router, SettingsState};
pub use service::{
    ensure, get_bulk, get_or_null, list_effective, reset_setting, reset_settings, set_bulk,
    set_raw, MemoryStore, ResetResult, SettingsStore,
};
pub use wire::{
    EnsureResponse, GetManyRequest, GetResponse, ListResponse, MutationResponse, ResetRequest,
    ResetResponse, SetManyRequest, Setting, SettingValueBody, SettingsMapResponse,
};
