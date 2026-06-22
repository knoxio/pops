import { describe, expect, it } from 'vitest';

import { buttonVariants } from './button';

/**
 * Touch target audit tests
 * Verifies all interactive element variants meet 44x44px minimum touch target.
 *
 * Strategy: check that CVA class strings include the right Tailwind utilities.
 * - h-11 / size-11 = 44px (meets minimum directly)
 * - before:-inset-X pseudo-element expands touch area beyond visual element
 *   e.g. h-6 (24px) + before:-inset-2.5 (10px each side) = 44px
 */

describe('Touch target audit', () => {
  describe('Button primitive', () => {
    it('default size meets 44px via h-11', () => {
      const classes = buttonVariants({ size: 'default' });
      expect(classes).toContain('h-11');
    });

    it('lg size meets 44px via h-11', () => {
      const classes = buttonVariants({ size: 'lg' });
      expect(classes).toContain('h-11');
    });

    it('icon size meets 44px via size-11', () => {
      const classes = buttonVariants({ size: 'icon' });
      expect(classes).toContain('size-11');
    });

    it('icon-lg size meets 44px via size-11', () => {
      const classes = buttonVariants({ size: 'icon-lg' });
      expect(classes).toContain('size-11');
    });

    it('xs size (24px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'xs' });
      expect(classes).toContain('h-6');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-2.5');
      expect(classes).toContain("before:content-['']");
    });

    it('sm size (32px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'sm' });
      expect(classes).toContain('h-8');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-1.5');
      expect(classes).toContain("before:content-['']");
    });

    it('icon-xs size (32px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'icon-xs' });
      expect(classes).toContain('size-8');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-1.5');
      expect(classes).toContain("before:content-['']");
    });

    it('icon-sm size (36px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'icon-sm' });
      expect(classes).toContain('size-9');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-1');
      expect(classes).toContain("before:content-['']");
    });

    it('all button sizes have relative positioning for pseudo-element', () => {
      const sizes = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;
      for (const size of sizes) {
        const classes = buttonVariants({ size });
        expect(classes, `size="${size}" should have relative positioning`).toContain('relative');
      }
    });
  });
});
