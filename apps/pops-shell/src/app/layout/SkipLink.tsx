import { useTranslation } from 'react-i18next';

/**
 * Visually-hidden skip-to-content link that becomes visible on focus.
 *
 * Lets keyboard-only and screen-reader users bypass the topbar / app rail /
 * page nav (~30+ tabstops) and jump straight to the page's `<main>` content.
 * Targets `id="main-content"` set on the shell's `<main>` element. Renders
 * as the very first focusable element of the document so it's reached on the
 * first Tab keypress (WCAG 2.4.1 Bypass Blocks).
 */
export function SkipLink() {
  const { t } = useTranslation('shell');
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
    >
      {t('skipToContent')}
    </a>
  );
}
