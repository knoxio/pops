# US-10: Entity selection dropdown

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to select an entity from a dropdown on uncertain/failed transactions so that I can manually assign the correct merchant.

## Acceptance Criteria

- [ ] Searchable dropdown showing all entities from `core.entities.list`
- [ ] Appears on uncertain and failed transaction cards
- [ ] Selecting an entity moves the transaction to the matched list
- [ ] If AI suggested an entity, show "Accept" shortcut button alongside the dropdown
- [ ] Dropdown shows entity name + type badge
- [ ] "Create Entity" option at bottom of dropdown (links to US-12)

## Notes

Entity list is fetched once and cached for the review step. The dropdown should be fast even with 900+ entities — use virtualization or search filtering.
