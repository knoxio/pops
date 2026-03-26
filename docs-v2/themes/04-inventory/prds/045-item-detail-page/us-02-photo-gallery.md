# US-02: Photo gallery

> PRD: [045 — Item Detail Page](README.md)
> Status: Partial

## Description

As a user, I want a photo gallery on the item detail page with a large primary image, thumbnail strip, and lightbox view so that I can see all photos of an item clearly.

## Acceptance Criteria

- [ ] Primary photo area displays the first photo (by sortOrder) at a large size — PhotoGallery has no primary display area
- [ ] Thumbnail strip below the primary photo shows all item photos — thumbnail grid exists but not integrated into ItemDetailPage
- [ ] Clicking a thumbnail swaps it into the primary display — no active state or swap behaviour
- [ ] Active thumbnail has a visual indicator (border, highlight) — not implemented
- [ ] Clicking the primary photo opens a full-screen lightbox/overlay — not implemented
- [ ] Lightbox supports navigation between photos (previous/next) — not implemented
- [ ] Lightbox can be closed with an X button, Escape key, or clicking outside the image — not implemented
- [ ] When an item has no photos, a placeholder graphic renders (generic inventory icon) — not implemented
- [ ] When an item has exactly one photo, the primary photo renders without a thumbnail strip — not implemented
- [x] Photos are loaded from `inventory.photos.listForItem` sorted by sortOrder ASC
- [x] Photo images load from the inventory images directory path
- [ ] Tests cover: primary photo display, thumbnail click swap, lightbox open/close/navigation, placeholder for no photos, single photo without thumbnail strip — no tests

## Notes

The lightbox can use a shared overlay component from `@pops/ui` if one exists, or a purpose-built component. Photo URLs are constructed from the filename returned by the API and the inventory images base path. Consider lazy-loading thumbnails if there are many photos per item.
