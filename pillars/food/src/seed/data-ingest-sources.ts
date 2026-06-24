/**
 * ingest_sources fixtures.
 *
 * Two rows, one per realistic ingest path the inbox inspector has to render:
 *
 *   1. `url-instagram` — Reel scrape with caption + transcript + keyframes +
 *      video. Mirrors the auth-OK happy path; gives the inspector's
 *      provenance pane every column to display.
 *   2. `url-web` — JSON-LD scrape; no transcript/video, no caption, just
 *      `extracted_json`. Exercises the inspector's "minimal provenance"
 *      branch and confirms the route handlers for `/screenshot` and `/video`
 *      gracefully degrade when those columns are null.
 *
 * Both rows are linked to a seeded draft recipe so the
 * `recipe_versions.source_id IS NOT NULL` scope picks them up. The
 * `draftRecipeId` FK is filled by a second pass (`linkIngestSourcesToDrafts`)
 * after `step-recipes` runs — at insert time the recipe rows don't exist yet.
 *
 * Path columns store the bare filename in the fixture; `step-ingest-sources`
 * patches them post-insert into the `<source_id>/<filename>` layout
 * (e.g. `42/video.mp4`) using the auto-increment id. The absolute path is
 * computed by `ingestDirFor(sourceId)` at read time. The seed does NOT
 * create the files on disk — fixtures cover row shape only; the worker owns
 * file lifecycle.
 */

import type { IngestSourceKind } from '../db/schema.js';

export interface IngestSourceFixture {
  /** Recipe slug the row drafts; used to wire `source_id` + `draft_recipe_id`. */
  recipeSlug: string;
  kind: IngestSourceKind;
  url: string | null;
  caption: string | null;
  /** Paths are stored relative to FOOD_INGEST_DIR. */
  transcriptPath: string | null;
  keyframesDir: string | null;
  videoPath: string | null;
  extractedJson: string | null;
  extractorVersion: string;
}

const INSTAGRAM_EXTRACTED = JSON.stringify({
  source: 'instagram-reel',
  title: 'Smash burger',
  servings: 4,
  ingredients: [
    { name: 'beef mince', qty: 600, unit: 'g' },
    { name: 'salt', qty: 4, unit: 'g' },
    { name: 'cheddar cheese', qty: 80, unit: 'g' },
  ],
  steps: [
    'Form 4 balls, season heavily.',
    'Smash on a screaming-hot pan.',
    'Cheese on, bun on, serve.',
  ],
});

const WEB_EXTRACTED = JSON.stringify({
  source: 'jsonld',
  '@type': 'Recipe',
  name: 'Weeknight pasta',
  recipeYield: '4 servings',
  recipeIngredient: [
    '400 g plain flour',
    '4 cloves garlic',
    '800 g canned whole tomatoes',
    '30 ml extra-virgin olive oil',
  ],
  recipeInstructions: [
    'Boil pasta in salted water.',
    'Simmer crushed tomatoes with garlic and oil.',
    'Toss together, garnish with parsley and parmesan.',
  ],
});

export const INGEST_SOURCE_FIXTURES: readonly IngestSourceFixture[] = [
  {
    recipeSlug: 'smash-burger',
    kind: 'url-instagram',
    url: 'https://www.instagram.com/reel/seed-fixture-smash-burger',
    caption: 'Smash-style cheeseburger — cast-iron pan, simple toppings.',
    transcriptPath: 'transcript.txt',
    keyframesDir: 'keyframes',
    videoPath: 'video.mp4',
    extractedJson: INSTAGRAM_EXTRACTED,
    extractorVersion: 'food-ingest@2026.06.01',
  },
  {
    recipeSlug: 'weeknight-pasta',
    kind: 'url-web',
    url: 'https://example.test/recipes/weeknight-pasta',
    caption: null,
    transcriptPath: null,
    keyframesDir: null,
    videoPath: null,
    extractedJson: WEB_EXTRACTED,
    extractorVersion: 'food-ingest-web@2026.06.01',
  },
];
