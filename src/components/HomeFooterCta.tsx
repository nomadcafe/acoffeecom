import { lazy, Suspense, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { ACCOUNT_PATH } from '../routes';
import styles from './HomeFooterCta.module.css';

// AuthModal pulls in @better-auth/client + the magic-link UI; mirror the
// AccountMenu pattern so anonymous visitors who never tap the strip don't
// pay the chunk cost.
const AuthModal = lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));

/**
 * Anonymous-only one-line promo for `acoffee.com/yourname` public profiles.
 * Lives at the bottom of the home page (above SiteBottomNav on mobile, in
 * normal flow on desktop where the bottom nav is hidden). Hidden once the
 * user has searched — the BottomSheet/map layout owns the bottom of the
 * viewport then and a second strip would just compete for taps. Hidden for
 * signed-in users; their next-step is account → username, not "discover that
 * profiles exist."
 *
 * Click → AuthModal → after sign-in lands on `/account?focus=username` so
 * AccountPage can scroll to and focus the slug picker (the whole reason the
 * visitor tapped the strip).
 */
export function HomeFooterCta() {
  const { t, locale } = useI18n();
  const { midpoint, isLoading } = useApp();
  const { data: session, isPending } = useSession();
  const [modalOpen, setModalOpen] = useState(false);

  // Auth not wired in this build — the strip would dead-end into a modal
  // that can't actually sign anyone in.
  if (import.meta.env.VITE_AUTH_ENABLED !== 'true') return null;

  // Don't flash the strip during the session-fetch race; once we know the
  // user is signed in, suppress permanently for this mount.
  if (isPending) return null;
  if (session?.user) return null;

  // Search in flight or resolved → BottomSheet/map layout takes over the
  // bottom of the screen on mobile and the strip becomes noise.
  if (midpoint || isLoading) return null;

  const callbackURL = `${buildLocalizedPathname(ACCOUNT_PATH, locale)}?focus=username`;

  return (
    <>
      <aside className={styles.strip} aria-label={t('homeCta.aria')}>
        <button type="button" className={styles.cta} onClick={() => setModalOpen(true)}>
          <span className={styles.icon} aria-hidden>
            ☕
          </span>
          <span className={styles.copy}>
            <span className={styles.lead}>{t('homeCta.lead')}</span>
            <span className={styles.url}>
              acoffee.com/<span className={styles.urlSlug}>{t('homeCta.slugPlaceholder')}</span>
            </span>
          </span>
          <span className={styles.arrow} aria-hidden>
            →
          </span>
        </button>
      </aside>
      {modalOpen ? (
        <Suspense fallback={null}>
          <AuthModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            callbackURL={callbackURL}
          />
        </Suspense>
      ) : null}
    </>
  );
}
