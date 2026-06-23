# Hero Image Upload

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)
>
> Status: **Done.** Upload, removal, thumbnail generation, binary serving, and the edit-page uploader UI are all shipped. The only deferred item — excluding `FOOD_RECIPES_DIR` from Litestream replication — lives in an out-of-tree infra repo and is tracked in [ideas/hero-image-infra-and-formats.md](../../ideas/hero-image-infra-and-formats.md).

Upload, store, thumbnail, and serve a single hero image per recipe, backing the `recipes.hero_image_path` column. One image per recipe (no carousel). The image lives on the recipe identity (`recipes`, not `recipe_versions`) so swapping a hero never bumps a version.

## Data Model

`recipes.hero_image_path` (`text`, nullable) holds the relative path of the original upload: `<recipeId>/hero.<ext>`. Thumbnails are derived on disk; no column tracks them.

## Filesystem Layout

Images live under `FOOD_RECIPES_DIR` (default `./data/food/recipes`, resolved to absolute), one subdirectory per recipe id:

```
${FOOD_RECIPES_DIR}/<recipeId>/
  hero.<ext>          original upload (jpg|jpeg|png|webp; ext preserved)
  hero-thumb.webp     320px wide; webp q80
  hero-card.webp      640px wide; webp q85
```

Per-recipe subdirectories keep eviction trivial: a hard-deleted recipe is `rm -rf <dir>`. Path helpers exist twice — browser-safe versions (constants, URL builder, validators) in `pillars/food/app/src/storage/hero-paths.ts`, and Node-side absolute-path resolution in `pillars/food/src/api/modules/hero-image/paths.ts`. The default dir is hard-coded in both so missing config never crashes.

## REST API Surface

ts-rest contract `foodHeroImageContract` (`pillars/food/src/contract/rest-hero-image.ts`), mounted under the food pillar prefix:

