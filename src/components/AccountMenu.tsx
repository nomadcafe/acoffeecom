import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { authClient, useSession } from '../utils/authClient';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { ACCOUNT_PATH, BOOKINGS_PATH } from '../routes';
import { avatarGradient } from '../utils/avatarGradient';
import { SavePassportToast } from './SavePassportToast';
import styles from './AccountMenu.module.css';

// AuthModal pulls in @better-auth/client + the email/magic-link UI; most
// visitors never sign in, so deferring it keeps the main chunk slim.
const AuthModal = lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));

export function AccountMenu() {
  const { t, locale } = useI18n();
  const { data: session, isPending } = useSession();
  const accountHref = buildLocalizedPathname(ACCOUNT_PATH, locale);
  const bookingsHref = buildLocalizedPathname(BOOKINGS_PATH, locale);
  const [modalOpen, setModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onClickAway(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropdownOpen(false);
    }
    window.addEventListener('mousedown', onClickAway);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClickAway);
      window.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  if (isPending) {
    return <div className={styles.placeholder} aria-hidden="true" />;
  }

  // `session` can be a truthy object with no `user` when the /api/auth endpoint
  // isn't reachable (e.g. plain `vite` instead of `wrangler pages dev`). Treat
  // a missing email the same as no session so the menu degrades to sign-in.
  const email = session?.user?.email;
  if (!email) {
    return (
      <>
        <button
          type="button"
          className={styles.signInButton}
          onClick={() => setModalOpen(true)}
        >
          {t('auth.signIn')}
        </button>
        {/* Only mount the lazy modal once the user has actually opened it,
            avoiding the chunk fetch for visitors who never sign in. */}
        {modalOpen ? (
          <Suspense fallback={null}>
            <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
          </Suspense>
        ) : null}
        <SavePassportToast onSignIn={() => setModalOpen(true)} />
      </>
    );
  }

  const initial = (email[0] ?? '?').toUpperCase();

  async function handleSignOut() {
    setDropdownOpen(false);
    await authClient.signOut();
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.avatarButton}
        style={{ background: avatarGradient(email) }}
        onClick={() => setDropdownOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
        aria-label={t('auth.account')}
      >
        {initial}
      </button>
      {dropdownOpen && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.identity}>
            {t('auth.signedInAs', { email })}
          </div>
          <a
            className={styles.menuItem}
            role="menuitem"
            href={accountHref}
            onClick={() => setDropdownOpen(false)}
          >
            {t('auth.accountSettings')}
          </a>
          <a
            className={styles.menuItem}
            role="menuitem"
            href={bookingsHref}
            onClick={() => setDropdownOpen(false)}
          >
            {t('auth.myBookings')}
          </a>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={handleSignOut}
          >
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
