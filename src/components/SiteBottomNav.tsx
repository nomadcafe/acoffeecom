import { useI18n } from '../context/I18nContext';
import { usePathname } from '../hooks/usePathname';
import { buildLocalizedPathname, stripLocalePrefix } from '../i18n/detectLocale';
import { isUpdatesPath, UPDATES_PATH } from '../i18n/changelog';
import { isPassportPath, PASSPORT_PATH } from '../routes';
import styles from './SiteBottomNav.module.css';

function IconFinder() {
  return (
    <svg className={styles.tabIcon} viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.2-3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPassport() {
  return (
    <svg className={styles.tabIcon} viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <path
        d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 15.5c.8-1 1.9-1.5 3-1.5s2.2.5 3 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  const onPassport = isPassportPath(logical);
  const onHome = !onChangelog && !onPassport;

  const homeHref = buildLocalizedPathname('/', locale);
  const updatesHref = buildLocalizedPathname(UPDATES_PATH, locale);
  const passportHref = buildLocalizedPathname(PASSPORT_PATH, locale);

  return (
    <footer className={styles.bar}>
      <nav className={styles.tabNav} aria-label={t('bottomNav.aria')}>
        <div className={styles.tabInner}>
          <a
            className={`${styles.tab} ${onHome ? styles.tabActive : ''}`}
            href={homeHref}
            aria-current={onHome ? 'page' : undefined}
          >
            <span className={styles.tabGlyph}>
              <IconFinder />
            </span>
            <span className={styles.tabLabel}>{t('bottomNav.home')}</span>
          </a>
          <a
            className={`${styles.tab} ${onPassport ? styles.tabActive : ''}`}
            href={passportHref}
            aria-current={onPassport ? 'page' : undefined}
          >
            <span className={styles.tabGlyph}>
              <IconPassport />
            </span>
            <span className={styles.tabLabel}>{t('bottomNav.passport')}</span>
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

