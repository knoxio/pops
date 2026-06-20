/**
 * Template registry.
 *
 * Loads templates from disk at startup (and re-loads on demand). Templates
 * are `.md` files with YAML frontmatter, so the Markdown body doubles as
 * scaffold content for new engrams.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import matter from 'gray-matter';

import { type Template, templateFrontmatterSchema } from './schema.js';

export class TemplateRegistry {
  private templates = new Map<string, Template>();

  constructor(private readonly dir: string) {
    this.reload();
  }

  list(): Template[] {
    return [...this.templates.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  /** Re-scan the template directory. Useful after an operator edits files. */
  reload(): void {
    const loaded = new Map<string, Template>();
    let files: string[];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith('.md'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.templates = loaded;
        return;
      }
      throw err;
    }

    for (const file of files) {
      const content = readFileSync(join(this.dir, file), 'utf8');
      const { data, content: body } = matter(content);
      const parsed = templateFrontmatterSchema.safeParse(data);
      if (!parsed.success) {
        console.warn(`[cerebrum] Skipping invalid template file ${file}: ${parsed.error.message}`);
        continue;
      }
      loaded.set(parsed.data.name, { ...parsed.data, body });
    }
    this.templates = loaded;
  }
}
