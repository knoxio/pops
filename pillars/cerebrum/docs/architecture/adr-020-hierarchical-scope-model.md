# ADR-020: Hierarchical Scope Model for Content Isolation

## Status

Accepted

## Context

Cerebrum stores deeply personal content alongside professional content. A journal entry about therapy, a secret job search, and a work project sprint plan coexist in the same system. The system must see all content to build cross-domain connections and inferences, but outputs (reports, presentations, chat responses) must never leak content across inappropriate boundaries. A weekly work summary must not reference personal journal entries. A personal reflection must not include proprietary work data.

This is not access control (there's one user). It's output scoping — the system knows everything, but speaks appropriately for the audience.

## Options Considered

| Option                    | Pros                                                       | Cons                                                                            |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Flat tags                 | Simple, no hierarchy, easy to query                        | No nesting, no inheritance, can't express "all work" or "all secrets"           |
| Folder-based isolation    | Physical separation, easy to understand                    | Content in only one folder, no cross-categorisation, duplicates for multi-scope |
| Hierarchical dot-notation | Nestable, queryable with prefix matching, multi-assignable | More complex parsing, deeper hierarchies can get unwieldy                       |
| Role-based access control | Industry standard, well-understood                         | Designed for multi-user — overkill for single-user output scoping               |

## Decision

Hierarchical dot-notation scopes as tags on engrams. Each engram has a `scopes` array in its frontmatter. Scopes are dot-separated hierarchical identifiers:

```
personal.journal
personal.secret.therapy
personal.secret.calendar
work.projects.karbon
work.secret.jobsearch
work.secret.crashouts
storage.recipes
storage.media-notes
```

**Key properties:**

- An engram can belong to multiple scopes (`[work.projects.karbon, personal.learning]`)
- Prefix matching enables broad queries: `work.*` matches everything under work
- The `.secret.` segment is a reserved marker — content in any `*.secret.*` scope requires explicit permission to include in outputs
- Scopes are mutable — the system (Glia, Cortex) can add, remove, or reclassify scopes
- Scope assignment uses three mechanisms in priority order: (1) explicit user tagging, (2) rule-based inference from source and content patterns, (3) LLM-based classification as fallback

## Consequences

- Every engram has at least one scope — the ingestion pipeline assigns a default scope if none is provided
- Ego (the chat agent) filters output based on inferred or explicit scope context: if the user says "at work," Ego filters to `work.*`; if the user references personal topics, Ego broadens accordingly
- Any scope containing `.secret.` is hard-blocked from shared outputs (reports, presentations, external documents) unless the user explicitly opts in per output
- Scope rules are defined in `engrams/.config/scope-rules.toml` — pattern-based rules like `source:github → work.*`, `source:moltbot → personal.captures`
- Thalamus indexes scopes in SQLite for fast prefix-match queries (`WHERE scope LIKE 'work.%'`)
- Glia workers respect scope boundaries when consolidating — engrams in different top-level scopes are never merged
- The scope model is not access control — there is no concept of "this user can't see this scope." It's output filtering for a single user who owns everything
