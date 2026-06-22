//! Contacts pillar entry point.
//!
//! Boots a real axum server: env-resolved port + SQLite path, a migrated pool,
//! and the `/`, `/health`, `/openapi`, entities and search surface. When
//! `POPS_REGISTRY_ENABLED=true` it also spawns the registry lifecycle
//! (register-with-backoff, 10s heartbeat, deregister on SIGTERM/SIGINT) against
//! `POPS_REGISTRY_URL`/`CORE_URL` — the reference Rust self-registration.

use std::net::SocketAddr;
use std::sync::Arc;

use contacts::app::{build_router, AppState};
use contacts::config::Config;
use contacts::db;
use contacts::manifest::build_contacts_manifest;
use contacts::registry::{
    coerce_manifest_version, lifecycle::LifecycleConfig, spawn_lifecycle, HttpRegistryTransport,
    LifecycleHandle,
};

const PILLAR_ID: &str = "contacts";

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

    let lifecycle = maybe_spawn_registry(&config);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "contacts pillar listening");

    // Graceful shutdown drains in-flight requests on the first SIGTERM/SIGINT;
    // the lifecycle then deregisters best-effort so core drops the route
    // immediately rather than waiting for the missed-heartbeat eviction.
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    if let Some(handle) = lifecycle {
        handle.stop().await;
    }

    tracing::info!("contacts pillar stopped");
    Ok(())
}

/// Spawn the registry lifecycle when opted-in. Best-effort: a missing/broken
/// registry never blocks boot — registration retries in the background and the
/// server serves its surface regardless.
fn maybe_spawn_registry(config: &Config) -> Option<LifecycleHandle> {
    if !config.registry_enabled {
        tracing::info!("POPS_REGISTRY_ENABLED is not 'true' — contacts will not self-register");
        return None;
    }

    let version = coerce_manifest_version(&config.version);
    let manifest = build_contacts_manifest(&version);
    let transport = Arc::new(HttpRegistryTransport::new(config.registry_url.clone()));

    tracing::info!(
        registry = %config.registry_url,
        self_base_url = %config.self_base_url,
        "registering contacts with the core registry"
    );

    Some(spawn_lifecycle(
        transport,
        config.self_base_url.clone(),
        manifest,
        PILLAR_ID.to_string(),
        LifecycleConfig::default(),
    ))
}

/// Resolve when the process receives SIGTERM (Watchtower/compose stop) or
/// SIGINT (Ctrl-C in local dev).
async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut stream) => {
                stream.recv().await;
            }
            Err(err) => {
                tracing::warn!(%err, "could not install SIGTERM handler; relying on SIGINT only");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }

    tracing::info!("shutdown signal received");
}
