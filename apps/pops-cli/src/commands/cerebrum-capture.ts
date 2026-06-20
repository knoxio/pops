/**
 * `pops cerebrum capture` — quick-capture a thought into the engram store.
 *
 * Accepts text as a single argument or piped on stdin. Empty/whitespace-only
 * input exits with code 2 and a clear error message. Network failures exit
 * with code 3. Server-side validation/auth errors exit with code 1.
 */
import { restMutation } from '../api-client.js';
import { loadConfig } from '../config.js';
import { writeApiError } from '../error-output.js';
import { readStdin, type StdinSource } from '../stdin.js';

export interface QuickCaptureResponse {
  id: string;
  path: string;
  type: string;
  scopes: string[];
}

export interface RunCaptureOptions {
  text?: string;
  source?: string;
  /** Injectable for tests — defaults to process.stdout/stderr. */
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  /** Injectable for tests — defaults to process.stdin. */
  stdin?: StdinSource;
  /** Injectable for tests — defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export async function runCapture(options: RunCaptureOptions): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  const piped = await readStdin(options.stdin ?? process.stdin);
  const text = (options.text ?? piped).trim();
  if (text.length === 0) {
    stderr.write('error: capture requires text — pass it as an argument or pipe it on stdin\n');
    return 2;
  }

  const config = loadConfig(options.env);
  try {
    const result = await restMutation<QuickCaptureResponse>(config, '/ingest/quick-capture', {
      text,
      source: options.source ?? 'cli',
    });
    stdout.write(`Captured ${result.id}\n`);
    stdout.write(`  path:   ${result.path}\n`);
    stdout.write(`  type:   ${result.type}\n`);
    stdout.write(`  scopes: ${result.scopes.join(', ') || '<none>'}\n`);
    return 0;
  } catch (err) {
    return writeApiError(stderr, err);
  }
}
