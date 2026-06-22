//! Data access for the entities domain.
//!
//! Every query is parameterized — values are bound, never interpolated into
//! SQL — so the layer is injection-safe. (The N1 node uses sqlx's runtime
//! query API rather than the compile-time `query!` macros: the macros require
//! a build-time database or a committed `.sqlx/` offline cache, and neither the
//! offline cache nor `sqlx-cli` lands until the Phase 6 toolchain node. The
//! conversion to compile-time-checked queries rides that node.)
//!
//! Create/update semantics mirror core's `entities/service.ts` exactly:
//! name-uniqueness raises a conflict, `last_edited_time` is bumped to the
//! current instant on create and on any non-empty update, and ordering is
//! case-insensitive by name.

use sqlx::{Row, SqlitePool};

use super::model::{
    encode_aliases, encode_default_tags, CreateEntityBody, EntityLookupRow, EntityRow,
    UpdateEntityBody, DEFAULT_ENTITY_TYPE,
};
use crate::time::now_rfc3339;

/// Search-candidate slice of a contact (`id`, `name`, `type`, `aliases`) — the
/// columns the search ranker and hit projection need.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EntityNameRow {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub aliases: Option<String>,
}

/// Failure modes of a write that are NOT raw SQL errors.
#[derive(Debug)]
pub enum RepoError {
    /// A unique-name (or `notion_id`) constraint was violated.
    Conflict(String),
    /// The addressed entity does not exist.
    NotFound,
    /// An underlying sqlx failure.
    Db(sqlx::Error),
}

impl From<sqlx::Error> for RepoError {
    fn from(err: sqlx::Error) -> Self {
        RepoError::Db(err)
    }
}

const SELECT_COLUMNS: &str = "id, name, type, abn, aliases, default_transaction_type, \
     default_tags, notes, last_edited_time";

/// List entities filtered by an optional case-insensitive name `search` and an
/// optional exact `type`, ordered case-insensitively by name, with `limit` /
/// `offset` pagination. Returns the page plus the total matching count.
pub async fn list(
    pool: &SqlitePool,
    search: Option<&str>,
    ty: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<EntityRow>, i64), sqlx::Error> {
    let like = search.map(|s| format!("%{s}%"));

    let rows_sql = format!(
        "SELECT {SELECT_COLUMNS} FROM entities \
         WHERE (?1 IS NULL OR name LIKE ?1) AND (?2 IS NULL OR type = ?2) \
         ORDER BY name COLLATE NOCASE LIMIT ?3 OFFSET ?4"
    );
    let rows = sqlx::query_as::<_, EntityRow>(&rows_sql)
        .bind(like.as_deref())
        .bind(ty)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

    let total: i64 = sqlx::query(
        "SELECT COUNT(*) AS total FROM entities \
         WHERE (?1 IS NULL OR name LIKE ?1) AND (?2 IS NULL OR type = ?2)",
    )
    .bind(like.as_deref())
    .bind(ty)
    .fetch_one(pool)
    .await?
    .get("total");

    Ok((rows, total))
}

/// Fetch one entity by id, or `None` if it does not exist.
pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<EntityRow>, sqlx::Error> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM entities WHERE id = ?1");
    sqlx::query_as::<_, EntityRow>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Fetch one entity by name, matched case-insensitively, or `None`. Backs the
/// finance commit create-or-fetch-by-name idempotency path (a 409 on create
/// fetches here). The `NOCASE` collation matches the name-uniqueness rule, so a
/// `409` raised by a case-variant create resolves to the row that already owns
/// that name.
pub async fn find_by_name(pool: &SqlitePool, name: &str) -> Result<Option<EntityRow>, sqlx::Error> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM entities WHERE name = ?1 COLLATE NOCASE");
    sqlx::query_as::<_, EntityRow>(&sql)
        .bind(name)
        .fetch_optional(pool)
        .await
}

