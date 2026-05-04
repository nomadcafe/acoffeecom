import { useI18n } from '../context/I18nContext';

/**
 * Visually-hidden-until-focused link rendered as the first focusable
 * element on every page. Keyboard users press Tab once and can jump
 * straight to <main id="content">, skipping the header (logo + 5+ menu
 * items + language + sync + account on the home page) on every visit.
 *
 * Pair with `id="content"` + `tabIndex={-1}` on the route's <main> so
 * focus actually lands inside the content region (a non-tabindex'd
 * <main> doesn't accept programmatic focus reliably across browsers).
 */
export function SkipToContent() {
  const { t } = useI18n();
  return (
    <a className="skip-to-content" href="#content">
      {t('app.skipToContent')}
    </a>
  );
}
