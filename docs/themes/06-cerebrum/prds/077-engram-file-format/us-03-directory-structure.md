# US-03: Directory Structure & Provisioning

> PRD: [PRD-077: Engram File Format & Directory Structure](README.md)
> Status: Done

## Description

As the system operator, I need the engram directory structure provisioned at `/opt/pops/engrams/` with correct permissions, type-based subdirectories, and integration with the existing backup pipeline so that engram files are stored securely and recoverable.

## Acceptance Criteria

- [x] The directory tree is created at `/opt/pops/engrams/` matching the PRD layout: `.templates/`, `.config/`, `.archive/`, `.index/`, `journal/`, `decisions/`, `research/`, `meetings/`, `ideas/`, `notes/`, `captures/`
- [x] All directories under `/opt/pops/engrams/` have permissions `0700` owned by the `pops` service user
- [x] An Ansible task in the existing provisioning playbook creates the directory structure idempotently (running it twice produces no changes)
- [x] The `.archive/` directory preserves the original type subdirectory structure (e.g., archived research engrams go to `.archive/research/`)
- [x] The engram root `/opt/pops/engrams/` is added to the existing rclone+age backup pipeline configuration so that engram files are encrypted and synced on the backup schedule
- [x] A `.gitignore` at the repository root excludes `/opt/pops/engrams/` (or the engrams path is confirmed to be outside the repository tree and not at risk of accidental commit)
- [x] The `.config/` directory is seeded with empty scaffold files: `scope-rules.toml`, `glia.toml`, `reflexes.toml`

## Notes

- The engram directory lives outside the application repository — it is server-state, not repo-state.
- The rclone+age pipeline is already configured for other POPS data; this story adds the engrams path to the existing include list.
- The Ansible task should use `file` module with `state: directory` and loop over the directory list.