| Method + path                                   | Body                                                                   | Response                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /api/food/recipes/:recipeId/hero-image`   | `{ mimeType: 'image/jpeg'\|'image/png'\|'image/webp', contentBase64 }` | `{ data: { heroImagePath, sizeBytes, width, height }, message }` |
| `DELETE /api/food/recipes/:recipeId/hero-image` | optional `{}`                                                          | `{ ok: true, message }`                                          |

Binary serving is a plain Express route (streams a file, not JSON), registered **before** the ts-rest endpoints so it never shadows `GET /recipes/:slug`:

- `GET /api/food/recipes/:recipeId/:filename` — streams `hero.<ext>` / `hero-thumb.webp` / `hero-card.webp`. Falls through (`next()`) for any non-numeric id or unrecognised filename; 404s a known-but-missing file. Sets `Cache-Control: private, max-age=3600`.

The base64-in-JSON wire format mirrors the inventory-photo pattern; sharp runs server-side only (the browser bundle can't carry it).

## Business Rules

- One hero per recipe. Replacement is destructive: a different extension removes the stale original (`removeStaleOriginals`); same extension overwrites in place.
- `hero_image_path` stores the relative path; the absolute path is computed at read time from `FOOD_RECIPES_DIR`.
- Allowed mime types: JPEG, PNG, WebP. Others (HEIC, AVIF, GIF) are rejected with a validation error.
- Size cap defaults to 8 MB, configurable via `FOOD_HERO_MAX_BYTES`. Oversize uploads are rejected before any disk write.
- Original is written atomically (`.tmp` + rename). Thumbnails are then generated; if sharp fails the original is kept, a warning is logged, and the upload still succeeds — the renderer falls back to the original.
- Thumbnails strip EXIF (sharp's default on output); `.rotate()` bakes EXIF orientation in first. Originals retain EXIF.
- The renderer builds URLs from `hero_image_path` via `heroImageUrl(path, variant)`: `original` serves `hero.<ext>`, `thumb` → `hero-thumb.webp`, `card` → `hero-card.webp`. `RecipeRenderer` derives the thumb path and falls back to a placeholder icon on `<img onError>`.
- Hard-deleting a recipe is a service responsibility (`rm -rf <recipeId>/`), not a schema cascade.

## Edge Cases

| Case                                                        | Behaviour                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Upload > cap                                                | Rejected pre-decode (`ValidationError`).                                                      |
| Empty upload                                                | Rejected (`ValidationError`).                                                                 |
| Unsupported mime (HEIC/AVIF/GIF)                            | Rejected (`ValidationError`).                                                                 |
| Undecodable / corrupted bytes                               | sharp metadata probe fails → `ValidationError`; nothing written.                              |
| Unknown recipe id                                           | `NotFoundError` (404); checked after image probe, before any write.                           |
| Thumbnail generation fails                                  | Original kept, warning logged, upload succeeds; renderer falls back to original.              |
| Concurrent uploads to same recipe                           | Atomic per file; DB column is last-wins.                                                      |
| `hero_image_path` set but file missing                      | Serve route 404s; `<img onError>` swaps to placeholder.                                       |
| Path traversal (`..`, `/`, `\` in filename; non-integer id) | Rejected by `isValidHeroFilename` + integer validation + `resolveServablePath` sandbox check. |

## Acceptance Criteria

### Storage & config

- [x] `FOOD_RECIPES_DIR` resolves from env with a hard-coded `./data/food/recipes` default in both Node and browser path modules; empty string falls back to default.
- [x] `FOOD_HERO_MAX_BYTES` read per-call; invalid/non-positive values fall back to 8 MB.
- [x] Path-traversal guard integer-validates `recipeId` and sandbox-checks the resolved absolute path against the root.

### Upload (`POST …/hero-image`)

- [x] Validates size + mimeType, probes dimensions, verifies recipe exists, writes the original atomically, generates both thumbnails, updates `recipes.hero_image_path`.
- [x] Stale original with a different extension is removed on replacement.
- [x] Returns `{ heroImagePath, sizeBytes, width, height }`.
- [x] Unknown recipe → 404; undecodable bytes → 400.

### Thumbnails

- [x] Written as WebP at 320px (q80) and 640px (q85) wide, preserving aspect ratio.
- [x] EXIF stripped; orientation baked in via `.rotate()`.
- [x] sharp failure keeps the original and logs a warning; upload still succeeds.

### Serving (`GET …/:filename`)

- [x] Streams `hero.<ext>`, `hero-thumb.webp`, and `hero-card.webp` with correct content type and a private cache header.
- [x] Non-hero paths fall through to the ts-rest recipe routes; missing file → 404.
- [x] Path-traversal / invalid id rejected.

### Remove (`DELETE …/hero-image`)

- [x] Deletes all `hero.*` / `hero-*` files for the recipe and clears `hero_image_path` (tolerates missing files).

### UI

- [x] `HeroImageUploader` (`pillars/food/app/src/components/HeroImageUploader.tsx`) shows the current hero with Replace/Remove when a path is set, or a drag-drop + file-picker drop-zone when null.
- [x] Client-side mime + size validation; reads the file as base64 and calls the upload mutation; progress reflected via pending state.
- [x] Success/error surface as toasts; `onUploaded` / `onRemoved` callbacks notify the parent.
- [x] Mounted in `RecipeEditPage`, which wires `onUploaded` / `onRemoved` to a `refreshHero` handler that invalidates the `['food', 'recipes', 'getForRendering']` and `['food', 'recipes', 'list']` React Query keys so the edit shell sees the new path immediately.

### Tests

- [x] API integration suite (`pillars/food/src/api/__tests__/hero-image.test.ts`): upload → serve binary → remove, unknown-recipe 404, undecodable-bytes 400, non-hero path fall-through.
- [x] Path-helper unit tests (`pillars/food/app/src/storage/__tests__/hero-paths.test.ts`).
- [x] Component test + Storybook story for `HeroImageUploader`.

## Out of Scope

See [ideas/hero-image-infra-and-formats.md](../../ideas/hero-image-infra-and-formats.md) for forward-looking work: Litestream exclusion config, HEIC/AVIF support, client-side resize, image cropping/rotation UI, AI alt text, CDN/R2 fronting, multiple images per recipe, and per-version hero variations.
