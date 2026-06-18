# US-02: Template System

> PRD: [PRD-077: Engram File Format & Directory Structure](README.md)
> Status: Done

## Description

As a user creating engrams, I want to select from predefined templates (journal, decision, research, meeting, idea, note, capture) so that each engram is created with the appropriate structure, required custom fields, and suggested Markdown sections for its content type.

## Acceptance Criteria

- [x] Template files exist in `engrams/.templates/` as `.md` files with YAML frontmatter defining `name`, `description`, `required_fields`, `suggested_sections`, `default_scopes`, and `custom_fields`
- [x] A `TemplateRegistryService` loads all templates from disk at startup and exposes `list()` and `get(name: string)` methods
- [x] The template frontmatter schema is validated with Zod: `name` (string, required), `description` (string, required), `required_fields` (string array, optional), `suggested_sections` (string array, optional), `default_scopes` (string array, optional), `custom_fields` (record of `{ type: string, description: string }`, optional)
- [x] Creating an engram with a `template` parameter merges the template's `default_scopes` into the engram's scopes, validates that all `required_fields` are provided, and scaffolds the body with `suggested_sections` as `## Heading` blocks
- [x] Creating an engram with a template that does not exist logs a warning and falls back to creating a `capture`-type engram without template scaffolding
- [x] Custom fields defined by the template are validated against their declared types and included in the engram's frontmatter
- [x] The default set of templates is created: `journal`, `decision`, `research`, `meeting`, `idea`, `note`, `capture` (minimal, for unstructured input)
- [x] Template body content supports `{{placeholder}}` markers that are replaced with user-provided values or left as-is for manual completion

## Notes

- Templates are read-only at runtime; users modify them by editing the `.md` files directly on disk.
- The `capture` template should have zero required fields and no suggested sections — it is the bare minimum.
- Template registry should support hot-reloading or at least re-loading on demand for development.
