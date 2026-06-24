# Idea: `pops ego` terminal CLI

A one-shot command-line channel for the cerebrum query/Ego engine so the knowledge
base is reachable from a terminal and from shell scripts. Nothing of this exists
today — there is no `pops` binary, no `bin` entry, and no CLI adapter. The `cli`
value already present in cerebrum's `EgoChannel` enum and engram-source enum is a
placeholder waiting for this.

## Proposed surface

- `pops ego "question"` — send a one-shot query, print the answer to stdout, exit 0.
  Backed by `POST /query/ask` on the running cerebrum pillar (the CLI must not boot
  a server — it talks to the live API).
- No args and no piped stdin → print usage help, exit 1.
- Piped input: `cat notes.md | pops ego "summarise this"` — prepend the piped
  content as delimited context (`--- Context ---\n…\n--- Question ---\n…`).
- `--format markdown|json|plain` (default `markdown`). `json` emits
  `{ answer, citations, scopes }` for `jq`; `plain` strips Markdown.
- `--scopes work.projects.karbon,personal` — comma-separated active scopes.
- `--model <id>` — override the default LLM for the query.
- Citations rendered in every format: Markdown `[title](id)` links, a `citations`
  array in JSON, `[title] (id)` inline in plain.
- Errors (cerebrum unavailable, retrieval timeout, bad scope format) print to
  stderr with a message and exit 1.

## Requirements

- Single-shot only — no persisted conversation (multi-turn → shell chat panel).
- The CLI applies the `cli` channel scope default (empty prefix list today) and
  honours `.secret.*` exclusion unless explicitly scoped in.
- Target sub-3s for a simple question; never spin up a full pillar process.

## Why later

It is a pure convenience surface over the already-shipped `POST /query/ask`. No
other work depends on it, and the MCP + Moltbot channels already cover agent and
mobile entry points.
