/**
 * Pure helpers for the global capture hotkey (PRD-081 US-09). Extracted
 * so the suppression logic can be unit-tested without rendering a hook.
 */

const IGNORE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const IGNORE_ATTR = 'data-capture-hotkey-ignore';

function isEditableContent(target: HTMLElement): boolean {
  if (target.isContentEditable) return true;
  // Fallback for environments where the layout-derived `isContentEditable`
  // getter doesn't reflect the attribute (e.g. JSDOM).
  const ce = target.getAttribute('contenteditable');
  return ce === '' || ce === 'true' || ce === 'plaintext-only';
}

/**
 * Returns true when the keypress should be ignored — focus is inside an
 * editable surface, the user is mid-modifier-chord, or the target opted out
 * via the `data-capture-hotkey-ignore` attribute on itself or any ancestor.
 */
export function shouldSuppress(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  if (e.isComposing) return true;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  if (IGNORE_TAGS.has(target.tagName)) return true;
  if (isEditableContent(target)) return true;
  if (target.closest(`[${IGNORE_ATTR}]`)) return true;
  return false;
}
