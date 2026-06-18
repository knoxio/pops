# PRD-124: Hero Image Upload

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

## Overview

Implement the upload, storage, thumbnail generation, and retrieval flow for `recipes.hero_image_path`. PRD-107 declared the column; this PRD defines what goes into it, where the bytes live, how thumbnails are produced, and how the renderer (PRD-121) reads them. Reuses the existing `MEDIA_IMAGES_DIR` storage pattern from the media theme — same shape, different directory.

Hero images are a single image per recipe (no carousel). The image lives on the recipe identity (PRD-107: column on `recipes`, not `recipe_versions`) so swapping a hero doesn't bump version.

## Filesystem Layout

All recipe images live under `${FOOD_RECIPES_DIR}` (default: `./data/food/recipes/`), one subdirectory per recipe id:

```
${FOOD_RECIPES_DIR}/
  <recipe_id>/
    hero.<ext>                 # original upload (jpg|png|webp; ext preserved)
    hero-thumb.webp            # 320px wide thumbnail; webp for size
    hero-card.webp             # 640px wide; for list cards
```

`recipes.hero_image_path` stores the relative path `<recipe_id>/hero.<ext>` (the original filename, not the thumbnails — thumbnails are derived). Renderer reads the original for `variant='detail'` and the thumbnail for `variant='compact'`. Card-size for the list view.

Why per-recipe subdirectories: simplifies eviction when a recipe is hard-deleted (just rm -rf the dir).

## Configuration

Add to `apps/pops-api/.env.example`:

```
# Food recipe images directory. Hero + thumbnails per recipe.
# NOT backed up by Litestream (regeneratable from re-upload).
FOOD_RECIPES_DIR=./data/food/recipes
```

Default hard-coded in the env loader so missing config doesn't crash.