/// Insert a new entity. The name must be unique (a duplicate raises
/// [`RepoError::Conflict`]). A v4 UUID id and the current `last_edited_time`
/// are generated server-side.
pub async fn create(pool: &SqlitePool, body: CreateEntityBody) -> Result<EntityRow, RepoError> {
    if name_exists(pool, &body.name, None).await? {
        return Err(RepoError::Conflict(format!(
            "Entity with name '{}' already exists",
            body.name
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let ty = body
        .r#type
        .unwrap_or_else(|| DEFAULT_ENTITY_TYPE.to_string());

    sqlx::query(
        "INSERT INTO entities \
         (id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&ty)
    .bind(body.abn.as_deref())
    .bind(encode_aliases(&body.aliases))
    .bind(body.default_transaction_type.as_deref())
    .bind(encode_default_tags(&body.default_tags))
    .bind(body.notes.as_deref())
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|err| name_conflict_or(err, &body.name))?;

    get(pool, &id).await?.ok_or(RepoError::NotFound)
}

/// Apply a partial update. Absent fields are left untouched; a present nullable
/// field set to `null` clears the column. A rename to a name another entity
/// already owns raises [`RepoError::Conflict`]. `last_edited_time` is bumped
/// only when at least one column actually changes.
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    patch: UpdateEntityBody,
) -> Result<EntityRow, RepoError> {
    if get(pool, id).await?.is_none() {
        return Err(RepoError::NotFound);
    }
    if let Some(name) = patch.name.as_deref() {
        if name_exists(pool, name, Some(id)).await? {
            return Err(RepoError::Conflict(format!(
                "Entity with name '{name}' already exists"
            )));
        }
    }

    let mut builder = UpdateBuilder::new();
    if let Some(name) = &patch.name {
        builder.set_text("name", name.clone());
    }
    if let Some(ty) = &patch.r#type {
        builder.set_text("type", ty.clone());
    }
    if let Some(abn) = &patch.abn {
        builder.set_nullable("abn", abn.clone());
    }
    if let Some(dtt) = &patch.default_transaction_type {
        builder.set_nullable("default_transaction_type", dtt.clone());
    }
    if let Some(notes) = &patch.notes {
        builder.set_nullable("notes", notes.clone());
    }
    if let Some(aliases) = &patch.aliases {
        builder.set_nullable("aliases", encode_aliases(aliases));
    }
    if let Some(tags) = &patch.default_tags {
        builder.set_nullable("default_tags", encode_default_tags(tags));
    }

    if !builder.is_empty() {
        builder
            .execute(pool, id)
            .await
            .map_err(|err| match &patch.name {
                Some(name) => name_conflict_or(err, name),
                None => RepoError::Db(err),
            })?;
    }

    get(pool, id).await?.ok_or(RepoError::NotFound)
}

/// Delete an entity by id. Returns `true` if a row was removed, `false` if no
/// entity had that id.
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM entities WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Return the whole contact set's match-relevant columns (`id`, `name`,
/// `aliases`) in one round-trip. Backs the finance import matcher and the
/// entity-usage rollup.
pub async fn lookup_bulk(pool: &SqlitePool) -> Result<Vec<EntityLookupRow>, sqlx::Error> {
    sqlx::query_as::<_, EntityLookupRow>(
        "SELECT id, name, aliases FROM entities ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await
}

/// Candidate rows for a name search — every entity whose name matches the
/// `LIKE %text%` scan. Scoring/classification happens above the repo.
pub async fn search_candidates(
    pool: &SqlitePool,
    text: &str,
) -> Result<Vec<EntityNameRow>, sqlx::Error> {
    let like = format!("%{text}%");
    sqlx::query_as::<_, EntityNameRow>(
        "SELECT id, name, type, aliases FROM entities WHERE name LIKE ?1",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Map a write failure to a name [`RepoError::Conflict`] when it is the
/// `NOCASE` unique-name index firing, otherwise pass it through as a raw DB
/// error. This is the fail-closed backstop: the create/rename pre-check runs in
/// a separate statement, so a concurrent writer can slip between the check and
/// the write — the index catches that race and this turns it into the same 409
/// the pre-check would have returned.
fn name_conflict_or(err: sqlx::Error, name: &str) -> RepoError {
    if err
        .as_database_error()
        .is_some_and(|db| db.is_unique_violation())
    {
        RepoError::Conflict(format!("Entity with name '{name}' already exists"))
    } else {
        RepoError::Db(err)
    }
}

/// Whether an entity with `name` exists (matched case-insensitively, mirroring
/// the `NOCASE` unique index), optionally excluding the row `exclude` (so a
/// no-op rename of an entity to its own name is not a conflict).
async fn name_exists(
    pool: &SqlitePool,
    name: &str,
    exclude: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let found: Option<String> = sqlx::query_scalar(
        "SELECT id FROM entities WHERE name = ?1 COLLATE NOCASE AND (?2 IS NULL OR id <> ?2) LIMIT 1",
    )
    .bind(name)
    .bind(exclude)
    .fetch_optional(pool)
    .await?;
    Ok(found.is_some())
}

/// Accumulates `SET col = ?` assignments for a partial update so the statement
/// only touches the columns the patch actually changed, then appends the
/// `last_edited_time` bump. Each value is bound, never interpolated.
struct UpdateBuilder {
    assignments: Vec<String>,
    text_binds: Vec<(usize, String)>,
    nullable_binds: Vec<(usize, Option<String>)>,
}

impl UpdateBuilder {
    fn new() -> Self {
        UpdateBuilder {
            assignments: Vec::new(),
            text_binds: Vec::new(),
            nullable_binds: Vec::new(),
        }
    }

    fn next_index(&self) -> usize {
        self.assignments.len() + 1
    }

    fn set_text(&mut self, column: &str, value: String) {
        let idx = self.next_index();
        self.assignments.push(format!("{column} = ?{idx}"));
        self.text_binds.push((idx, value));
    }

    fn set_nullable(&mut self, column: &str, value: Option<String>) {
        let idx = self.next_index();
        self.assignments.push(format!("{column} = ?{idx}"));
        self.nullable_binds.push((idx, value));
    }

    fn is_empty(&self) -> bool {
        self.assignments.is_empty()
    }

    async fn execute(self, pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
        let stamp_idx = self.next_index();
        let id_idx = stamp_idx + 1;
        let mut clauses = self.assignments.clone();
        clauses.push(format!("last_edited_time = ?{stamp_idx}"));
        let sql = format!(
            "UPDATE entities SET {} WHERE id = ?{id_idx}",
            clauses.join(", ")
        );

        let mut ordered: Vec<(usize, Option<String>)> = self
            .text_binds
            .into_iter()
            .map(|(i, v)| (i, Some(v)))
            .chain(self.nullable_binds)
            .collect();
        ordered.sort_by_key(|(i, _)| *i);

        let mut query = sqlx::query(&sql);
        for (_, value) in ordered {
            query = query.bind(value);
        }
        query = query.bind(now_rfc3339()).bind(id);
        query.execute(pool).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::entities::model::Entity;

    async fn pool() -> SqlitePool {
        db::connect("sqlite::memory:")
            .await
            .expect("in-memory pool connects and migrates")
    }

    fn body(name: &str) -> CreateEntityBody {
        CreateEntityBody {
            name: name.to_string(),
            r#type: None,
            abn: None,
            aliases: Vec::new(),
            default_transaction_type: None,
            default_tags: Vec::new(),
            notes: None,
        }
    }

    #[tokio::test]
    async fn create_assigns_id_default_type_and_timestamp() {
        let pool = pool().await;
        let row = create(&pool, body("Acme")).await.expect("create");
        assert!(!row.id.is_empty());
        assert_eq!(row.r#type, "company");
        assert!(row.last_edited_time.ends_with('Z'));
    }

    #[tokio::test]
    async fn create_rejects_duplicate_name() {
        let pool = pool().await;
        create(&pool, body("Acme")).await.expect("first create");
        let err = create(&pool, body("Acme")).await.unwrap_err();
        assert!(matches!(err, RepoError::Conflict(_)));
    }

    #[tokio::test]
    async fn create_rejects_case_variant_name() {
        let pool = pool().await;
        create(&pool, body("Acme")).await.expect("first create");

        let err = create(&pool, body("ACME")).await.unwrap_err();
        assert!(
            matches!(err, RepoError::Conflict(_)),
            "a case-variant create must 409, not insert a second row"
        );

        let (rows, total) = list(&pool, None, None, 50, 0).await.expect("list");
        assert_eq!(total, 1, "no second row was inserted");
        assert_eq!(rows[0].name, "Acme", "the original casing is preserved");
    }

    #[tokio::test]
    async fn unique_index_blocks_a_direct_case_variant_insert() {
        let pool = pool().await;
        create(&pool, body("Acme")).await.expect("seed via repo");

        let direct = sqlx::query(
            "INSERT INTO entities (id, name, type, last_edited_time) \
             VALUES (?1, ?2, 'company', '2026-01-01T00:00:00Z')",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind("acme")
        .execute(&pool)
        .await;

        let err = direct.expect_err("the NOCASE unique index must reject the case-variant insert");
        let db = err
            .as_database_error()
            .expect("a unique-constraint violation is a database error");
        assert!(
            db.is_unique_violation(),
            "the failure is the unique-name index, not some other error: {db}"
        );
    }

    #[tokio::test]
    async fn find_by_name_is_case_insensitive() {
        let pool = pool().await;
        create(&pool, body("Acme")).await.expect("create");

        let found = find_by_name(&pool, "ACME")
            .await
            .expect("find")
            .expect("a case-variant lookup resolves to the stored row");
        assert_eq!(found.name, "Acme");
    }

    #[tokio::test]
    async fn update_rejects_rename_to_case_variant_of_existing_name() {
        let pool = pool().await;
        create(&pool, body("Acme")).await.expect("create a");
        let b = create(&pool, body("Beta")).await.expect("create b");

        let patch = UpdateEntityBody {
            name: Some("acme".to_string()),
            ..Default::default()
        };
        let err = update(&pool, &b.id, patch).await.unwrap_err();
        assert!(matches!(err, RepoError::Conflict(_)));
    }

    #[tokio::test]
    async fn list_filters_by_search_and_type_and_orders_case_insensitively() {
        let pool = pool().await;
        for (name, ty) in [
            ("zebra", "company"),
            ("Apple", "person"),
            ("apricot", "company"),
        ] {
            let mut b = body(name);
            b.r#type = Some(ty.to_string());
            create(&pool, b).await.expect("create");
        }

        let (rows, total) = list(&pool, None, None, 50, 0).await.expect("list all");
        assert_eq!(total, 3);
        let names: Vec<&str> = rows.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names, vec!["Apple", "apricot", "zebra"]);

        let (rows, total) = list(&pool, Some("ap"), None, 50, 0)
            .await
            .expect("list search");
        assert_eq!(total, 2);
        assert_eq!(rows.len(), 2);

        let (rows, total) = list(&pool, None, Some("person"), 50, 0)
            .await
            .expect("list type");
        assert_eq!(total, 1);
        assert_eq!(rows[0].name, "Apple");
    }

    #[tokio::test]
    async fn list_paginates() {
        let pool = pool().await;
        for n in 0..5 {
            create(&pool, body(&format!("e{n}"))).await.expect("create");
        }
        let (rows, total) = list(&pool, None, None, 2, 2).await.expect("page");
        assert_eq!(total, 5);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "e2");
        assert_eq!(rows[1].name, "e3");
    }

    #[tokio::test]
    async fn update_applies_partial_changes_and_bumps_timestamp() {
        let pool = pool().await;
        let created = create(&pool, body("Acme")).await.expect("create");

        let patch = UpdateEntityBody {
            notes: Some(Some("hello".to_string())),
            ..Default::default()
        };
        let updated = update(&pool, &created.id, patch).await.expect("update");
        assert_eq!(updated.notes.as_deref(), Some("hello"));
        assert_eq!(updated.name, "Acme");
        assert!(updated.last_edited_time >= created.last_edited_time);
    }

    #[tokio::test]
    async fn update_can_clear_a_nullable_field() {
        let pool = pool().await;
        let mut b = body("Acme");
        b.abn = Some("123".to_string());
        let created = create(&pool, b).await.expect("create");
        assert_eq!(created.abn.as_deref(), Some("123"));

        let patch = UpdateEntityBody {
            abn: Some(None),
            ..Default::default()
        };
        let updated = update(&pool, &created.id, patch).await.expect("update");
        assert_eq!(updated.abn, None);
    }

    #[tokio::test]
    async fn update_rejects_rename_to_existing_name() {
        let pool = pool().await;
        create(&pool, body("Acme")).await.expect("create a");
        let b = create(&pool, body("Beta")).await.expect("create b");

        let patch = UpdateEntityBody {
            name: Some("Acme".to_string()),
            ..Default::default()
        };
        let err = update(&pool, &b.id, patch).await.unwrap_err();
        assert!(matches!(err, RepoError::Conflict(_)));
    }

    #[tokio::test]
    async fn update_allows_renaming_an_entity_to_its_own_name() {
        let pool = pool().await;
        let created = create(&pool, body("Acme")).await.expect("create");
        let patch = UpdateEntityBody {
            name: Some("Acme".to_string()),
            ..Default::default()
        };
        let updated = update(&pool, &created.id, patch).await.expect("update");
        assert_eq!(updated.name, "Acme");
    }

    #[tokio::test]
    async fn update_missing_entity_is_not_found() {
        let pool = pool().await;
        let err = update(&pool, "nope", UpdateEntityBody::default())
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::NotFound));
    }

    #[tokio::test]
    async fn delete_reports_whether_a_row_was_removed() {
        let pool = pool().await;
        let created = create(&pool, body("Acme")).await.expect("create");
        assert!(delete(&pool, &created.id).await.expect("delete"));
        assert!(!delete(&pool, &created.id).await.expect("delete again"));
        assert!(get(&pool, &created.id).await.expect("get").is_none());
    }

    #[tokio::test]
    async fn lookup_bulk_returns_match_columns() {
        let pool = pool().await;
        let mut b = body("Acme");
        b.aliases = vec!["ACME Corp".to_string()];
        create(&pool, b).await.expect("create");
        let rows = lookup_bulk(&pool).await.expect("lookup");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "Acme");
        assert_eq!(rows[0].aliases.as_deref(), Some("ACME Corp"));
    }

    #[tokio::test]
    async fn find_by_name_round_trips() {
        let pool = pool().await;
        create(&pool, body("Acme")).await.expect("create");
        assert!(find_by_name(&pool, "Acme").await.expect("find").is_some());
        assert!(find_by_name(&pool, "Nope").await.expect("find").is_none());
    }

    #[tokio::test]
    async fn aliases_and_tags_survive_a_db_round_trip() {
        let pool = pool().await;
        let mut b = body("Acme");
        b.aliases = vec!["a".to_string(), "b".to_string()];
        b.default_tags = vec!["food".to_string()];
        let created = create(&pool, b).await.expect("create");
        let fetched = get(&pool, &created.id)
            .await
            .expect("get")
            .expect("present");
        let entity: Entity = fetched.into();
        assert_eq!(entity.aliases, vec!["a", "b"]);
        assert_eq!(entity.default_tags, vec!["food"]);
    }
}
