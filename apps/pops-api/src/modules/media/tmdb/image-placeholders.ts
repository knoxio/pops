import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const IMAGE_FILENAMES = {
  poster: 'poster.jpg',
} as const;

function seasonFilename(seasonNumber: number): string {
  return `season_${seasonNumber}.jpg`;
}

function escapeForSvg(label: string): string {
  return label
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Write an SVG placeholder to destPath unless the file already exists. */
export async function writePlaceholderSvg(
  destPath: string,
  label: string,
  seed: number
): Promise<void> {
  if (await fileExists(destPath)) return;

  const hue = (seed * 137) % 360;
  const escapedLabel = escapeForSvg(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="1170" viewBox="0 0 780 1170">
  <rect width="780" height="1170" fill="hsl(${hue}, 40%, 30%)" />
  <text x="390" y="585" text-anchor="middle" dominant-baseline="central"
    font-family="system-ui, sans-serif" font-size="48" font-weight="bold"
    fill="white" opacity="0.9">
    <tspan>${escapedLabel}</tspan>
  </text>
</svg>`;
  await writeFile(destPath, svg, 'utf-8');
}

export async function generateMoviePlaceholder(
  movieDir: string,
  tmdbId: number,
  title: string
): Promise<void> {
  await mkdir(movieDir, { recursive: true });
  await writePlaceholderSvg(join(movieDir, IMAGE_FILENAMES.poster), title, tmdbId);
}

export async function generateTvPlaceholder(
  tvDir: string,
  tvdbId: number,
  title: string,
  seasonNumber?: number
): Promise<void> {
  await mkdir(tvDir, { recursive: true });
  const filename =
    seasonNumber !== undefined ? seasonFilename(seasonNumber) : IMAGE_FILENAMES.poster;
  const label = seasonNumber !== undefined ? `${title} — Season ${seasonNumber}` : title;
  await writePlaceholderSvg(join(tvDir, filename), label, tvdbId);
}