Excluded from Litestream replication (same rationale as PRD-110's `FOOD_INGEST_DIR`: regeneratable user content, not personal data of record). The `recipes.hero_image_path` column IS backed up via Litestream — re-uploading an image regenerates the bytes but the link persists.

## Upload API

```ts
// apps/pops-api/src/modules/food/router.ts (extended)
export const heroImageRouter = {
  upload: mutation({
    input: {
      recipeId: number,
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
      // The body is a base64-encoded image. We use a base64 wire format for tRPC simplicity;
      // future PRD could switch to multipart if files get larger.
      contentBase64: string,
    },
    output: {
      heroImagePath: string, // relative path
      sizeBytes: number,
      width: number,
      height: number,
    },
  }),

  remove: mutation({
    input: { recipeId: number },
    output: { ok: true },
  }),
};
```

`upload` flow:

1. Validate `recipeId` exists; user has write access (single-user, always true).
2. Validate `mimeType` is allowed; validate `contentBase64` size ≤ `FOOD_HERO_MAX_BYTES` (default 8 MB).
3. Decode base64 → buffer.
4. Validate image: read header bytes; reject if not a valid JPEG/PNG/WebP.
5. Determine extension from mimeType.
6. Ensure `${FOOD_RECIPES_DIR}/<recipeId>/` exists.
7. Write original to `<recipeId>/hero.<ext>` (atomic: write to `.tmp` then rename).
8. Generate thumbnails (see below) and write to `<recipeId>/hero-thumb.webp` and `<recipeId>/hero-card.webp`.
9. UPDATE `recipes SET hero_image_path = '<recipeId>/hero.<ext>'`. Old hero file (if any with different ext) is removed in the same operation.
10. Return path + dimensions.

`remove` flow:

1. Validate recipeId.
2. Delete `<recipeId>/hero.*` and `<recipeId>/hero-thumb.webp`, `<recipeId>/hero-card.webp`.
3. UPDATE `recipes SET hero_image_path = NULL`.

## Thumbnail Generation

Use `sharp` (already a dep transitively via the media module if present; otherwise add):

- `hero-thumb.webp`: resize to 320px wide (auto height preserving aspect), webp quality 80.
- `hero-card.webp`: resize to 640px wide, webp quality 85.
- Strip EXIF metadata (privacy).
- Preserve orientation (sharp auto-rotates based on EXIF).

If thumbnail generation fails (corrupted image, sharp error), the original is kept and thumbnails are absent — the renderer falls back to the original. Upload still considered successful with a warning logged.

## Serving Images

Existing pattern from `MEDIA_IMAGES_DIR`: the API exposes an authenticated static-file endpoint (`GET /api/food/recipes/<recipeId>/hero(-thumb|-card)?.<ext>`) that reads from `FOOD_RECIPES_DIR` and streams the file. Path-traversal guarded (reject `..` in the recipeId segment; integer-validate the id).

Renderer (PRD-121) constructs URLs from `recipes.hero_image_path`:

- Original: `/api/food/recipes/<path>` where `<path>` = `recipes.hero_image_path`.
- Thumbnail: derive by replacing `hero.<ext>` with `hero-thumb.webp` (path-based; no DB column for thumb).
- Card: same with `hero-card.webp`.

If a thumbnail URL 404s (generation failed), `<img onError>` falls back to the original URL.

## Upload UI

PRD-119's recipe edit page hosts the upload affordance. PRD-124 specifies the component:

```tsx
// packages/app-food/src/components/HeroImageUploader.tsx
export type HeroImageUploaderProps = {
  recipeId: number;
  currentPath: string | null; // existing hero_image_path
  onUploaded: (path: string) => void;
  onRemoved: () => void;
};

export function HeroImageUploader(props: HeroImageUploaderProps): JSX.Element;
```

UI:

- If `currentPath` set: shows the current hero (full-size in a panel) with "Replace" and "Remove" buttons.
- If null: shows a drop-zone with "Upload hero image" CTA. Accepts drag-drop or file picker.
- On select: client-side validates the file (mime + size), reads as base64, calls `food.heroImage.upload`.
- Progress indicator during upload.
- On success: calls `onUploaded`; image preview updates.
- On error: surfaces the error to a toast.

No client-side resizing in v1; the server handles it via sharp. If we hit performance pain with large uploads, add client-side resize as a future enhancement.

## Business Rules

- One hero image per recipe. Replacement is destructive (old file removed when new uploaded with different ext); same ext means file overwrite.
- `hero_image_path` stores the relative path; the absolute path is computed at read time from `FOOD_RECIPES_DIR`.
- Thumbnails are derived; no DB column tracks them. If they don't exist on disk, the renderer falls back. Re-running upload regenerates them.
- The `FOOD_RECIPES_DIR` directory is excluded from Litestream replication (regeneratable). The `hero_image_path` column IS replicated.
- Image size hard cap is 8 MB on upload (configurable via `FOOD_HERO_MAX_BYTES`). Above this, the upload is rejected pre-decode to avoid memory pressure.
- Allowed mime types: JPEG, PNG, WebP. Rejects HEIC, AVIF, GIF, and others in v1 — adds noise for marginal benefit. Browser uploaders rarely produce these for our use case.
- EXIF stripped on thumbnail generation. Originals keep EXIF (for archival); thumbnails are clean.
- Hard-deleting a recipe (rare; archive is normal) also `rm -rf <FOOD_RECIPES_DIR>/<recipeId>/`. Service responsibility, not schema-level cascade.

## Edge Cases

| Case                                                           | Behaviour                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Upload an 8.1 MB file                                          | Reject pre-decode with `FileTooLarge`. User sees toast.                                                  |
| Upload an HEIC (iPhone default format)                         | Reject with `UnsupportedMimeType`. Suggestion to convert. Future PRD may add HEIC support via sharp.     |
| Upload a corrupted JPEG                                        | sharp fails to read header → reject with `InvalidImage`. Nothing written.                                |
| Upload succeeds but thumbnail generation fails                 | Original is kept; warning logged; renderer falls back to original. No user-visible error.                |
| Two simultaneous uploads to the same recipe                    | Filesystem write is atomic per file; DB UPDATE is per-recipe — last wins. Rare in single-user.           |
| Concurrent upload and `recipes.archived` action                | Last write wins; both ops are tiny transactions.                                                         |
| Hero file exists on disk but `hero_image_path` is null (drift) | Renderer shows placeholder; orphan file persists until next eviction. No automatic cleanup in v1.        |
| `hero_image_path` set but file missing                         | `<img onError>` swaps to placeholder. UI may surface "Image missing — re-upload?" badge.                 |
| Disk full mid-upload                                           | Write fails; `ENOSPC` surfaced as `UploadFailed` error. DB not updated. Cleanup the partial `.tmp` file. |
| Recipe deleted while upload in flight                          | DB UPDATE fails (FK violation since recipe row gone); partial files orphan; UI surfaces error.           |
| Path traversal attempt: `recipeId = "../../etc/passwd"`        | Integer-only validation on `recipeId` rejects upfront. Endpoint guard double-checks.                     |

## Acceptance Criteria

Inline per theme protocol.

### Storage layout & config

- [x] `FOOD_RECIPES_DIR` added to `apps/pops-api/.env.example` with default + "not backed up" comment.
- [x] Env loader has a hard-coded default `./data/food/recipes`.
- [ ] Litestream config in `infra/` excludes `${FOOD_RECIPES_DIR}`. — _Litestream config lives in `knoxio/homelab-infra` (out-of-tree); this AC is unblocked but the external follow-up is queued, matching the precedent set by PRD-110's `FOOD_INGEST_DIR`._

### Filesystem helpers

- [x] `packages/app-food/src/storage/hero-paths.ts` exports `heroPathFor(recipeId, ext)`, `thumbPathFor(recipeId)`, `cardPathFor(recipeId)` returning absolute paths.
- [x] Path-traversal guard helper that integer-validates `recipeId`.

### Upload

- [x] `food.heroImage.upload` tRPC mutation accepts base64 image, validates size + mimeType, writes the original atomically, generates thumbnails, updates `recipes.hero_image_path`.
- [x] Old hero file with different ext is deleted on replacement.
- [x] Returns image dimensions in the response.
- [x] Vitest integration test: upload a 500x500 PNG, assert files exist on disk, assert `hero_image_path` is updated.

### Thumbnails

- [x] Thumbnails written as WebP at 320px and 640px wide.
- [x] EXIF stripped from thumbnails.
- [x] Vitest test: upload a JPEG with EXIF, assert thumbnail has no EXIF block.
- [x] Vitest test: simulate sharp failure, assert original is kept and warning logged.

### Serving

- [x] `GET /api/food/recipes/<recipeId>/hero.<ext>` streams the file.
- [x] `GET /api/food/recipes/<recipeId>/hero-thumb.webp` streams the thumbnail.
- [x] `GET /api/food/recipes/<recipeId>/hero-card.webp` streams the card-size.
- [x] Path-traversal attempts rejected with 400.
- [x] Missing file → 404 (renderer's `onError` falls back).

### UI component

- [x] `packages/app-food/src/components/HeroImageUploader.tsx` exports `HeroImageUploader`.
- [x] Drop-zone accepts drag-drop + file picker.
- [x] Replace and Remove buttons work.
- [x] Progress indicator during upload.
- [x] Mobile-friendly tap targets (44px min).
- [x] PRD-119's edit page mounts this component. Mounted in `RecipeEditShell` between the auto-created banner and the DSL editor. Upload and remove callbacks invalidate `food.recipes.getForRendering` (keyed on slug + versionNo) and `food.recipes.list` so the edit shell sees the new `heroImagePath` immediately. The original wording said "side panel"; the implemented layout is an inline column section because PRD-119's recipe edit page is a stacked layout rather than a split pane.

### Remove

- [x] `food.heroImage.remove` mutation deletes files + clears `hero_image_path`.

### Tests

- [x] Vitest integration suite at `apps/pops-api/src/modules/food/__tests__/hero-image-router.test.ts` covers upload happy path, oversize rejection, mime rejection, corrupted-image rejection, thumbnail-failure fallback, replace flow, remove flow.
- [x] Vitest + RTL suite for `HeroImageUploader.tsx` covers UI states with mocked tRPC.
- [x] Storybook story for the uploader component.

## Out of Scope

- Multiple images per recipe (carousel) — single hero only in v1.
- Image cropping / rotation UI — out of scope; user pre-crops.
- HEIC / AVIF support — future.
- Client-side resize before upload — future enhancement if perf becomes an issue.
- Hero image variations per recipe version — the column lives on `recipes` (PRD-107 decision).
- AI-generated alt text — future cerebrum cross-domain enhancement.
- CDN integration / R2 fronting — local filesystem only in v1.
- Image search / "find recipes by image" — out of scope.
