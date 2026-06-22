/**
 * Local dev server for pops-docs (Theme 13 PRD-219 US-05).
 *
 * Behaviour:
 *   1. Runs `collect-specs.ts` once to populate `dist/`
 *   2. Watches every discovered `pillars/<id>/openapi/` directory and
 *      re-runs the collector when an OpenAPI snapshot changes (so contract
 *      authors can preview docs without restarting the server)
 *   3. Serves `dist/` over a tiny Node http server on `POPS_DOCS_PORT`
 *      (default 4280) with the same URL layout that nginx serves in prod
 *
 * Intentionally has no third-party server dependency — Stoplight
 * Elements is loaded from a CDN by `index.html`, and Node's built-in
 * `http`/`fs.watch` are enough for a local preview.
 */
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const PILLARS_DIR = resolve(REPO_ROOT, 'pillars');
const DIST_DIR = resolve(APP_ROOT, 'dist');
const COLLECT_SCRIPT = resolve(HERE, 'collect-specs.ts');

const PORT = Number.parseInt(process.env.POPS_DOCS_PORT ?? '4280', 10);

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function runCollect(): void {
  const result = spawnSync('tsx', [COLLECT_SCRIPT], { cwd: APP_ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write('[pops-docs] collect-specs failed\n');
  }
}

function watchOpenapiDirs(): void {
  if (!existsSync(PILLARS_DIR)) return;

  const dirs: string[] = [];
  for (const entry of readdirSync(PILLARS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = resolve(PILLARS_DIR, entry.name, 'openapi');
    try {
      if (statSync(candidate).isDirectory()) dirs.push(candidate);
    } catch {
      continue;
    }
  }

  let pending: NodeJS.Timeout | null = null;
  const debouncedRecollect = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      process.stdout.write('[pops-docs] contract change detected — recollecting\n');
      runCollect();
    }, 200);
  };

  for (const dir of dirs) {
    watch(dir, { persistent: true }, debouncedRecollect);
    process.stdout.write(`[pops-docs] watching ${dir}\n`);
  }
}

function resolveServePath(urlPath: string): string {
  if (urlPath === '/' || urlPath === '') return resolve(DIST_DIR, 'index.html');
  const safe = urlPath.replace(/\?.*$/, '').replace(/\.\.+/g, '');
  return resolve(DIST_DIR, `.${safe}`);
}

function startHttpServer(): void {
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}\n');
      return;
    }

    const filePath = resolveServePath(url);
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) throw new Error('not a file');
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  });

  server.listen(PORT, () => {
    process.stdout.write(`[pops-docs] dev server on http://localhost:${PORT}\n`);
  });
}

runCollect();
watchOpenapiDirs();
startHttpServer();
