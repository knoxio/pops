/**
 * CLI argument parser for `generate-nginx-conf.ts`. Split out so the
 * generator's renderer stays small and the complexity budget of
 * `parseCliArgs` does not grow with every new flag.
 *
 * The parser is intentionally hand-written (no commander/yargs) because
 * the surface is tiny and pulling in a CLI framework for four flags is
 * not worth the dep weight.
 */
import { resolve } from 'node:path';

export interface CliOptions {
  outputPath: string;
  check: boolean;
  dynamic: boolean;
  registryUrl: string;
}

export interface CliDefaults {
  outputPath: string;
  registryUrl: string;
}

function parseInlineFlagValue(arg: string, prefix: string): string | undefined {
  if (!arg.startsWith(`${prefix}=`)) return undefined;
  return arg.slice(prefix.length + 1);
}

function readValueAfter(argv: readonly string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (next === undefined) {
    throw new Error(`generate-nginx-conf: ${flag} requires a value`);
  }
  return next;
}

interface Cursor {
  index: number;
  readonly options: CliOptions;
}

function handleSimpleFlag(arg: string, cursor: Cursor): boolean {
  if (arg === '--check') {
    cursor.options.check = true;
    return true;
  }
  if (arg === '--dynamic') {
    cursor.options.dynamic = true;
    return true;
  }
  return false;
}

function handleValuedFlag(arg: string, argv: readonly string[], cursor: Cursor): boolean {
  if (arg === '--out') {
    cursor.options.outputPath = resolve(readValueAfter(argv, cursor.index, '--out'));
    cursor.index += 1;
    return true;
  }
  if (arg === '--registry-url') {
    cursor.options.registryUrl = readValueAfter(argv, cursor.index, '--registry-url');
    cursor.index += 1;
    return true;
  }
  return false;
}

function handleInlineFlag(arg: string, cursor: Cursor): boolean {
  const inlineOut = parseInlineFlagValue(arg, '--out');
  if (inlineOut !== undefined) {
    if (inlineOut.length === 0) {
      throw new Error('generate-nginx-conf: --out= requires a non-empty path');
    }
    cursor.options.outputPath = resolve(inlineOut);
    return true;
  }
  const inlineUrl = parseInlineFlagValue(arg, '--registry-url');
  if (inlineUrl !== undefined) {
    if (inlineUrl.length === 0) {
      throw new Error('generate-nginx-conf: --registry-url= requires a non-empty URL');
    }
    cursor.options.registryUrl = inlineUrl;
    return true;
  }
  return false;
}

export function parseCliArgs(argv: readonly string[], defaults: CliDefaults): CliOptions {
  const cursor: Cursor = {
    index: 0,
    options: {
      outputPath: defaults.outputPath,
      check: false,
      dynamic: false,
      registryUrl: defaults.registryUrl,
    },
  };
  while (cursor.index < argv.length) {
    const arg = argv[cursor.index];
    if (arg === undefined) {
      cursor.index += 1;
      continue;
    }
    if (
      handleSimpleFlag(arg, cursor) ||
      handleValuedFlag(arg, argv, cursor) ||
      handleInlineFlag(arg, cursor)
    ) {
      cursor.index += 1;
      continue;
    }
    if (!arg.startsWith('--')) {
      cursor.options.outputPath = resolve(arg);
      cursor.index += 1;
      continue;
    }
    throw new Error(`generate-nginx-conf: unknown argument "${arg}"`);
  }
  return cursor.options;
}
