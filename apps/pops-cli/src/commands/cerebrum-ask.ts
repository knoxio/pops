/**
 * `pops cerebrum ask` — natural-language Q&A against the engram store.
 *
 * Accepts the question as a single argument or piped on stdin. Prints the
 * answer followed by citations. Exit codes mirror `capture`: 2 for empty
 * input, 3 for unreachable API, 1 for server-side errors.
 */
import { restMutation } from '../api-client.js';
import { loadConfig } from '../config.js';
import { writeApiError } from '../error-output.js';
import { readStdin, type StdinSource } from '../stdin.js';

interface AskSource {
  id?: string;
  title?: string;
  scope?: string;
  url?: string;
}

interface AskResponse {
  answer: string;
  sources?: AskSource[];
  confidence?: string;
}

export interface RunAskOptions {
  question?: string;
  scopes?: string[];
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  stdin?: StdinSource;
  env?: NodeJS.ProcessEnv;
}

function renderSource(s: AskSource, index: number): string {
  const label = s.title ?? s.id ?? `source-${index + 1}`;
  const id = s.id ? ` (${s.id})` : '';
  const scope = s.scope ? ` [${s.scope}]` : '';
  return `  ${index + 1}. ${label}${id}${scope}`;
}

function writeAskResult(stdout: NodeJS.WritableStream, result: AskResponse): void {
  stdout.write(`${result.answer.trim()}\n`);
  if (result.sources && result.sources.length > 0) {
    stdout.write('\nSources:\n');
    result.sources.forEach((source, i) => stdout.write(`${renderSource(source, i)}\n`));
  }
  if (result.confidence) {
    stdout.write(`\nConfidence: ${result.confidence}\n`);
  }
}

export async function runAsk(options: RunAskOptions): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  const piped = await readStdin(options.stdin ?? process.stdin);
  const question = (options.question ?? piped).trim();
  if (question.length === 0) {
    stderr.write('error: ask requires a question — pass it as an argument or pipe it on stdin\n');
    return 2;
  }

  const config = loadConfig(options.env);
  try {
    const payload: { question: string; scopes?: string[] } = { question };
    if (options.scopes && options.scopes.length > 0) payload.scopes = options.scopes;
    const result = await restMutation<AskResponse>(config, '/query/ask', payload);
    writeAskResult(stdout, result);
    return 0;
  } catch (err) {
    return writeApiError(stderr, err);
  }
}
