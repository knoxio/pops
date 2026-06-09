/**
 * Cursor — stateful position tracker over the DSL input.
 *
 * The parser is built around an explicit cursor rather than a tokeniser
 * step: the grammar is small enough that on-demand lexing keeps the code
 * simpler. Every consume advances `offset` AND `line` / `col` so spans for
 * diagnostics are accurate.
 */
import type { SourceSpan } from './ast.js';

export class Cursor {
  readonly input: string;
  offset: number;
  line: number;
  col: number;

  constructor(input: string) {
    this.input = input;
    this.offset = 0;
    this.line = 1;
    this.col = 1;
  }

  eof(): boolean {
    return this.offset >= this.input.length;
  }

  /** Char at the current position, or '' if eof. */
  peek(): string {
    return this.input[this.offset] ?? '';
  }

  /** Char at `offset + n`, or '' if past end. */
  peekAt(n: number): string {
    return this.input[this.offset + n] ?? '';
  }

  /** Substring starting at the current position, length `n`, used for `startsWith` checks. */
  peekString(n: number): string {
    return this.input.slice(this.offset, this.offset + n);
  }

  /** Advance one char, maintaining line/col. */
  advance(): string {
    const ch = this.peek();
    if (ch === '') return '';
    this.offset += 1;
    if (ch === '\n') {
      this.line += 1;
      this.col = 1;
    } else {
      this.col += 1;
    }
    return ch;
  }

  /** Advance `n` chars. */
  advanceN(n: number): void {
    for (let i = 0; i < n && !this.eof(); i += 1) this.advance();
  }

  /** Snapshot the current position so a span can be closed later. */
  mark(): { offset: number; line: number; col: number } {
    return { offset: this.offset, line: this.line, col: this.col };
  }

  /**
   * Build a span from a previously-marked start to the current position.
   * Inclusive: if the cursor hasn't moved, end == start (1-char width).
   */
  spanFrom(start: { line: number; col: number; offset: number }): SourceSpan {
    return {
      startLine: start.line,
      startCol: start.col,
      endLine: this.line,
      endCol: Math.max(this.col, start.col),
    };
  }

  /** Span covering a single point (used for "missing" errors). */
  pointSpan(): SourceSpan {
    return {
      startLine: this.line,
      startCol: this.col,
      endLine: this.line,
      endCol: this.col,
    };
  }

  /** Skip spaces, tabs, and (optionally) newlines. */
  skipWhitespace(includeNewlines = true): void {
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
      } else if (includeNewlines && ch === '\n') {
        this.advance();
      } else {
        return;
      }
    }
  }

  /** Skip until and including the next newline (used for `// comments`). */
  skipToEndOfLine(): void {
    while (!this.eof() && this.peek() !== '\n') this.advance();
    if (!this.eof()) this.advance();
  }
}

/** Pure helpers — no cursor mutation. */
export function isSlugStart(ch: string): boolean {
  return ch >= 'a' && ch <= 'z';
}

export function isSlugCont(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-';
}

export function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || ch === '_';
}

export function isIdentCont(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_';
}

export function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}
