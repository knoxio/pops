# US-02: Scope Rules Engine

> PRD: [Scope Model](README.md)
> Status: Done

## Description

As a system, I need a rule engine that reads `scope-rules.toml` and automatically assigns scopes to engrams based on their source, type, and tags so that new content receives appropriate scopes without requiring manual classification for every engram.

## Acceptance Criteria

- [x] The rule engine parses `engrams/.config/scope-rules.toml` and validates each rule's structure: `match` conditions (any combination of `source`, `type`, `tags`), `assign` array (validated against the scope schema from US-01), and `priority` number
- [x] A `resolveScopes` function accepts an engram's metadata (source, type, tags, explicit scopes) and returns the final scopes array — explicit scopes take precedence, then matching rules add their scopes, then fallback applies if the result is empty
- [x] All matching rules are applied additively — if both `source:github` and `type:meeting` match, both rules' scopes are assigned
- [x] When no rules match and no explicit scopes are provided, the `defaults.fallback_scope` from the config is assigned
- [x] The `assign` values in rules are validated against the scope schema at config load time — invalid scopes in the config cause a logged warning and the rule is skipped
- [x] The rule engine handles a missing or malformed `scope-rules.toml` gracefully: logs a warning and falls back to `personal.captures` as the default scope
- [x] Rules are evaluated in priority order (highest first) but all matching rules contribute scopes — priority is used to resolve contradictions when documented in the config
- [x] The rule engine is a pure function with no side effects — it receives metadata and the parsed config, and returns scopes. Config loading is a separate concern

## Notes

The rule engine does not write scopes to engrams — that is the CRUD service's responsibility (PRD-077, US-05). This module provides the `resolveScopes` function that the CRUD service calls during engram creation. TOML parsing can use a library like `@iarna/toml` or `smol-toml`. Tag matching in rules uses set intersection — if the rule specifies `tags = ["therapy"]`, the engram must have at least the tag `therapy` (it may have others).
