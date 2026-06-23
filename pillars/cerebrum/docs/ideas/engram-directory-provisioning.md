# Idea: Engram directory provisioning, backup & CLI reindex

Forward-looking infra/ops work that the engram-file-format PRD originally specified but which is **not** implemented today. The engram CRUD, file format, templates, and index are all shipped; this is everything around hosting the engram tree on a real box and giving operators a CLI handle on it.

## Where reality is today

- The engram root resolves from `CEREBRUM_ENGRAMS_DIR`, defaulting to `{cwd}/data/engrams` — there is no `/opt/pops/engrams` anchor, no fixed on-host layout.
- The pillar creates type subfolders and `.archive/` lazily as it writes files (`mkdir -p` on the parent of each write). It does **not** pre-provision the full tree, OS permissions, or seed a `.config/` directory.
- Default templates are read directly from the pillar's bundled `templates/defaults/` directory; they are not copied into a `.templates/` dir under the engram root.
- Reindex is exposed only as `POST /index/reindex` (plus `/index/reconcile`, `/index/status`). There is no `pops cerebrum reindex` CLI.

## What's still wanted

### Fixed on-host layout + permissions

Provision a canonical tree (e.g. under a stable data root) so the engram store has a predictable home independent of the process cwd:

```
<engram-root>/
├── .templates/   ← operator-editable copies of the default templates
├── .config/      ← scope-rules.toml, glia.toml, reflexes.toml scaffolds
├── .archive/     ← archived engrams, preserving the {type}/ structure
├── .index/       ← regenerable index artifacts
└── {type}/       ← journal, decisions, research, meetings, ideas, notes, captures
```

- Directories owned by the pillar's service user, mode `0700`.
- `.archive/` mirrors the original type subfolder of each archived engram (the CRUD service already writes to `.archive/{type}/{id}.md`, so this only needs the parent provisioned/locked-down).
- Seed `.config/` with empty `scope-rules.toml`, `glia.toml`, `reflexes.toml` scaffolds. (Glia and reflex config files are consumed elsewhere in the pillar today but are not seeded by this story.)
- Seed `.templates/` from the bundled defaults on first boot so operators edit copies, not the shipped package files, and point `CEREBRUM_TEMPLATES_DIR` at it.

### Idempotent provisioning

An idempotent provisioning step (Ansible task, container init, or a `mise`/boot hook fitting the federation model) that creates the tree and applies permissions, producing no changes on a second run. Note the dead-architecture original called for an Ansible task in a monolith playbook against `/opt/pops/engrams`; re-scope to the per-pillar deployment model rather than re-using that path.

### Backup integration

Fold the engram root into the encrypted backup pipeline (the original called out rclone + age) so the Markdown source — the actual source of truth — is encrypted and synced on the backup schedule. Confirm the engram root sits outside any repo tree (or is git-ignored) so it can never be accidentally committed.

### CLI reindex

A `pops cerebrum reindex` (and likely `reconcile` / `status`) CLI that drives the existing `/index/*` endpoints, for ops use after a restore or manual file edit, without curling the pillar by hand.

## Acceptance sketch

- Running the provisioning step on a clean host yields the full tree with `0700`/correct ownership and `.config/` + `.templates/` seeded; a second run is a no-op.
- A restored engram backup, after `pops cerebrum reindex`, produces query results identical to the live index.
- The engram root is encrypted and present in the backup target on schedule and is not tracked by git.
