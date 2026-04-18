/**
 * Seed default templates into the engram root.
 *
 * On first boot (or whenever the operator adds a new default template to the
 * repo), copy any template that is not yet present on disk. Existing templates
 * are never overwritten — the user's copies are the source of truth.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = join(here, 'defaults');

/**
 * Copy any bundled defaults that are missing from `targetDir`. Idempotent.
 * Returns the names of templates that were written on this call.
 */
export function seedDefaultTemplates(targetDir: string): string[] {
  mkdirSync(targetDir, { recursive: true });

  const files = readdirSync(DEFAULTS_DIR).filter((f) => f.endsWith('.md'));
  const written: string[] = [];
  for (const file of files) {
    const target = join(targetDir, file);
    if (existsSync(target)) continue;
    copyFileSync(join(DEFAULTS_DIR, file), target);
    written.push(file);
  }
  return written;
}

export function getBundledDefaultsDir(): string {
  return DEFAULTS_DIR;
}
