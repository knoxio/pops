#!/usr/bin/env node
/**
 * pops ego — one-shot natural language query against the Cerebrum knowledge base.
 *
 * Usage:
 *   pops ego "question text"
 *   pops ego --format json "question text"
 *   pops ego --scopes work.projects "what's the status?"
 *   cat notes.md | pops ego "summarise this"
 *
 * Connects to the running pops-api instance via tRPC HTTP.
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';

import type { AppRouter } from '../router.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

type OutputFormat = 'markdown' | 'json' | 'plain';

interface CliArgs {
  question: string;
  format: OutputFormat;
  scopes: string[] | undefined;
  model: string | undefined;
}

const USAGE = `Usage: pops ego [options] "question"

Options:
  --format <markdown|json|plain>   Output format (default: markdown)
  --scopes <scope1,scope2>         Comma-separated scope filters
  --model <model-name>             Override the LLM model

Examples:
  pops ego "What did I decide about the migration?"
  pops ego --format json "What meetings do I have this week?"
  pops ego --scopes work.projects "What's the status?"
  cat notes.md | pops ego "Summarise this"
`;

const VALID_FORMATS = new Set<OutputFormat>(['markdown', 'json', 'plain']);

interface FlagHandlers {
  format: OutputFormat;
  scopes: string[] | undefined;
  model: string | undefined;
}

function handleFlagArg(arg: string, nextVal: string, state: FlagHandlers): boolean | null {
  if (arg === '--format') {
    if (!VALID_FORMATS.has(nextVal as OutputFormat)) {
      process.stderr.write(`Invalid format: ${nextVal}. Use markdown, json, or plain.\n`);
      return null;
    }
    state.format = nextVal as OutputFormat;
    return true;
  }
  if (arg === '--scopes') {
    state.scopes = nextVal.split(',').filter(Boolean);
    return true;
  }
  if (arg === '--model') {
    state.model = nextVal;
    return true;
  }
  return false;
}

function parseCliArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2);
  const state: FlagHandlers = { format: 'markdown', scopes: undefined, model: undefined };
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';

    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    }

    const nextVal = args[i + 1] ?? '';
    const consumed = i + 1 < args.length ? handleFlagArg(arg, nextVal, state) : false;
    if (consumed === null) return null;
    if (consumed) {
      i++;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  return { question: positional.join(' '), ...state };
}

// ---------------------------------------------------------------------------
// Piped input handling
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

// ---------------------------------------------------------------------------
// tRPC client
// ---------------------------------------------------------------------------

function createApiClient(): ReturnType<typeof createTRPCClient<AppRouter>> {
  const apiUrl = process.env['POPS_API_URL'] ?? 'http://localhost:3000';
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

interface QueryResult {
  answer: string;
  sources: Array<{
    id: string;
    type: string;
    title: string;
    excerpt: string;
    relevance: number;
    scope: string;
  }>;
  scopes: string[];
  confidence: string;
}

function formatMarkdown(result: QueryResult): string {
  const lines: string[] = [result.answer, ''];

  if (result.sources.length > 0) {
    lines.push('**Sources:**');
    for (const s of result.sources) {
      lines.push(`- [${s.title}](${s.id}) (${(s.relevance * 100).toFixed(0)}%)`);
    }
  }

  if (result.confidence === 'low') {
    lines.push('', '_Note: confidence is low — the answer may be incomplete._');
  }

  return lines.join('\n');
}

function formatPlain(result: QueryResult): string {
  const lines: string[] = [result.answer, ''];

  if (result.sources.length > 0) {
    lines.push('Sources:');
    for (const s of result.sources) {
      lines.push(`  [${s.title}] (${s.id})`);
    }
  }

  if (result.confidence === 'low') {
    lines.push('', 'Note: confidence is low — the answer may be incomplete.');
  }

  return lines.join('\n');
}

function formatOutput(result: QueryResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(
        { answer: result.answer, citations: result.sources, scopes: result.scopes },
        null,
        2
      );
    case 'plain':
      return formatPlain(result);
    case 'markdown':
    default:
      return formatMarkdown(result);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv);
  if (!parsed) {
    process.exit(1);
  }

  // Read piped input if available
  const pipedContent = await readStdin();

  // Build the question with piped context
  let question = parsed.question;
  if (pipedContent && question) {
    question = `--- Context ---\n${pipedContent}\n--- Question ---\n${question}`;
  } else if (pipedContent && !question) {
    question = pipedContent;
  }

  if (!question.trim()) {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  const client = createApiClient();

  try {
    const result = await client.cerebrum.query.ask.mutate({
      question,
      scopes: parsed.scopes,
    });

    process.stdout.write(formatOutput(result as QueryResult, parsed.format) + '\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
