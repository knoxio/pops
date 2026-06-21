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
pub async fn connect(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .disable_statement_logging();

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    MIGRATOR.run(&pool).await?;
    Ok(pool)
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
}
