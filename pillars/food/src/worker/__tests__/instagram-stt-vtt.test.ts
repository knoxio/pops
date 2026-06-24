import { describe, expect, it } from 'vitest';

import { parseVtt } from '../handlers/instagram/stt-whisper.js';

describe('parseVtt', () => {
  it('concatenates cues, dropping timestamps + cue identifiers', () => {
    const raw = [
      'WEBVTT',
      '',
      '1',
      '00:00:00.000 --> 00:00:02.000',
      'Hello there.',
      '',
      '2',
      '00:00:02.000 --> 00:00:05.000',
      'Welcome to the kitchen.',
      'Today we make pasta.',
      '',
    ].join('\n');
    expect(parseVtt(raw)).toBe('Hello there.\nWelcome to the kitchen. Today we make pasta.');
  });

  it('handles an empty transcript', () => {
    expect(parseVtt('WEBVTT\n')).toBe('');
  });

  it('handles cues without numeric identifiers', () => {
    const raw = ['WEBVTT', '', '00:00:00.000 --> 00:00:02.000', 'Just one line.'].join('\n');
    expect(parseVtt(raw)).toBe('Just one line.');
  });

  it('handles Windows line endings', () => {
    const raw = 'WEBVTT\r\n\r\n00:00:00.000 --> 00:00:02.000\r\nA line.\r\n';
    expect(parseVtt(raw)).toBe('A line.');
  });
});
