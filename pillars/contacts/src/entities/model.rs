//! Wire ↔ row mapping for the entities (contact) domain.
//!
//! The wire [`Entity`] is camelCase JSON with `aliases`/`defaultTags` as string
//! arrays; the stored [`EntityRow`] is snake_case with `aliases` as opaque CSV
//! and `default_tags` as opaque JSON text. The two array columns are encoded
//! exactly as core's TS service encodes them (`join(', ')` for aliases,
//! `JSON.stringify` for tags) so a migrated row round-trips byte-for-byte and a
//! contact created here reads identically in any other consumer.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// The entity discriminator. Mirrors `ENTITY_TYPES` in core's contract; a
/// contact is the superset of core's + finance's entities so the full set is
/// accepted. Stored verbatim as the `type` column (no enum coercion at the DB
/// layer — validation happens at the route boundary).
pub const ENTITY_TYPES: [&str; 7] = [
    "company",
    "person",
    "government",
    "bank",
    "place",
    "brand",
    "organisation",
];

/// Default `type` applied when a create omits it. Matches the core column
/// default and the TS `CreateEntityBody` default.
pub const DEFAULT_ENTITY_TYPE: &str = "company";

/// The wire shape served by every entities route — the `toEntity` projection.
/// `notionId`, `ownerUri`, and `ownerUriStaleAt` are deliberately NOT exposed
/// (internal/integration columns), matching core's `EntitySchema`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub abn: Option<String>,
    pub aliases: Vec<String>,
    pub default_transaction_type: Option<String>,
    pub default_tags: Vec<String>,
    pub notes: Option<String>,
    pub last_edited_time: String,
}

/// A row as stored in the `entities` table. `aliases` is CSV, `default_tags`
/// is a JSON array string; both are decoded only when projecting to [`Entity`].
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EntityRow {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub abn: Option<String>,
    pub aliases: Option<String>,
    pub default_transaction_type: Option<String>,
    pub default_tags: Option<String>,
    pub notes: Option<String>,
    pub last_edited_time: String,
}

impl From<EntityRow> for Entity {
    fn from(row: EntityRow) -> Self {
        Entity {
            id: row.id,
            name: row.name,
            r#type: row.r#type,
            abn: row.abn,
            aliases: decode_aliases(row.aliases.as_deref()),
            default_transaction_type: row.default_transaction_type,
            default_tags: decode_default_tags(row.default_tags.as_deref()),
            notes: row.notes,
            last_edited_time: row.last_edited_time,
        }
    }
}

/// Match-relevant slice of a contact returned by the bulk lookup — the finance
/// import matcher only needs `id`, `name`, and `aliases`.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EntityLookupRow {
    pub id: String,
    pub name: String,
    pub aliases: Option<String>,
}

/// Wire shape of one bulk-lookup entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityLookup {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
}

impl From<EntityLookupRow> for EntityLookup {
    fn from(row: EntityLookupRow) -> Self {
        EntityLookup {
            id: row.id,
            name: row.name,
            aliases: decode_aliases(row.aliases.as_deref()),
        }
    }
}

