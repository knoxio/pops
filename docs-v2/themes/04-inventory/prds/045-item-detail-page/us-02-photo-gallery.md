# US-02: Photo gallery

> PRD: [045 — Item Detail Page](README.md)
> Status: To Review

## Description

As a user, I want a photo gallery on the item detail page with a large primary image, thumbnail strip, and lightbox view so that I can see all photos of an item clearly.

## Acceptance Criteria

- [ ] Primary photo area displays the first photo (by sortOrder) at a large size
- [ ] Thumbnail strip below the primary photo shows all item photos
- [ ] Clicking a thumbnail swaps it into the primary display
- [ ] Active thumbnail has a visual indicator (border, highlight)
- [ ] Clicking the primary photo opens a full-screen lightbox/overlay
- [ ] Lightbox supports navigation between photos (previous/next)
- [ ] Lightbox can be closed with an X button, Escape key, or clicking outside the image
- [ ] When an item has no photos, a placeholder graphic renders (generic inventory icon)
- [ ] When an item has exactly one photo, the primary photo renders without a thumbnail strip
- [ ] Photos are loaded from `inventory.photos.listForItem` sorted by sortOrder ASC
- [ ] Photo images load from the inventory images directory path
- [ ] Tests cover: primary photo display, thumbnail click swap, lightbox open/close/navigation, placeholder for no photos, single photo without thumbnail strip

## Notes

The lightbox can use a shared overlay component from `@pops/ui` if one exists, or a purpose-built component. Photo URLs are constructed from the filename returned by the API and the inventory images base path. Consider lazy-loading thumbnails if there are many photos per item.
