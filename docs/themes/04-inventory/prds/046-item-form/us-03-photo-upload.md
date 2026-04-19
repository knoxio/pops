# US-03: Photo upload

> PRD: [046 — Item Create/Edit Form](README.md)
> Status: Done

## Description

As a user, I want to upload photos of my inventory items with drag-and-drop on desktop and camera capture on mobile, with automatic compression, so that items have visual records without consuming excessive storage.

## Acceptance Criteria

- [x] Desktop: drag-and-drop zone accepts image files; visual feedback on drag-over (border highlight)
- [x] Desktop: file picker button as alternative to drag-and-drop
- [x] Mobile: file input with `accept="image/*" capture="environment"` triggers camera
- [x] Accepted file types: JPEG, PNG, HEIC/HEIF, WebP
- [x] On file selection, image is compressed client-side before upload: resize to fit within 1920x1920px bounding box (preserve aspect ratio), convert HEIC/HEIF to JPEG, strip EXIF metadata — via `useImageProcessor` hook using `browser-image-compression` and `heic2any`
- [x] Upload calls `inventory.photos.upload` with the compressed image
- [x] Upload progress indicator shows during transmission
- [x] Uploaded photos appear as thumbnails in a grid below the upload zone
- [x] In edit mode, existing photos are loaded from `inventory.photos.listForItem` and displayed in the thumbnail grid
- [x] Photos can be reordered via drag in the thumbnail grid; new order is saved via `inventory.photos.reorder`
- [x] Each photo thumbnail has a delete button; clicking it shows a confirmation prompt, then calls `inventory.photos.delete`
- [x] Failed uploads show an error toast; the photo is not added to the grid
- [x] Multiple files can be uploaded at once (batch selection)
- [x] Tests cover: drag-and-drop file acceptance, file picker selection, HEIC→JPEG conversion, image resize to 1920px max, EXIF stripping, upload progress display, thumbnail grid rendering, photo reorder, photo delete with confirmation, batch upload, error handling

## Notes

Client-side compression can use a library like browser-image-compression or sharp (via WASM). HEIC support varies by browser — the compression step should handle conversion gracefully and fall back to the original format if conversion fails. EXIF stripping is important for privacy (removes GPS coordinates, camera model, etc.). The upload zone should be clearly distinct from the rest of the form to avoid accidental drops.
