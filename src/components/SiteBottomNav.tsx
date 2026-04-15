import { useI18n } from '../context/I18nContext';
import { usePathname } from '../hooks/usePathname';
import { buildLocalizedPathname, stripLocalePrefix } from '../i18n/detectLocale';
import { isUpdatesPath, UPDATES_PATH } from '../i18n/changelog';
import styles from './SiteBottomNav.module.css';

function IconFinder() {
  return (
    <svg className={styles.tabIcon} viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.2-3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconUpdates() {
  return (
    <svg className={styles.tabIcon} viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SiteBottomNav() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const logical = stripLocalePrefix(pathname);
  const onChangelog = isUpdatesPath(logical);

  const homeHref = buildLocalizedPathname('/', locale);
  const updatesHref = buildLocalizedPathname(UPDATES_PATH, locale);

  return (
    <footer className={styles.bar}>
      <div className={styles.disclaimerBand}>
        <p className={styles.disclaimer} role="note">
          {t('bottomNav.bmacDisclaimer')}
        </p>
      </div>

      <nav className={styles.tabNav} aria-label={t('bottomNav.aria')}>
        <div className={styles.tabInner}>
          <a
            className={`${styles.tab} ${!onChangelog ? styles.tabActive : ''}`}
            href={homeHref}
            aria-current={!onChangelog ? 'page' : undefined}
          >
            <span className={styles.tabGlyph}>
              <IconFinder />
            </span>
            <span className={styles.tabLabel}>{t('bottomNav.home')}</span>
          </a>
          <a
            className={`${styles.tab} ${onChangelog ? styles.tabActive : ''}`}
            href={updatesHref}
            aria-current={onChangelog ? 'page' : undefined}
          >
            <span className={styles.tabGlyph}>
              <IconUpdates />
            </span>
            <span className={styles.tabLabel}>{t('changelog.navLink')}</span>
          </a>
        </div>
      </nav>
    </footer>
  );
}
