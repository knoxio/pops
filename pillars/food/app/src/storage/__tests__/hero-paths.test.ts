import { resolve, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  HERO_ALLOWED_MIME_TYPES,
  HERO_MIME_TO_EXTENSION,
  assertValidRecipeId,
  heroImageUrl,
  isValidHeroFilename,
  relativeHeroPath,
} from '../hero-paths';
import {
  DEFAULT_FOOD_RECIPES_DIR,
  cardPathFor,
  heroPathFor,
  recipeDirFor,
  recipesRootDir,
  resolveServablePath,
  thumbPathFor,
} from '../hero-paths.node';

const ORIGINAL_ENV = process.env['FOOD_RECIPES_DIR'];

describe('hero-paths', () => {
  beforeEach(() => {
    delete process.env['FOOD_RECIPES_DIR'];
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env['FOOD_RECIPES_DIR'];
    else process.env['FOOD_RECIPES_DIR'] = ORIGINAL_ENV;
  });

  describe('recipesRootDir', () => {
    it('defaults to ./data/food/recipes when env is unset', () => {
      expect(recipesRootDir()).toBe(resolve(DEFAULT_FOOD_RECIPES_DIR));
    });
    it('defaults when env is empty string', () => {
      process.env['FOOD_RECIPES_DIR'] = '';
      expect(recipesRootDir()).toBe(resolve(DEFAULT_FOOD_RECIPES_DIR));
    });
    it('honours an absolute path', () => {
      process.env['FOOD_RECIPES_DIR'] = '/var/pops/recipes';
      expect(recipesRootDir()).toBe('/var/pops/recipes');
    });
  });

  describe('assertValidRecipeId', () => {
    it('accepts positive integers', () => {
      expect(assertValidRecipeId(1)).toBe(1);
      expect(assertValidRecipeId(42)).toBe(42);
    });
    it('accepts decimal-string forms', () => {
      expect(assertValidRecipeId('42')).toBe(42);
    });
    it.each([0, -1, 1.5, '0', '-1', '1.5', '../etc/passwd', 'abc', '', null, undefined, {}])(
      'rejects %p',
      (val) => {
        expect(() => assertValidRecipeId(val)).toThrow(/Invalid recipe id/);
      }
    );
  });

  describe('absolute path helpers', () => {
    beforeEach(() => {
      process.env['FOOD_RECIPES_DIR'] = '/tmp/pops-test-recipes';
    });
    it('recipeDirFor joins root and recipe id', () => {
      expect(recipeDirFor(7)).toBe(resolve('/tmp/pops-test-recipes/7'));
    });
    it('heroPathFor uses the extension', () => {
      expect(heroPathFor(7, 'webp')).toBe(resolve('/tmp/pops-test-recipes/7/hero.webp'));
    });
    it('thumbPathFor is fixed webp', () => {
      expect(thumbPathFor(7)).toBe(resolve('/tmp/pops-test-recipes/7/hero-thumb.webp'));
    });
    it('cardPathFor is fixed webp', () => {
      expect(cardPathFor(7)).toBe(resolve('/tmp/pops-test-recipes/7/hero-card.webp'));
    });
  });

  describe('relativeHeroPath', () => {
    it('uses POSIX separators regardless of platform', () => {
      const rel = relativeHeroPath(99, 'png');
      expect(rel).toBe('99/hero.png');
      expect(rel.includes(sep === '/' ? '\\' : '\\')).toBe(false);
    });
  });

  describe('isValidHeroFilename', () => {
    it.each([
      'hero.jpg',
      'hero.jpeg',
      'hero.png',
      'hero.webp',
      'hero-thumb.webp',
      'hero-card.webp',
    ])('accepts %s', (name) => {
      expect(isValidHeroFilename(name)).toBe(true);
    });
    it.each([
      '',
      'hero',
      'hero.gif',
      'hero.heic',
      '../hero.jpg',
      'hero/../foo.jpg',
      'hero.jpg\0',
      'hero-thumb.jpg',
      'HERO.JPG',
    ])('rejects %s', (name) => {
      expect(isValidHeroFilename(name)).toBe(false);
    });
  });

  describe('resolveServablePath', () => {
    beforeEach(() => {
      process.env['FOOD_RECIPES_DIR'] = '/tmp/pops-test-recipes';
    });
    it('resolves a valid hero filename under the root', () => {
      expect(resolveServablePath(7, 'hero.jpg')).toBe(resolve('/tmp/pops-test-recipes/7/hero.jpg'));
    });
    it('returns null for unknown filenames', () => {
      expect(resolveServablePath(7, 'evil.gif')).toBeNull();
    });
    it('rejects traversal attempts via recipe id', () => {
      // assertValidRecipeId rejects non-positive-integers before any path join,
      // so an out-of-range id throws rather than escaping the root.
      expect(() => resolveServablePath(-1, 'hero.jpg')).toThrow();
    });
  });

  describe('heroImageUrl', () => {
    it('returns null for missing input', () => {
      expect(heroImageUrl(null)).toBeNull();
      expect(heroImageUrl(undefined)).toBeNull();
      expect(heroImageUrl('')).toBeNull();
    });
    it('returns null for malformed path', () => {
      expect(heroImageUrl('not-a-path')).toBeNull();
      expect(heroImageUrl('7/hero.gif')).toBeNull();
    });
    it('builds the original URL', () => {
      expect(heroImageUrl('42/hero.jpg', 'original')).toBe('/api/food/recipes/42/hero.jpg');
    });
    it('builds the thumb URL with webp extension', () => {
      expect(heroImageUrl('42/hero.jpg', 'thumb')).toBe('/api/food/recipes/42/hero-thumb.webp');
    });
    it('builds the card URL with webp extension', () => {
      expect(heroImageUrl('42/hero.png', 'card')).toBe('/api/food/recipes/42/hero-card.webp');
    });
  });

  describe('mime mapping', () => {
    it('matches the allowed list', () => {
      expect(Object.keys(HERO_MIME_TO_EXTENSION).toSorted()).toEqual(
        [...HERO_ALLOWED_MIME_TYPES].toSorted()
      );
    });
  });
});
