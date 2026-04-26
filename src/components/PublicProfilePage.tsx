import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { formatAbsoluteDate } from '../utils/relativeTime';
import { HeaderNavLinks } from './HeaderNavLinks';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './PublicProfilePage.module.css';

interface PublicShop {
  id: string;
  name: string;
  city: string | null;
  visits: number;
}

interface PublicProfile {
  username: string;
  memberSince: number;
  cups: number;
  shops: number;
  streak: number;
  topShops: PublicShop[];
}

type Fetch =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: PublicProfile }
  | { kind: 'not-found' }
  | { kind: 'error' };

interface Props {
  username: string;
}

/**
 * Future Pro entry point — `acoffee.com/yourname`. Public, unauth, served
 * straight from the profile API. Today this just renders aggregate stats and
 * a top-cafés list; the booking surface ("Book a coffee with me") is the
 * next phase and lives behind a "coming soon" CTA for now.
 *
 * Returns the same 404-styled state for both "user doesn't exist" and "user
 * exists but profile is private", because the API answers them identically.
 */
export function PublicProfilePage({ username }: Props) {
  const { t, locale } = useI18n();
  const homeHref = buildLocalizedPathname('/', locale);
  const [state, setState] = useState<Fetch>({ kind: 'loading' });

  // Reset to loading when the username prop changes — done by tracking
  // it in state alongside the fetch state, which keeps everything inside a
  // single render commit (no in-effect setState linter complaint).
  const [activeUsername, setActiveUsername] = useState(username);
  if (activeUsername !== username) {
    setActiveUsername(username);
    setState({ kind: 'loading' });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error' });
          return;
        }
        const profile = (await res.json()) as PublicProfile;
        setState({ kind: 'ready', profile });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
            <span className={styles.logoWordmark}>ACoffee</span>
          </a>
          <HeaderNavLinks />
          <div className={styles.headerAside}>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {state.kind === 'loading' ? (
          <ProfileSkeleton />
        ) : state.kind === 'ready' ? (
          <ProfileBody profile={state.profile} />
        ) : (
          <NotFound homeHref={homeHref} />
        )}
      </main>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <div className={styles.heroCard}>
        <div className={styles.avatar} aria-hidden style={{ background: '#d6cdc1' }} />
        <div className={`${styles.skeleton} ${styles.skeletonMed}`} />
        <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
      </div>
      <div className={styles.statsCard}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.statCell}>
            <div className={styles.skeleton} />
            <div className={`${styles.skeleton} ${styles.skeletonShort}`} style={{ marginTop: '0.4rem', marginInline: 'auto' }} />
          </div>
        ))}
      </div>
    </>
  );
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const { t, locale } = useI18n();
  const initial = profile.username[0]?.toUpperCase() ?? '?';

  return (
    <>
      <section className={styles.heroCard} aria-label={t('profile.heroAria')}>
        <div className={styles.avatar} aria-hidden>{initial}</div>
        <h1 className={styles.handle}>
          <span className={styles.handleAt}>@</span>
          {profile.username}
        </h1>
        <p className={styles.memberSince}>
          {t('profile.memberSince', { date: formatAbsoluteDate(profile.memberSince, locale) })}
        </p>
      </section>

      <section className={styles.statsCard} aria-label={t('account.statsTitle')}>
        <div className={styles.statCell}>
          <div className={styles.statValue}>{profile.cups}</div>
          <div className={styles.statLabel}>{t('passport.statVisits')}</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.statValue}>{profile.shops}</div>
          <div className={styles.statLabel}>{t('passport.statShops')}</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.statValue}>{profile.streak}</div>
          <div className={styles.statLabel}>{t('passport.statStreak')}</div>
        </div>
      </section>

      {profile.topShops.length > 0 ? (
        <section className={styles.section} aria-label={t('profile.topShopsTitle')}>
          <h2 className={styles.sectionTitle}>{t('profile.topShopsTitle')}</h2>
          <ol className={styles.shopList}>
            {profile.topShops.map((s) => (
              <li key={s.id} className={styles.shopRow}>
                <span className={styles.shopName}>
                  {s.name}
                  {s.city ? <span className={styles.shopCity}> · {s.city}</span> : null}
                </span>
                <span className={styles.shopVisits}>
                  {t('profile.shopVisits', { count: s.visits })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className={styles.bookSection} aria-label={t('profile.bookTitle')}>
        <p className={styles.bookHint}>{t('profile.bookHint')}</p>
        <button type="button" className={styles.bookButton} disabled>
          {t('profile.bookComingSoon')}
        </button>
      </section>
    </>
  );
}

function NotFound({ homeHref }: { homeHref: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.notFound}>
      <div className={styles.notFoundEmoji} aria-hidden>☕</div>
      <p>{t('profile.notFound')}</p>
      <a className={styles.notFoundCta} href={homeHref}>
        {t('account.goHome')}
      </a>
    </div>
  );
}
