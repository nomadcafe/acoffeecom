import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import { usePassportStats } from '../hooks/usePassportStats';
import { streakFireEmoji } from '../utils/streak';
import { formatRelativeTime } from '../utils/relativeTime';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { ACCOUNT_SETUP_PATH, BOOKINGS_PATH, PASSPORT_PATH } from '../routes';
import { avatarGradient } from '../utils/avatarGradient';
import styles from './HeroSignedIn.module.css';

interface SessionUserView {
  name?: string;
  email?: string;
  username?: string | null;
  image?: string | null;
}

/* Subset of /api/bookings response we actually consume here. The full
 * row carries visitor email/address/lat-lng — we only need status,
 * timing, cafe name, and the visitor's display name. */
interface BookingRow {
  id: string;
  visitorName: string;
  scheduledAt: number;
  durationMinutes: number;
  placeName: string | null;
  status: 'requested' | 'pending' | 'rejected' | 'cancelled';
}

const NEXT_COFFEE_HORIZON_DAYS = 7;

/**
 * Personal-state strip shown to signed-in users in the hero, in the slot
 * where HomeFeatureShowcase sits for anonymous visitors.
 *
 * Three jobs, in priority order:
 *   1. Action items — "you have N new booking requests" / "coffee at 3pm
 *      with @alex" — what a returning host actually wants to see first.
 *   2. Share affordance — copy-to-clipboard for acoffee.com/<username>,
 *      or a "claim your handle" nudge if the user hasn't picked one yet.
 *   3. Passport stats — secondary, only when the user has activity.
 *
 * The previous version showed only #3 and bailed entirely when the user
 * had zero visits — fresh accounts saw nothing here even if they had a
 * pending booking request. New shape always renders so the action cards
 * + share link are always available.
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

  const sessionUser = (session?.user ?? undefined) as SessionUserView | undefined;
  const username = sessionUser?.username?.trim() || '';
  const handle = username || sessionUser?.name?.split(' ')[0] || '';
  const avatarSeed = username || sessionUser?.email || sessionUser?.name || 'guest';
  const avatarInitial = (handle || avatarSeed).slice(0, 1).toUpperCase();
  const avatarImage = sessionUser?.image ?? null;

  const passportHref = buildLocalizedPathname(PASSPORT_PATH, locale);
  const bookingsHref = buildLocalizedPathname(BOOKINGS_PATH, locale);
  const setupHref = buildLocalizedPathname(ACCOUNT_SETUP_PATH, locale);
  const profileHref = username ? buildLocalizedPathname(`/${username}`, locale) : null;

  // Greeting tracks the user's local hour. Three buckets is plenty.
  const hour = new Date().getHours();
  const period: 'morning' | 'afternoon' | 'evening' =
    hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const greetingKey = handle
    ? `heroSignedIn.${period}Named`
    : `heroSignedIn.${period}`;
  const greeting = t(greetingKey, handle ? { handle } : undefined);

  /* Bookings inbox: count of 'requested' rows + the next upcoming
   * 'pending' (host-approved) coffee. Both fetched from the existing
   * /api/bookings endpoint — small payload, already auth-gated. */
  const [pendingRequests, setPendingRequests] = useState<number | null>(null);
  const [nextCoffee, setNextCoffee] = useState<BookingRow | null>(null);
  useEffect(() => {
    if (!sessionUser) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/bookings');
        if (!r.ok) return;
        const json = (await r.json()) as { bookings: BookingRow[] };
        if (cancelled) return;
        const now = Date.now();
        const horizon = now + NEXT_COFFEE_HORIZON_DAYS * 24 * 60 * 60_000;
        const requestedCount = json.bookings.filter((b) => b.status === 'requested').length;
        const upcoming = json.bookings.find(
          (b) => b.status === 'pending' && b.scheduledAt > now && b.scheduledAt < horizon,
        );
        setPendingRequests(requestedCount);
        setNextCoffee(upcoming ?? null);
      } catch {
        /* network blip — leave inbox state null, hero falls back to
         * stats-only without the action cards. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  /* Copy-to-clipboard handler for the share link. Shows a "Copied!"
   * confirmation for ~2s before reverting; ref guards setState if the
   * user navigates away mid-timer. */
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
  async function handleCopy() {
    if (!username || !canCopy) return;
    try {
      await navigator.clipboard.writeText(`https://acoffee.com/${username}`);
      setCopied(true);
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API can reject in non-secure contexts; silently noop. */
    }
  }

  const showStats = stats.total > 0;

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
              page with no orientation cue. */}
          <h1 id="hero-signed-in-title" className={styles.greeting}>
            {greeting}
          </h1>
          {/* Share-link row. When the user has a username, show the URL
              + copy button. When they don't, swap in a CTA pointing at
              /account#username — claiming a handle is the single most
              important thing a fresh user does, and it's been buried in
              the showcase profile slide until now. */}
          {profileHref ? (
            <div className={styles.shareRow}>
              <a className={styles.profileLink} href={profileHref}>
                acoffee.com/<span className={styles.profileSlug}>{username}</span>
              </a>
              {canCopy ? (
                <button
                  type="button"
                  className={`${styles.copyButton}${copied ? ' ' + styles.copyButtonCopied : ''}`}
                  onClick={() => void handleCopy()}
                  aria-label={t('heroSignedIn.copyLinkAria')}
                >
                  {copied ? t('heroSignedIn.copied') : t('heroSignedIn.copyLink')}
                </button>
              ) : null}
            </div>
          ) : (
            <a className={styles.claimHandle} href={setupHref}>
              {t('heroSignedIn.claimHandle')} →
            </a>
          )}
        </div>
      </div>

      {/* Action cards — surface what the host actually came back to do.
          Render only when there's something to act on so the section
          doesn't add empty visual noise on quiet weeks. */}
      {pendingRequests && pendingRequests > 0 ? (
        <a className={`${styles.actionCard} ${styles.actionCardPending}`} href={bookingsHref}>
          <span className={styles.actionIcon} aria-hidden>📥</span>
          <span className={styles.actionText}>
            {t(
              pendingRequests === 1
                ? 'heroSignedIn.pendingRequestOne'
                : 'heroSignedIn.pendingRequestMany',
              { count: pendingRequests },
            )}
          </span>
          <span className={styles.actionArrow} aria-hidden>→</span>
        </a>
      ) : null}

      {nextCoffee ? <NextCoffeeCard booking={nextCoffee} bookingsHref={bookingsHref} /> : null}

      {showStats ? (
        <>
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
        </>
      ) : null}
    </section>
  );
}

function NextCoffeeCard({
  booking,
  bookingsHref,
}: {
  booking: BookingRow;
  bookingsHref: string;
}) {
  const { t, locale } = useI18n();
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(booking.scheduledAt));
  return (
    <a className={`${styles.actionCard} ${styles.actionCardNext}`} href={bookingsHref}>
      <span className={styles.actionIcon} aria-hidden>☕</span>
      <span className={styles.actionText}>
        {t('heroSignedIn.nextCoffee', {
          when,
          name: booking.visitorName,
          cafe: booking.placeName ?? '',
        })}
      </span>
      <span className={styles.actionArrow} aria-hidden>→</span>
    </a>
  );
}
