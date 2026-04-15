import { useI18n } from '../context/I18nContext';
import { usePathname } from '../hooks/usePathname';
import { buildLocalizedPathname, stripLocalePrefix } from '../i18n/detectLocale';
import { isUpdatesPath, UPDATES_PATH } from '../i18n/changelog';
import styles from './SiteBottomNav.module.css';

export function SiteBottomNav() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const logical = stripLocalePrefix(pathname);
  const onChangelog = isUpdatesPath(logical);

  const homeHref = buildLocalizedPathname('/', locale);
  const updatesHref = buildLocalizedPathname(UPDATES_PATH, locale);

  return (
    <footer className={styles.bar}>
      <p className={styles.disclaimer} role="note">
        {t('bottomNav.bmacDisclaimer')}
      </p>
      <nav aria-label={t('bottomNav.aria')}>
        <div className={styles.inner}>
          <a
            className={`${styles.link} ${!onChangelog ? styles.linkActive : ''}`}
            href={homeHref}
            aria-current={!onChangelog ? 'page' : undefined}
          >
            <span className={styles.label}>{t('bottomNav.home')}</span>
          </a>
          <a
            className={`${styles.link} ${onChangelog ? styles.linkActive : ''}`}
            href={updatesHref}
            aria-current={onChangelog ? 'page' : undefined}
          >
            <span className={styles.label}>{t('changelog.navLink')}</span>
          </a>
        </div>
      </nav>
    </footer>
  );
}
