# US-03: Source Management UI

> PRD: [Rotation UI](README.md)

## Description

As a user, I want to add, edit, and remove rotation sources so that I control where candidate movies come from and their relative priority.

## Acceptance Criteria

- [x] Source list page shows all configured sources: name, type icon, priority (visual bar or number), enabled toggle, last synced timestamp, candidate count
- [x] "Add Source" button opens a create modal with: type selector (dropdown), name input, priority slider (1-10), type-specific config fields, sync interval input
- [x] Type-specific config fields render dynamically based on selected type (see PRD-072 table)
- [x] Edit modal pre-fills existing values; allows changing name, priority, config, enabled, interval
- [x] Delete source shows confirmation dialog warning that its candidates will also be removed
- [x] "Sync Now" button per source triggers immediate sync with loading indicator
- [x] The `manual` source appears in the list but cannot be deleted or have its type changed
- [x] Sources can be reordered by dragging (updates priority values) or priority can be set numerically

## Notes

The Plex friends picker (for `plex_friends` type) should query available friends from the Plex API and present them in a dropdown rather than requiring manual username entry.
