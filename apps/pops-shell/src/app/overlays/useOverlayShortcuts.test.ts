/**
 * Tests for the shell-centralised overlay shortcut wiring (PRD-101 US-07).
 *
 * The hook itself is render-time only, so we test the pure shortcut
 * matcher (the part with all the branching) directly. Acceptance
 * criterion for "shortcuts wired centrally" is covered by the hook's
 * existence and its use in `RootLayout`; this file guards the matcher
 * against accidental regressions in the parser and matcher by importing
 * the production implementation so a regression in shipped code fails
 * this suite.
 */
import { describe, expect, it } from 'vitest';

import { compileShortcut } from './useOverlayShortcuts';

interface KeyEventInit {
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

function makeEvent(partial: KeyEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: partial.key ?? '',
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  });
}

describe('compileShortcut — mod+i', () => {
  const match = compileShortcut('mod+i');

  it('matches Cmd+I on macOS-style events', () => {
    expect(match(makeEvent({ key: 'i', metaKey: true }))).toBe(true);
  });

  it('matches Ctrl+I on non-macOS events', () => {
    expect(match(makeEvent({ key: 'i', ctrlKey: true }))).toBe(true);
  });

  it('rejects plain "i" with no modifier', () => {
    expect(match(makeEvent({ key: 'i' }))).toBe(false);
  });

  it('rejects mod+other-key', () => {
    expect(match(makeEvent({ key: 'k', metaKey: true }))).toBe(false);
  });

  it('is case-insensitive on the key', () => {
    expect(match(makeEvent({ key: 'I', metaKey: true }))).toBe(true);
  });

  it('rejects mod+shift+i so a more specific binding can claim it', () => {
    expect(match(makeEvent({ key: 'i', metaKey: true, shiftKey: true }))).toBe(false);
  });
});

describe('compileShortcut — multi-modifier and edge cases', () => {
  it('requires every declared modifier', () => {
    const match = compileShortcut('ctrl+shift+p');
    expect(match(makeEvent({ key: 'p', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(match(makeEvent({ key: 'p', ctrlKey: true }))).toBe(false);
    expect(match(makeEvent({ key: 'p', shiftKey: true }))).toBe(false);
  });

  it('treats `option` as an alias for `alt`', () => {
    const match = compileShortcut('option+j');
    expect(match(makeEvent({ key: 'j', altKey: true }))).toBe(true);
  });

  it('returns a never-match predicate for an empty input', () => {
    const match = compileShortcut('');
    expect(match(makeEvent({ key: 'a' }))).toBe(false);
  });

  it('fails closed on unknown modifier tokens (typos like "cmd+k")', () => {
    // "cmd" is not a recognised modifier; the spec must reject the whole
    // binding rather than degrading to plain "k".
    const match = compileShortcut('cmd+k');
    expect(match(makeEvent({ key: 'k', metaKey: true }))).toBe(false);
    expect(match(makeEvent({ key: 'k' }))).toBe(false);
  });

  it('fails closed when the key position holds a modifier token', () => {
    // "ctrl+" parses to a single token "ctrl"; treating that as the key
    // would silently bind Ctrl by itself.
    const match = compileShortcut('ctrl');
    expect(match(makeEvent({ key: 'ctrl', ctrlKey: true }))).toBe(false);
  });

  it('rejects unexpected modifiers on a bare key binding', () => {
    // A spec of just "k" must not match Shift+K — the spec says no
    // modifiers.
    const match = compileShortcut('k');
    expect(match(makeEvent({ key: 'k' }))).toBe(true);
    expect(match(makeEvent({ key: 'k', shiftKey: true }))).toBe(false);
    expect(match(makeEvent({ key: 'k', altKey: true }))).toBe(false);
    expect(match(makeEvent({ key: 'k', ctrlKey: true }))).toBe(false);
    expect(match(makeEvent({ key: 'k', metaKey: true }))).toBe(false);
  });
});
