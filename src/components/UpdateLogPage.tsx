import { useI18n } from '../context/I18nContext';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { changelogByLocale } from '../i18n/changelog';
import { AccountMenu } from './AccountMenu';
import { HeaderNavLinks } from './HeaderNavLinks';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SyncIndicator } from './SyncIndicator';
import styles from './UpdateLogPage.module.css';

function formatChangelogDate(isoDate: string, locale: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const tag = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
  return new Intl.DateTimeFormat(tag, { dateStyle: 'medium' }).format(d);
}

export function UpdateLogPage() {
  const { locale, t } = useI18n();
  const entries = changelogByLocale[locale];
  const homeHref = buildLocalizedPathname('/', locale);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandRow}>
            <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
              <span className={styles.logoWordmark}>ACoffee</span>
            </a>
          </div>
          <HeaderNavLinks />
          <div className={styles.headerAside}>
            <LanguageSwitcher />
            {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
              <>
                <SyncIndicator />
                <AccountMenu />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>{t('changelog.pageTitle')}</h1>
        <p className={styles.lead}>{t('changelog.pageLead')}</p>
        <div className={styles.list}>
          {entries.map((entry) => (
            <article key={`${entry.isoDate}-${entry.title}`} className={styles.entry}>
              <div className={styles.entryHeader}>
                <time className={styles.entryDate} dateTime={entry.isoDate}>
                  {formatChangelogDate(entry.isoDate, locale)}
                </time>
                <h2 className={styles.entryTitle}>{entry.title}</h2>
              </div>
              <ul className={styles.bullets}>
                {entry.bullets.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <footer className={styles.pageFooter}>
          <p className={styles.disclaimer} role="note">
            {t('bottomNav.bmacDisclaimer')}
          </p>
        </footer>
      </main>
    </div>
  );
}
