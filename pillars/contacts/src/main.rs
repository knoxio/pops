//! Contacts pillar entry point.
//!
//! N0 boots a minimal-but-real axum server: env-resolved port + SQLite path,
//! a migrated pool, and the `/`, `/health`, `/openapi` surface. The registry
//! lifecycle (register / heartbeat / deregister) and the entities domain land
//! in later nodes — see the TODO below.

use std::net::SocketAddr;

use contacts::app::{build_router, AppState};
use contacts::config::Config;
use contacts::db;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    tracing::info!(port = config.port, sqlite = %config.sqlite_path, "booting contacts pillar");

    let pool = db::connect(&config.database_url()).await?;
    let state = AppState {
        pool,
        version: config.version.clone(),
    };
    let router = build_router(state);

    // TODO(contacts N2): spawn the registry lifecycle task here
    // (register-with-retry, 10s heartbeat, deregister on SIGTERM) against
    // POPS_REGISTRY_URL once the Rust registry transport lands. N0 ships no
    // self-registration — contacts is not yet a registry member.

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "contacts pillar listening");
    axum::serve(listener, router).await?;
    Ok(())
}
