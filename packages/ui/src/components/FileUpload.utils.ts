import { formatBytes } from '../lib/format';

export interface ValidateArgs {
  list: File[];
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  onError?: (message: string) => void;
}

function fileMatches(file: File, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return patterns.some((p) => {
    const pat = p.toLowerCase();
    if (pat.startsWith('.')) return name.endsWith(pat);
    if (pat.endsWith('/*')) return type.startsWith(pat.slice(0, -1));
    return type === pat;
  });
}

export function validateFiles({ list, accept, maxSize, maxFiles, onError }: ValidateArgs): File[] {
  const patterns = accept
    ? accept
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  const out: File[] = [];
  for (const file of list) {
    if (!fileMatches(file, patterns)) {
      onError?.(`${file.name} is not an accepted file type`);
      continue;
    }
    if (typeof maxSize === 'number' && file.size > maxSize) {
      onError?.(`${file.name} exceeds max size of ${formatBytes(maxSize)}`);
      continue;
    }
    out.push(file);
  }
  if (typeof maxFiles === 'number' && out.length > maxFiles) {
    onError?.(`You can upload at most ${maxFiles} file${maxFiles === 1 ? '' : 's'}`);
    return out.slice(0, maxFiles);
  }
  return out;
}
