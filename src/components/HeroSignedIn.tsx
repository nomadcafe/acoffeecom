import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import { usePassportStats } from '../hooks/usePassportStats';
import { streakFireEmoji } from '../utils/streak';
import { formatRelativeTime } from '../utils/relativeTime';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { PASSPORT_PATH } from '../routes';
import { avatarGradient } from '../utils/avatarGradient';
import styles from './HeroSignedIn.module.css';

interface SessionUserView {
  name?: string;
  email?: string;
  username?: string | null;
  image?: string | null;
}

/**
 * Personal-state strip shown to signed-in users in the hero, in the slot
 * where HomeFeatureShowcase sits for anonymous visitors. Returning users
 * already know what the product does — instead of marketing, they get
 * "where you left off": avatar, greeting, public profile link, streak,
 * total cups + cafés, and last visit (click-through to /passport).
 *
 * Empty-passport users (just signed up, never tracked a visit) get
 * nothing here — falls back to the existing tagline + form path so a
 * brand-new account doesn't see a half-empty stats card.
 *
 * All data is computed client-side from `visitedShops` + the session;
 * no extra fetches, no loading state. Hides during search (parent
 * AppHero guards midpoint / isLoading).
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

  // Hide for users with no passport activity — see usePassportStats. The
  // tagline + search-form path below the hero takes over for them.
  if (stats.total === 0) return null;

  const sessionUser = (session?.user ?? undefined) as SessionUserView | undefined;
  const username = sessionUser?.username?.trim() || '';
  const handle = username || sessionUser?.name?.split(' ')[0] || '';
  const avatarSeed = username || sessionUser?.email || sessionUser?.name || 'guest';
  const avatarInitial = (handle || avatarSeed).slice(0, 1).toUpperCase();
  const avatarImage = sessionUser?.image ?? null;

  const passportHref = buildLocalizedPathname(PASSPORT_PATH, locale);
  const profileHref = username ? buildLocalizedPathname(`/${username}`, locale) : null;

  // Greeting tracks the user's local hour. Three buckets is plenty — over-
  // segmenting (e.g. "good night") feels gimmicky and reads weird if the
  // user opens the tab at 11:55pm and the greeting flips at midnight.
  const hour = new Date().getHours();
  const period: 'morning' | 'afternoon' | 'evening' =
    hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const greetingKey = handle
    ? `heroSignedIn.${period}Named`
    : `heroSignedIn.${period}`;
  const greeting = t(greetingKey, handle ? { handle } : undefined);

  return (
    <section className={styles.wrap} aria-labelledby="hero-signed-in-title">
      <div className={styles.identity}>
        <div
          className={styles.avatar}
          style={avatarImage ? undefined : { background: avatarGradient(avatarSeed) }}
          aria-hidden
        >
          {avatarImage ? (
            <img src={avatarImage} alt="" className={styles.avatarImage} />
          ) : (
            <span className={styles.avatarInitial}>{avatarInitial}</span>
          )}
        </div>
        <div className={styles.identityText}>
          {/* h1 so the signed-in home has a real top-of-page heading.
              Without it, SR users navigating by heading land in the
              page with no orientation cue (the public-marketing showcase
              has its own h1 inside HomeFeatureShowcase, but that branch
              never renders for signed-in users). Visual styling stays
              identical via the existing .greeting class. */}
          <h1 id="hero-signed-in-title" className={styles.greeting}>
            {greeting}
          </h1>
          {profileHref ? (
            <a className={styles.profileLink} href={profileHref}>
              acoffee.com/<span className={styles.profileSlug}>{username}</span>
            </a>
          ) : null}
        </div>
      </div>

      <div className={styles.statsRow}>
        {stats.streak > 0 ? (
          <div className={styles.streak}>
            <span className={styles.streakIcon} aria-hidden>
              {streakFireEmoji(stats.streak)}
            </span>
            <span className={styles.streakNumber}>{stats.streak}</span>
            <span className={styles.streakLabel}>
              {t(stats.streak === 1 ? 'heroSignedIn.streakLabelOne' : 'heroSignedIn.streakLabelMany')}
            </span>
          </div>
        ) : null}

        <ul className={styles.stats}>
          {stats.today > 0 ? (
            <li className={`${styles.stat} ${styles.statFresh}`}>
              <span className={styles.statIcon} aria-hidden>
                ☕
              </span>
              <span className={styles.statValue}>
                {t(
                  stats.today === 1 ? 'heroSignedIn.todayOne' : 'heroSignedIn.todayMany',
                  { count: stats.today },
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
      </div>

      <div className={styles.footer}>
        {lastVisit ? (
          <a className={styles.lastVisit} href={passportHref}>
            <span className={styles.lastVisitLabel}>{t('heroSignedIn.lastVisitLabel')}</span>{' '}
            <strong className={styles.lastVisitName}>{lastVisit.name}</strong>{' '}
            <span className={styles.lastVisitWhen}>
              · {formatRelativeTime(lastVisit.ts, locale)}
            </span>
          </a>
        ) : (
          <span aria-hidden />
        )}
        <a className={styles.passportLink} href={passportHref}>
          {t('heroSignedIn.viewPassport')} →
        </a>
      </div>
    </section>
  );
}
