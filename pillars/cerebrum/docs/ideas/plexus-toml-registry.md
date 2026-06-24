# Idea: Plexus TOML registry, credential resolution, and HTTP registration

The Plexus lifecycle manager, adapter contract, ingestion filters, and the adapter/filter REST surface are built. What is missing is the _bootstrap_: today the lifecycle manager exposes its REST surface over an **empty registry** (zero adapters) and the only way to register an adapter is an in-process `PlexusLifecycleManager.register()` call made out-of-band. There is no declarative config and no HTTP entry point. This idea fills that gap so a user can stand up an integration by editing a file and setting env vars.

## Build this later

### Declarative `plexus.toml` registry

- Read adapters from a config file (e.g. `engrams/.config/plexus.toml`) using named sections. Each section: `name`, `module` (`builtin:{name}` for reference adapters or a relative path for custom ones), `enabled`, `settings` (adapter-specific), and `credentials` (key→value, values referencing env vars).
- Example:
  ```toml
  [adapters.email]
  module = "builtin:email"
  enabled = true
  settings = { protocol = "imap", host = "imap.gmail.com", port = 993 }
  credentials = { username = "env:PLEXUS_EMAIL_USER", password = "env:PLEXUS_EMAIL_PASS" }
  ```
- On startup, load enabled adapters, resolve their modules, validate each implements `PlexusAdapterInterface`, resolve credentials, and hand them to the lifecycle manager for registration + initialization.
- A parse error loads no adapters, logs the error, and lets the system continue (mirrors the manager's current empty-registry tolerance).

### Credential resolution

- Values prefixed `env:` resolve from environment variables at initialization time. A missing variable fails initialization with a clear error naming the variable (`Environment variable X not found`).
- Credentials are never persisted in the DB or logs — the `config` column already stores settings only; credentials are resolved fresh from the environment on each init.

### File-watcher reconciliation

- Watch `plexus.toml`; on change, reconcile within ~10s: register new adapters, shut down removed ones, re-initialize modified ones. Wait for any in-progress sync to finish before re-initializing a running adapter.

### TOML-defined filters

- Allow filters to be declared inline under each adapter section as `[[adapters.<name>.filters]]` (`type`, `field`, `pattern`) and sync them into `plexus_filters` on load. (The DB table and the `filters.set` REST replace already exist; this just sources them from config.)

### HTTP `register` endpoint

- Add `POST /plexus/adapters` (`cerebrum.plexus.adapters.register`) taking `{ name, config }` so an adapter can be registered/initialized over the wire instead of only in-process. Complements, or is fed by, the TOML registry.

## Why deferred

- The lifecycle manager's per-DB-handle singleton and the SQL seam (`plexusService`) are pure data-access by design — `node:fs`, TOML parsing, and module resolution were intentionally kept out so the storage layer stays portable. This idea is the orchestration layer that sits on top of them.
- Consider validating each `settings` object against the adapter's expected schema at registration so config errors surface early, and a "test filter" endpoint that dry-runs filters against recent adapter output (the `dryRun` helper already exists) to show what would be included/excluded.
- Consider notifying the user (shell + Moltbot) when an adapter transitions to `error`, so a broken integration is visible.
