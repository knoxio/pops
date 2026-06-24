import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FOOD_INGEST_DIR,
  ingestDirFor,
  ingestRootDir,
  relativeToIngestDir,
} from '../ingest-paths.js';

const ORIGINAL_ENV = process.env['FOOD_INGEST_DIR'];

describe('ingest-paths', () => {
  beforeEach(() => {
    delete process.env['FOOD_INGEST_DIR'];
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env['FOOD_INGEST_DIR'];
    else process.env['FOOD_INGEST_DIR'] = ORIGINAL_ENV;
  });

  describe('ingestRootDir', () => {
    it('defaults to ./data/food/ingest when FOOD_INGEST_DIR is unset', () => {
      expect(ingestRootDir()).toBe(resolve(DEFAULT_FOOD_INGEST_DIR));
    });

    it('defaults when FOOD_INGEST_DIR is an empty string', () => {
      process.env['FOOD_INGEST_DIR'] = '';
      expect(ingestRootDir()).toBe(resolve(DEFAULT_FOOD_INGEST_DIR));
    });

    it('honours an absolute FOOD_INGEST_DIR', () => {
      process.env['FOOD_INGEST_DIR'] = '/var/pops/ingest';
      expect(ingestRootDir()).toBe('/var/pops/ingest');
    });
  });

  describe('ingestDirFor', () => {
    it('joins the source id onto the root', () => {
      process.env['FOOD_INGEST_DIR'] = '/var/pops/ingest';
      expect(ingestDirFor(42)).toBe('/var/pops/ingest/42');
    });
  });

  describe('relativeToIngestDir', () => {
    it('converts an absolute child back to POSIX relative', () => {
      process.env['FOOD_INGEST_DIR'] = '/var/pops/ingest';
      expect(relativeToIngestDir('/var/pops/ingest/17/video.mp4')).toBe('17/video.mp4');
    });

    it('rejects a path outside the root', () => {
      process.env['FOOD_INGEST_DIR'] = '/var/pops/ingest';
      expect(() => relativeToIngestDir('/etc/passwd')).toThrow(/outside FOOD_INGEST_DIR/);
    });

    it('rejects a relative input', () => {
      expect(() => relativeToIngestDir('17/video.mp4')).toThrow(/absolute path/);
    });

    it('rejects the root itself (empty relative)', () => {
      process.env['FOOD_INGEST_DIR'] = '/var/pops/ingest';
      expect(() => relativeToIngestDir('/var/pops/ingest')).toThrow(/outside FOOD_INGEST_DIR/);
    });

    it('accepts filenames that begin with ".." but are not parent refs', () => {
      // `..foo` is a perfectly valid filename living under the root and
      // must not be conflated with `..` (parent dir).
      process.env['FOOD_INGEST_DIR'] = '/var/pops/ingest';
      expect(relativeToIngestDir('/var/pops/ingest/17/..foo')).toBe('17/..foo');
    });

    it('rejects a true parent-dir traversal', () => {
      process.env['FOOD_INGEST_DIR'] = '/var/pops/ingest';
      expect(() => relativeToIngestDir('/var/pops/sibling')).toThrow(/outside FOOD_INGEST_DIR/);
    });
  });
});
