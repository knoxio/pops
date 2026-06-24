/**
 * CLI entry-point helpers for `generate-nginx-conf.ts`. Lives in a
 * sibling file so the renderer module stays under the 200-line budget and
 * so the main-loop logic can be unit-tested without forking a subprocess.
 */
import { readFile, writeFile } from 'node:fs/promises';

import { type CliOptions } from './nginx-cli-args.ts';

export interface StaticRunDeps {
  readonly outputPath: string;
  readonly check: boolean;
  readonly expected: string;
  readonly pillarCount: number;
}

export interface DynamicRunDeps {
  readonly outputPath: string;
  readonly registryUrl: string;
  readonly render: (registryUrl: string) => Promise<string>;
}

async function runCheck(outputPath: string, expected: string): Promise<void> {
  let actual: string;
  try {
    actual = await readFile(outputPath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`generate-nginx-conf --check: cannot read ${outputPath}: ${message}\n`);
    process.exit(1);
    return;
  }
  if (actual !== expected) {
    process.stderr.write(
      `generate-nginx-conf --check: ${outputPath} is out of date.\n` +
        `Run \`pnpm gen:nginx\` and commit the result.\n`
    );
    process.exit(1);
    return;
  }
  process.stdout.write(`generate-nginx-conf --check: ${outputPath} is up to date.\n`);
}

export async function runStatic(deps: StaticRunDeps): Promise<void> {
  if (deps.check) {
    await runCheck(deps.outputPath, deps.expected);
    return;
  }
  await writeFile(deps.outputPath, deps.expected, 'utf8');
  const noun = deps.pillarCount === 1 ? 'block' : 'blocks';
  process.stdout.write(
    `generate-nginx-conf: wrote ${deps.pillarCount} pillar ${noun} → ${deps.outputPath}\n`
  );
}

export async function runDynamic(deps: DynamicRunDeps): Promise<void> {
  const rendered = await deps.render(deps.registryUrl);
  await writeFile(deps.outputPath, rendered, 'utf8');
  process.stdout.write(
    `generate-nginx-conf --dynamic: wrote conf from ${deps.registryUrl} → ${deps.outputPath}\n`
  );
}

export function assertDynamicNotCheck(opts: CliOptions): void {
  if (opts.dynamic && opts.check) {
    throw new Error('generate-nginx-conf: --check is not supported with --dynamic');
  }
}
