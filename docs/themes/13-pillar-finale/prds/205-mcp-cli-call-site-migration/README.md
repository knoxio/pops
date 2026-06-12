# PRD-205: MCP + CLI call-site migration

> Epic: [Reclaim misnamed finance code](../../epics/08a-reclaim-misnamed-finance.md)

## Overview

Update `pops-mcp` and `pops-cli` to call `finance.corrections.*` and `finance.tagRules.*` instead of `core.*`. These are the non-shell consumers of the renamed namespace.

## Data Model

No data.

## API Surface

Same substitution pattern as PRD-204, applied to:

- `apps/pops-mcp/src/**` — MCP server
- `apps/pops-cli/src/**` — CLI

## Business Rules

- **In-flight compatibility shim is OPTIONAL.** Since this is a breaking change, a short-lived shim that translates old → new could ease migration for any in-flight automation. Default: no shim; release notes call out the rename.
- **MCP version bumps to a new minor.** Tool calls that use old paths will fail; users see clear errors.
- **CLI is rebuilt + redeployed atomically.**

## Edge Cases

| Case                                  | Behaviour                                             |
| ------------------------------------- | ----------------------------------------------------- |
| Automation script calls old endpoint  | Fails until script is updated. Release notes mention. |
| MCP client cached old tool definition | Re-syncs on next session.                             |

## User Stories

| #   | Story                                         | Summary                                         |
| --- | --------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-mcp-update](us-01-mcp-update.md)       | MCP server: namespace rename + redeploy         |
| 02  | [us-02-cli-update](us-02-cli-update.md)       | CLI: namespace rename + version bump            |
| 03  | [us-03-release-notes](us-03-release-notes.md) | Release notes describing the rename + migration |

## Out of Scope

- Backwards-compat dual-namespace support (default: no).
- Other CLI / MCP changes beyond this rename.
