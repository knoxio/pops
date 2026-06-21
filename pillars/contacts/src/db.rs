//! SQLite connection pool boot + migration application.
//!
//! N0 opens the pool, sets the durability/concurrency pragmas every pillar
//! DB runs with (WAL journaling, enforced foreign keys, a busy timeout so
//! concurrent writers retry rather than error), and applies the committed
//! migration journal on boot. The entities schema arrives in N1.

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{ConnectOptions, SqlitePool};
use std::str::FromStr;
use std::time::Duration;

/// Embedded migration journal under `pillars/contacts/migrations`. Applied on
/// boot and in tests so the in-memory and on-disk schemas are identical.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Open the pool against `database_url`, apply pragmas, and run migrations.
///
/// In-memory SQLite (`:memory:` / `mode=memory`) is special-cased to a
/// single connection: every in-memory connection is an isolated database, so
/// a multi-connection pool would hand out connections that never saw the
/// migrations the first connection applied. File-backed SQLite (the prod
/// default) keeps the multi-connection pool — all connections share the one
/// on-disk database.
pub async fn connect(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .disable_statement_logging();

    let max_connections = if is_in_memory(database_url) { 1 } else { 5 };

    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect_with(options)
        .await?;

    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

/// Whether `database_url` resolves to a private in-memory SQLite database.
///
/// Each such connection is its own isolated database, so the pool must be
/// capped at one connection or pooled queries race against an unmigrated
/// schema.
fn is_in_memory(database_url: &str) -> bool {
    database_url.contains(":memory:") || database_url.contains("mode=memory")
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn memory_pool() -> SqlitePool {
        connect("sqlite::memory:")
            .await
            .expect("in-memory pool connects and migrates")
    }

    #[tokio::test]
    async fn boot_applies_the_scaffold_migration() {
        let pool = memory_pool().await;
        let marker: (String,) =
            sqlx::query_as("SELECT value FROM _schema_meta WHERE key = 'scaffold'")
                .fetch_one(&pool)
                .await
                .expect("scaffold marker row exists after migration");
        assert_eq!(marker.0, "n0");
    }

    #[tokio::test]
    async fn foreign_keys_pragma_is_enabled() {
        let pool = memory_pool().await;
        let enabled: (i64,) = sqlx::query_as("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .expect("foreign_keys pragma readable");
        assert_eq!(enabled.0, 1, "foreign keys must be enforced");
    }

    #[tokio::test]
    async fn in_memory_pool_is_capped_to_one_connection() {
        let pool = memory_pool().await;
        assert_eq!(
            pool.options().get_max_connections(),
            1,
            "in-memory pools must be single-connection or pooled queries hit an unmigrated schema"
        );
    }

    #[tokio::test]
    async fn concurrent_queries_all_see_the_migrated_schema() {
        let pool = memory_pool().await;
        let handles: Vec<_> = (0..16)
            .map(|_| {
                let pool = pool.clone();
                tokio::spawn(async move {
                    sqlx::query_as::<_, (String,)>(
                        "SELECT value FROM _schema_meta WHERE key = 'scaffold'",
                    )
                    .fetch_one(&pool)
                    .await
                })
            })
            .collect();

        for handle in handles {
            let row = handle
                .await
                .expect("query task joins")
                .expect("every connection from the in-memory pool sees the migrated schema");
            assert_eq!(row.0, "n0");
        }
    }

    #[test]
    fn in_memory_urls_are_detected() {
        assert!(is_in_memory("sqlite::memory:"));
        assert!(is_in_memory("sqlite://:memory:"));
        assert!(is_in_memory("sqlite://file:test?mode=memory&cache=shared"));
        assert!(!is_in_memory("sqlite://contacts.db?mode=rwc"));
        assert!(!is_in_memory("sqlite:///data/sqlite/contacts.db"));
    }
}
