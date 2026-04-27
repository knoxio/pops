# US-01: Manual Input via Shell Form

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Partial

## Description

As a user in the pops shell, I want to create engrams through an interactive form with a type selector, template-driven fields, a body editor, a scope picker, and tag input so that I can capture structured knowledge with minimal friction and full control over classification.

## Acceptance Criteria

- [x] The `/cerebrum` route in the pops shell opens an interactive ingest form
- [x] The form presents a type selector listing all available templates from the template registry (PRD-077) plus a freeform `capture` option
- [x] Selecting a type with an associated template populates template-specific fields (e.g., `decision` shows `alternatives`, `confidence`; `journal` shows `mood`) with appropriate input widgets
- [x] The body editor accepts multi-line Markdown input via a textarea
- [x] A scope picker presents known scopes from the index (via `cerebrum.scopes.list`) with prefix-based autocomplete and allows manual entry of new scopes
- [x] Tag input supports comma-separated freeform tags
- [x] If the user provides no explicit scopes, the form runs scope inference (rule-based + LLM) and presents the inferred scopes for confirmation before submission
- [x] Submitting the form calls `cerebrum.ingest.submit` and displays the created engram's ID, file path, and classified type
- [ ] Tag autocomplete from existing tags in the index (deferred — requires a tags list endpoint)

## Notes

- The form is built as a React page in the `@pops/app-cerebrum` package, mounted at `/cerebrum` in the shell.
- Template-specific fields are dynamically rendered based on the selected template's `custom_fields` definition — no hardcoding of template-specific logic.
- The scope picker shows known scopes with prefix-based autocomplete and allows manual entry. Hierarchy display is deferred.
- Tag autocomplete from existing tags requires a `tags.list` endpoint — deferred to a follow-up.
