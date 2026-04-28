# US-03: CLI Interface

> PRD: [PRD-088: Ego Channels](README.md)
> Status: Done

## Description

As a developer, I want a `pops ego` CLI command for one-shot questions and piped input so that I can query my knowledge base from the terminal and integrate Cerebrum into shell scripts and workflows.

## Acceptance Criteria

- [x] `pops ego "question text"` sends a one-shot query to the Ego conversation engine, prints the response to stdout, and exits with code 0
- [x] `pops ego` with no arguments and no piped input prints usage help showing available options and examples, then exits with code 1
- [x] Piped input is supported: `cat notes.md | pops ego "summarise this"` — the piped content is prepended to the question as context with a clear delimiter (e.g., `--- Context ---\n{piped content}\n--- Question ---\n{question}`)
- [x] Output format is selectable via `--format` flag: `markdown` (default — renders Markdown with terminal formatting), `json` (structured output: `{ answer, citations, scopes }`), `plain` (strip all Markdown formatting)
- [x] `--scopes` flag accepts comma-separated scope strings to set the active scopes for the query: `pops ego --scopes work.projects.karbon "what's the status?"`
- [x] `--model` flag allows overriding the default LLM model for this query
- [x] Errors print to stderr with a descriptive message and exit with code 1 — errors include: Ego service unavailable, Thalamus timeout, invalid scope format
- [x] Responses include citation references in all formats: Markdown shows `[title](id)` links, JSON includes a `citations` array, plain shows `[title] (id)` inline references

## Notes

- The CLI should be fast — target under 3 seconds for a simple question. This means the CLI should not start a full pops server; it should connect to the running pops API server.
- The `json` format is designed for programmatic consumption — pipe `pops ego --format json "..."` into `jq` for structured data extraction.
- Consider supporting `--no-citations` flag for cases where the user wants a clean answer without reference clutter — not required for initial implementation.
- The CLI reuses the same Ego conversation engine as other channels but does not persist the conversation (one-shot only). If the user wants multi-turn, they should use the shell chat panel.
