# US-03: Plugin Registry

> PRD: [PRD-090: Plugin Architecture](README.md)
> Status: Done

## Description

As a user, I need a plugin registry that discovers and configures adapters from `plexus.toml` and manages connection credentials securely so that I can set up integrations by editing a configuration file and setting environment variables.

## Acceptance Criteria

- [x] Adapters are configured in `engrams/.config/plexus.toml` using named sections — each section defines an adapter with `name`, `module` (TypeScript module path or built-in identifier), `enabled` (boolean), `settings` (adapter-specific configuration), and `credentials` (key-value pairs referencing environment variables)
- [x] Example `plexus.toml` structure:
  ```toml
  [adapters.email]
  module = "builtin:email"
  enabled = true
  settings = { protocol = "imap", host = "imap.gmail.com", port = 993 }
  credentials = { username = "env:PLEXUS_EMAIL_USER", password = "env:PLEXUS_EMAIL_PASS" }
  ```
- [x] Credential values prefixed with `env:` are resolved from environment variables at initialization time — if the referenced variable is not set, initialization fails with a clear error message naming the missing variable
- [x] Credentials are never stored in plaintext in the database or logs — the `config` column in `plexus_adapters` stores settings without credentials; credentials are resolved fresh from environment variables on each initialization
- [x] On startup, the registry reads `plexus.toml`, loads enabled adapters, resolves credentials, and passes them to the lifecycle manager for initialization
- [x] A file watcher on `plexus.toml` detects changes and reconciles: new adapters are registered, removed adapters are shut down, modified adapters are re-initialized. Changes take effect within 10 seconds
- [x] The `module` field supports `builtin:{name}` for the three reference adapters (PRD-091) and relative paths for custom adapters — the registry resolves the module, imports it, and validates that it implements the `PlexusAdapter` interface
- [x] `cerebrum.plexus.adapters.list` includes configuration details (settings, enabled status) alongside runtime state (health, ingestion counts) for each adapter

## Notes

- The `env:` prefix convention for credentials is simple and secure for a single-user system — no need for a secrets manager. The environment variables are set in the system's process environment or a `.env` file.
- Module resolution for `builtin:` adapters should map to the adapter implementations from PRD-091. Custom adapters (future) would use relative paths to TypeScript files.
- TOML reconciliation on file change should be graceful — shutting down a running adapter should wait for any in-progress sync to complete before re-initializing.
- Consider validating the `settings` object against the adapter's expected schema at registration time, so configuration errors are caught early.
