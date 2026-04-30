import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { formatAbsoluteDate } from '../utils/relativeTime';
import { AccountMenu } from './AccountMenu';
import { BookingWidget } from './BookingWidget';
import { HeaderNavLinks } from './HeaderNavLinks';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SocialIcon } from './SocialIcon';
import { SyncIndicator } from './SyncIndicator';
import { avatarGradient } from '../utils/avatarGradient';
import { identifyBrand } from '../utils/socialBrand';
import styles from './PublicProfilePage.module.css';

interface PublicShop {
  id: string;
  name: string;
  city: string | null;
  visits: number;
}

interface SocialLink {
  label: string;
  url: string;
}

interface FeaturedCafeLinks {
  instagram: string | null;
  website: string | null;
  menu: string | null;
  bookingExternal: string | null;
}

interface FeaturedCafePassport {
  visits: number;
  lastVisitMs: number;
}

interface PublicFeaturedCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  relation: 'owned' | 'favorite';
  position: number;
  note: string | null;
  links: FeaturedCafeLinks;
  ownerPinnedNote: string | null;
  ownerVerified: boolean;
  passport: FeaturedCafePassport | null;
}

interface PublicProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  socialLinks: SocialLink[];
  featuredCafes: PublicFeaturedCafe[];
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
  const initialChar = (profile.displayName ?? profile.username)[0]?.toUpperCase() ?? '?';

  return (
    <>
      <section className={styles.heroCard} aria-label={t('profile.heroAria')}>
        <div
          className={styles.avatar}
          aria-hidden
          style={{ background: avatarGradient(profile.username) }}
        >
          {initialChar}
        </div>
        {profile.displayName ? (
          <h1 className={styles.handle}>{profile.displayName}</h1>
        ) : null}
        <div
          className={profile.displayName ? styles.handleSecondary : styles.handle}
          aria-label={profile.displayName ? `@${profile.username}` : undefined}
        >
          <span className={styles.handleAt}>@</span>
          {profile.username}
        </div>
        {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
        {profile.socialLinks.length > 0 ? (
          <ul className={styles.socialLinkList}>
            {profile.socialLinks.map((l) => {
              const brand = identifyBrand(l.url);
              return (
                <li key={`${l.label}-${l.url}`}>
                  <a
                    className={styles.socialLink}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    <SocialIcon brand={brand} className={styles.socialLinkIcon} />
                    <span>{l.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className={styles.memberSince}>
          {t('profile.memberSince', { date: formatAbsoluteDate(profile.memberSince, locale) })}
        </p>
      </section>

      {profile.featuredCafes.length > 0 ? (
        <section className={styles.section} aria-label={t('profile.featuredCafesTitle')}>
          <h2 className={styles.sectionTitle}>{t('profile.featuredCafesTitle')}</h2>
          <ul className={styles.featuredCafeList}>
            {profile.featuredCafes.map((cafe) => (
              <FeaturedCafeCard key={cafe.placeId} cafe={cafe} />
            ))}
          </ul>
        </section>
      ) : null}

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

      <BookingWidget username={profile.username} displayName={profile.displayName} />
    </>
  );
}

/** Single featured café card. Two visual variants driven by `relation`:
 *
 *  - `owned`: emphasises trust + freshness. Verified ✓ next to the name
 *    when the email-domain auto-check passed; "what's brewing this week"
 *    pinned note above the static blurb so visitors see the latest first;
 *    full link strip (Instagram, website, menu, reservations).
 *
 *  - `favorite`: emphasises personal endorsement. No badge; passport
 *    tie-in line ("been here N times, last visit X days ago") for
 *    credibility; we surface a single best link (Instagram > website >
 *    menu) instead of a wide chip strip — favorites are a recommendation,
 *    not a business listing.
 */
function FeaturedCafeCard({ cafe }: { cafe: PublicFeaturedCafe }) {
  const { t, locale } = useI18n();
  const mapsHref =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cafe.name + ' ' + cafe.address)}` +
    `&query_place_id=${encodeURIComponent(cafe.placeId)}`;

  // Pick the single highest-priority link for favorite cards.
  const favoriteLink =
    cafe.links.instagram ?? cafe.links.website ?? cafe.links.menu ?? cafe.links.bookingExternal;

  return (
    <li
      className={`${styles.featuredCafeCard}${
        cafe.relation === 'owned' ? ' ' + styles.featuredCafeCardOwned : ''
      }`}
    >
      <div className={styles.featuredCafeHead}>
        <a
          className={styles.featuredCafeName}
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {cafe.name}
          {cafe.relation === 'owned' && cafe.ownerVerified ? (
            <span
              className={styles.featuredCafeVerified}
              title={t('profile.featuredCafeVerifiedTitle')}
              aria-label={t('profile.featuredCafeVerifiedTitle')}
            >
              {' '}✓
            </span>
          ) : null}
        </a>
        <span className={styles.featuredCafeRelationTag}>
          {cafe.relation === 'owned'
            ? t('profile.featuredCafeRelationOwned')
            : t('profile.featuredCafeRelationFavorite')}
        </span>
      </div>
      <div className={styles.featuredCafeAddress}>{cafe.address}</div>

      {/* Pinned weekly note — owned-only and only when populated. Stands
          above the static blurb because it's the freshest signal. */}
      {cafe.relation === 'owned' && cafe.ownerPinnedNote ? (
        <div className={styles.featuredCafePinned}>
          <span className={styles.featuredCafePinnedLabel}>
            {t('profile.featuredCafePinnedLabel')}
          </span>
          <span className={styles.featuredCafePinnedText}>{cafe.ownerPinnedNote}</span>
        </div>
      ) : null}

      {cafe.note ? <p className={styles.featuredCafeNote}>{cafe.note}</p> : null}

      {/* Passport tie-in: only on favorite cards, only when the cafe is
          actually in the owner's passport. "Been here 23 times, last
          visit 3 days ago" reads as endorsement; on owned cards the same
          line would read as the owner counting their own visits, which
          is weird. */}
      {cafe.relation === 'favorite' && cafe.passport ? (
        <p className={styles.featuredCafePassport}>
          {t('profile.featuredCafePassportLine', {
            count: cafe.passport.visits,
            date: formatAbsoluteDate(cafe.passport.lastVisitMs, locale),
          })}
        </p>
      ) : null}

      {/* Link strip: full chip row for owned cards, single link for
          favorites (set above). Slots collapse silently when empty. */}
      {cafe.relation === 'owned' ? (
        <FeaturedCafeOwnedLinks links={cafe.links} />
      ) : favoriteLink ? (
        <a
          className={styles.featuredCafeFavoriteLink}
          href={favoriteLink}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {t('profile.featuredCafeFavoriteLinkLabel')}
        </a>
      ) : null}
    </li>
  );
}

/** Chip strip for owned-cafe links. Each present link becomes its own
 *  pill so visitors can land directly on Instagram / menu / reservations
 *  without a click extra. Order is fixed: Instagram → website → menu →
 *  reservations, mirroring how a customer typically researches a cafe. */
function FeaturedCafeOwnedLinks({ links }: { links: FeaturedCafeLinks }) {
  const { t } = useI18n();
  const slots: Array<{ key: keyof FeaturedCafeLinks; label: string }> = [
    { key: 'instagram', label: t('profile.featuredCafeLinkInstagram') },
    { key: 'website', label: t('profile.featuredCafeLinkWebsite') },
    { key: 'menu', label: t('profile.featuredCafeLinkMenu') },
    { key: 'bookingExternal', label: t('profile.featuredCafeLinkBooking') },
  ];
  const present = slots.filter((s) => !!links[s.key]);
  if (present.length === 0) return null;
  return (
    <div className={styles.featuredCafeLinkStrip}>
      {present.map(({ key, label }) => (
        <a
          key={key}
          className={styles.featuredCafeLinkChip}
          href={links[key] ?? '#'}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {label}
        </a>
      ))}
    </div>
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