/// Decode the CSV `aliases` column into a trimmed, empty-filtered vector.
/// Mirrors core's `parseAliases`: split on `,`, trim, drop empties.
pub fn decode_aliases(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Encode an alias vector to the CSV column value (`join(', ')`), or `None`
/// when empty — matching core's `aliases?.length ? aliases.join(', ') : null`.
pub fn encode_aliases(aliases: &[String]) -> Option<String> {
    if aliases.is_empty() {
        None
    } else {
        Some(aliases.join(", "))
    }
}

/// Decode the JSON `default_tags` column. A non-array / malformed value yields
/// an empty vector rather than erroring — the column is best-effort denorm.
pub fn decode_default_tags(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

/// Encode a tag vector to the JSON column value (`JSON.stringify`), or `None`
/// when empty — matching core's `defaultTags?.length ? JSON.stringify(...) : null`.
pub fn encode_default_tags(tags: &[String]) -> Option<String> {
    if tags.is_empty() {
        None
    } else {
        Some(serde_json::to_string(tags).expect("string vector serializes to a JSON array"))
    }
}

/// Body accepted by `POST /entities`. `type` defaults to `company`; the array
/// fields default to empty.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntityBody {
    pub name: String,
    pub r#type: Option<String>,
    #[serde(default)]
    pub abn: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub default_transaction_type: Option<String>,
    #[serde(default)]
    pub default_tags: Vec<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

/// Body accepted by `PATCH /entities/:id`. Every field is optional; a present
/// field (even `null` for the nullable columns) is applied, an absent field is
/// left untouched. The nullable columns use `Option<Option<T>>` to tell
/// "absent" (outer `None` — leave the column alone) apart from "set to null"
/// (`Some(None)` — clear the column). serde collapses a JSON `null` into the
/// outer `None` by default, so those fields deserialize through
/// [`double_option`], which preserves the present-but-null case.
#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntityBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub r#type: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<String>)]
    pub abn: Option<Option<String>>,
    #[serde(default)]
    pub aliases: Option<Vec<String>>,
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<String>)]
    pub default_transaction_type: Option<Option<String>>,
    #[serde(default)]
    pub default_tags: Option<Vec<String>>,
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<String>)]
    pub notes: Option<Option<String>>,
}

/// Deserialize a present field into `Some(...)` even when its value is JSON
/// `null` (yielding `Some(None)`), so a PATCH can distinguish clearing a
/// nullable column from leaving it untouched. Absent fields use the field's
/// `#[serde(default)]`, which is the outer `None`.
fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliases_round_trip_preserves_values() {
        let aliases = vec!["Acme".to_string(), "ACME Corp".to_string()];
        let encoded = encode_aliases(&aliases);
        assert_eq!(encoded.as_deref(), Some("Acme, ACME Corp"));
        assert_eq!(decode_aliases(encoded.as_deref()), aliases);
    }

    #[test]
    fn empty_aliases_encode_to_null() {
        assert_eq!(encode_aliases(&[]), None);
        assert_eq!(decode_aliases(None), Vec::<String>::new());
    }

    #[test]
    fn aliases_decode_trims_and_drops_empties() {
        assert_eq!(
            decode_aliases(Some(" a ,, b ,")),
            vec!["a".to_string(), "b".to_string()]
        );
    }

    #[test]
    fn default_tags_round_trip_is_json() {
        let tags = vec!["food".to_string(), "rent".to_string()];
        let encoded = encode_default_tags(&tags);
        assert_eq!(encoded.as_deref(), Some(r#"["food","rent"]"#));
        assert_eq!(decode_default_tags(encoded.as_deref()), tags);
    }

    #[test]
    fn malformed_default_tags_decode_to_empty() {
        assert_eq!(decode_default_tags(Some("not json")), Vec::<String>::new());
        assert_eq!(decode_default_tags(None), Vec::<String>::new());
    }

    #[test]
    fn patch_distinguishes_absent_from_null() {
        let absent: UpdateEntityBody = serde_json::from_str("{}").unwrap();
        assert_eq!(
            absent.abn, None,
            "an absent field leaves the column untouched"
        );

        let cleared: UpdateEntityBody = serde_json::from_str(r#"{"abn":null}"#).unwrap();
        assert_eq!(cleared.abn, Some(None), "a present null clears the column");

        let set: UpdateEntityBody = serde_json::from_str(r#"{"abn":"123"}"#).unwrap();
        assert_eq!(set.abn, Some(Some("123".to_string())));
    }

    #[test]
    fn row_projects_to_wire_entity() {
        let row = EntityRow {
            id: "e1".to_string(),
            name: "Acme".to_string(),
            r#type: "company".to_string(),
            abn: Some("123".to_string()),
            aliases: Some("Acme, ACME Corp".to_string()),
            default_transaction_type: None,
            default_tags: Some(r#"["x"]"#.to_string()),
            notes: None,
            last_edited_time: "2026-06-21T00:00:00.000Z".to_string(),
        };
        let entity: Entity = row.into();
        assert_eq!(entity.aliases, vec!["Acme", "ACME Corp"]);
        assert_eq!(entity.default_tags, vec!["x"]);
        assert_eq!(entity.r#type, "company");
    }
}
