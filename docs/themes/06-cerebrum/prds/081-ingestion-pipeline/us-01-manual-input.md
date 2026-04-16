# US-01: Manual Input via Shell Form

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Not started

## Description

As a user in the pops shell, I want to create engrams through an interactive form with a type selector, template-driven fields, a body editor, a scope picker, and tag input so that I can capture structured knowledge with minimal friction and full control over classification.

## Acceptance Criteria

- [ ] A `cerebrum ingest` command in the pops shell opens an interactive form
- [ ] The form presents a type selector listing all available templates from the template registry (PRD-077) plus a freeform `capture` option
- [ ] Selecting a type with an associated template populates template-specific fields (e.g., `decision` shows `alternatives`, `confidence`; `journal` shows `mood`) with appropriate input widgets
- [ ] The body editor accepts multi-line Markdown input — the shell uses the configured `$EDITOR` for body editing if the body exceeds a configurable line threshold (default 5 lines)
- [ ] A scope picker presents known scopes from the index (via `cerebrum.scopes.list`) with prefix-based autocomplete and allows manual entry of new scopes
- [ ] Tag input supports comma-separated freeform tags with autocomplete from existing tags in the index
- [ ] If the user provides no explicit scopes, the form runs scope inference (rule-based + LLM) and presents the inferred scopes for confirmation before submission
- [ ] Submitting the form calls `cerebrum.ingest.submit` and displays the created engram's ID, file path, and classified type

## Notes

- The form should be built using the existing pops shell form framework (ink-based TUI components).
- Template-specific fields should be dynamically rendered based on the selected template's `custom_fields` definition — no hardcoding of template-specific logic.
- The scope picker should show scope hierarchy visually (indentation or tree-like display) to help the user understand scope nesting.
- If `$EDITOR` is not set, fall back to an inline multi-line text input.
