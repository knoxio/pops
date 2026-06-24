# Hero Image — infra exclusion & format/UX extensions

Forward-looking work beyond the shipped hero-image upload feature (see [prds/hero-image-upload](../prds/hero-image-upload/README.md)). The core upload / thumbnail / serve / remove flow is done; these are deferred or out-of-scope items.

## Litestream exclusion (deferred, out-of-tree)

`FOOD_RECIPES_DIR` is regeneratable user content (re-upload reproduces the bytes) and should be excluded from Litestream replication, while the `recipes.hero_image_path` column itself stays replicated. The Litestream config lives in the `knoxio/homelab-infra` repo, not in this tree, so this is an external follow-up. Mirrors the precedent set for `FOOD_INGEST_DIR`.

## Format support

- **HEIC** (iPhone default capture format) — currently rejected. sharp can decode HEIC with the right build; add it so users don't have to convert first.
- **AVIF / GIF** — rejected today; add if a real need appears.

## Upload UX

- **Client-side resize** before upload, to cut wire size and server memory pressure on large images. The server handles resizing today via sharp; revisit only if upload performance becomes a pain point.
- **Image cropping / rotation UI** — users pre-crop today. An in-app cropper would remove that step.

## Larger features

- **Multiple images per recipe (carousel)** — single hero only today.
- **Per-recipe-version hero variations** — the column lives on `recipes` (recipe identity), so heroes are version-independent by design. A per-version variant would need a schema change.
- **AI-generated alt text** — a cerebrum cross-domain enhancement; renderer currently uses the recipe title as alt text.
- **CDN / R2 fronting** — local filesystem serving only today. Front the serve route with a CDN or object store if scale demands.
- **Image search ("find recipes by image")** — out of scope.
