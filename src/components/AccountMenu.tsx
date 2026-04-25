import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { authClient, useSession } from '../utils/authClient';
import { AuthModal } from './AuthModal';
import { SavePassportToast } from './SavePassportToast';
import styles from './AccountMenu.module.css';

export function AccountMenu() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
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

  if (!session) {
    return (
      <>
        <button
          type="button"
          className={styles.signInButton}
          onClick={() => setModalOpen(true)}
        >
          {t('auth.signIn')}
        </button>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
        <SavePassportToast onSignIn={() => setModalOpen(true)} />
      </>
    );
  }

  const email = session.user.email;
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
