import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import { usePassportStats } from '../hooks/usePassportStats';
import { streakFireEmoji } from '../utils/streak';
import { formatRelativeTime } from '../utils/relativeTime';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { PASSPORT_PATH } from '../routes';
import styles from './HeroSignedIn.module.css';

/**
 * Personal-state strip shown to signed-in users in the hero, in the slot
 * where HomeFeatureShowcase sits for anonymous visitors. Returning users
 * already know what the product does — instead of marketing, they get
 * "where you left off": streak, last visit, total cups.
 *
 * Empty-passport users (just signed up, never tracked a visit) get
 * nothing here — falls back to the existing tagline + form path so a
 * brand-new account doesn't see a half-empty stats card.
 *
 * All data is computed client-side from `visitedShops` — no extra fetches,
 * no loading state. Hides during search (parent AppHero guards midpoint /
 * isLoading).
 */
export function HeroSignedIn() {
  const { t, locale } = useI18n();
  const { visitedShops } = useApp();
  const { data: session } = useSession();
  const stats = usePassportStats(visitedShops);

  const lastVisit = useMemo(() => {
    if (visitedShops.length === 0) return null;
    let best: { name: string; ts: number } | null = null;
    for (const shop of visitedShops) {
      const top = shop.visits[0];
      if (top != null && (best == null || top > best.ts)) {
        best = { name: shop.name, ts: top };
      }
    }
    return best;
  }, [visitedShops]);

  // Returning user with zero passport activity — give them the
  // standard tagline+form hero instead of an empty stats card.
  if (stats.total === 0) return null;

  const handle = session?.user?.name ?? '';
  const passportHref = buildLocalizedPathname(PASSPORT_PATH, locale);

  return (
    <section className={styles.wrap} aria-labelledby="hero-signed-in-title">
      <p id="hero-signed-in-title" className={styles.welcome}>
        {handle ? t('heroSignedIn.welcomeNamed', { handle }) : t('heroSignedIn.welcome')}
      </p>

      <ul className={styles.stats}>
        {stats.streak > 0 ? (
          <li className={styles.stat}>
            <span className={styles.statIcon} aria-hidden>
              {streakFireEmoji(stats.streak)}
            </span>
            <span className={styles.statValue}>
              {t(
                stats.streak === 1 ? 'heroSignedIn.streakOne' : 'heroSignedIn.streakMany',
                { count: stats.streak },
              )}
            </span>
          </li>
        ) : null}
        <li className={styles.stat}>
          <span className={styles.statIcon} aria-hidden>
            ☕
          </span>
          <span className={styles.statValue}>
            {t(
              stats.total === 1 ? 'heroSignedIn.cupsOne' : 'heroSignedIn.cupsMany',
              { count: stats.total },
            )}
          </span>
        </li>
        <li className={styles.stat}>
          <span className={styles.statIcon} aria-hidden>
            📍
          </span>
          <span className={styles.statValue}>
            {t(
              stats.shops === 1 ? 'heroSignedIn.shopsOne' : 'heroSignedIn.shopsMany',
              { count: stats.shops },
            )}
          </span>
        </li>
      </ul>

      {lastVisit ? (
        <p className={styles.lastVisit}>
          {t('heroSignedIn.lastVisitLabel')}{' '}
          <strong className={styles.lastVisitName}>{lastVisit.name}</strong>{' '}
          <span className={styles.lastVisitWhen}>
            · {formatRelativeTime(lastVisit.ts, locale)}
          </span>
        </p>
      ) : null}

      <a className={styles.passportLink} href={passportHref}>
        {t('heroSignedIn.viewPassport')} →
      </a>
    </section>
  );
}
