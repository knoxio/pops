//! The canonical wire shapes for the federated RU+reset settings surface.
//!
//! These are the Rust mirror of `@pops/pillar-settings`'s ts-rest contract
//! response/request bodies (`contract.ts`). Every map output is a
//! [`BTreeMap`] so the serialized key order is deterministic and sorted,
//! matching the sorted-key JSON the shared golden fixture pins. HTTP JSON
//! object key order is not semantically significant; sorted order is chosen so
//! the Rust and TS sides produce comparable bytes.
//!
//! The cross-language golden-fixture test (`tests/contract.rs`) pins these
//! shapes against the same fixture the TS `contract-fixture` test accepts.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A single persisted setting on the wire — `{ key, value }`. Mirror of the TS
/// `SettingSchema`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

impl Setting {
    /// Convenience constructor used by the service and tests.
    pub fn new(key: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            value: value.into(),
        }
    }
}

/// `GET /settings` response — the effective value for every declared key
/// (sensitive redacted). Mirror of TS `{ data: SettingSchema[] }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct ListResponse {
    pub data: Vec<Setting>,
}

/// `GET /settings/:key` response — a single setting, `null` when unset
/// (sensitive redacted). Mirror of TS `{ data: SettingSchema | null }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct GetResponse {
    pub data: Option<Setting>,
}

/// `POST /settings/get-many` request — batch-read keys. Mirror of TS
/// `{ keys: string[] }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct GetManyRequest {
    pub keys: Vec<String>,
}

/// `POST /settings/get-many` response — a sorted key→value map (missing keys
/// omitted, sensitive redacted). Mirror of TS `{ settings: Record<string,
/// string> }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct SettingsMapResponse {
    pub settings: BTreeMap<String, String>,
}

/// `PUT /settings/:key` request body — the new value. Mirror of TS
/// `{ value: string }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct SettingValueBody {
    pub value: String,
}

/// `POST /settings/set-many` request — a transactional batch write. Mirror of
/// TS `{ entries: SettingSchema[] }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct SetManyRequest {
    pub entries: Vec<Setting>,
}

/// `POST /settings/reset` request — reset declared keys to defaults. `keys`
/// omitted (or empty) resets ALL declared keys. Mirror of TS
/// `{ keys?: string[] }`.
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq, ToSchema)]
pub struct ResetRequest {
    /// Absent (or empty) ⇒ reset every declared key. Serialized only when
    /// present, matching zod `.optional()`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub keys: Option<Vec<String>>,
}

/// Single-write/reset response — the resulting setting plus a human-readable
/// message. Mirror of TS `{ data: SettingSchema, message: string }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct MutationResponse {
    pub data: Setting,
    pub message: String,
}

/// `POST /settings/:key/ensure` (internal) response — the seeded setting.
/// Mirror of TS `{ data: SettingSchema }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct EnsureResponse {
    pub data: Setting,
}

/// `POST /settings/reset` response — the reset keys (in declared/sorted order)
/// and their resolved defaults. Mirror of TS
/// `{ reset: string[], settings: Record<string, string> }`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, ToSchema)]
pub struct ResetResponse {
    pub reset: Vec<String>,
    pub settings: BTreeMap<String, String>,
}
