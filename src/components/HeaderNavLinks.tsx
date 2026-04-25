import { useI18n } from '../context/I18nContext';
import { usePathname } from '../hooks/usePathname';
import { buildLocalizedPathname, stripLocalePrefix } from '../i18n/detectLocale';
import { isUpdatesPath, UPDATES_PATH } from '../i18n/changelog';
import { isPassportPath, PASSPORT_PATH } from '../routes';
import styles from './HeaderNavLinks.module.css';

/**
 * Desktop-only inline nav between logo and the right account cluster.
 * Mobile users get the same destinations from `SiteBottomNav` (the fixed
 * tab bar). The logo already covers Home, so this nav only carries
 * Passport + Updates.
 */
export function HeaderNavLinks() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const logical = stripLocalePrefix(pathname);
  const onChangelog = isUpdatesPath(logical);
  const onPassport = isPassportPath(logical);

  const updatesHref = buildLocalizedPathname(UPDATES_PATH, locale);
  const passportHref = buildLocalizedPathname(PASSPORT_PATH, locale);

  return (
    <nav className={styles.nav} aria-label={t('bottomNav.aria')}>
      <a
        className={`${styles.link} ${onPassport ? styles.linkActive : ''}`}
        href={passportHref}
        aria-current={onPassport ? 'page' : undefined}
      >
        {t('bottomNav.passport')}
      </a>
      <a
        className={`${styles.link} ${onChangelog ? styles.linkActive : ''}`}
        href={updatesHref}
        aria-current={onChangelog ? 'page' : undefined}
      >
        {t('changelog.navLink')}
      </a>
    </nav>
  );
}
