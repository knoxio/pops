# US-02: Context injection into AI prompts

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As a developer, I want the current app context injected into AI prompts so that the assistant knows what the user is looking at.

## Acceptance Criteria

- [ ] Reads context from PRD-058's contextual intelligence system
- [ ] Prompt includes: current app, current page, current entity/item if applicable
- [ ] "What's this?" while viewing a movie detail page knows which movie
- [ ] Context updates when user navigates — assistant stays relevant

## Notes

Depends on PRD-058 (Contextual Intelligence) being implemented. The context is injected as system prompt context, not as user input.
