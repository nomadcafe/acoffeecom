import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext';
import { authClient } from '../utils/authClient';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

// Google's official "G" mark — required for "Continue with Google"
// buttons under their branding guidelines. SVG inline so we don't pull
// in another asset. Module-scope so the component identity stays stable
// across renders.
function GoogleGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

type Phase = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Build a Better-Auth-safe relative callbackURL from the current page.
 *
 * Better Auth's relative-path validation regex
 * (`^\/(?!...)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$`) rejects commas and
 * non-ASCII characters — addresses like "Funabashi, Chiba" or
 * "〒150-6145 Tokyo" trigger INVALID_CALLBACK_URL. Worse, the magic-link
 * verify route runs `decodeURIComponent` on top of the HTTP layer's
 * already-decoded query value, so the string is *double-decoded* before
 * the regex check. We compensate by encoding the query portion an extra
 * time: after Better Auth's double-decode the resulting URL still has
 * `%2C` / `%E3%80%92` etc. literal, which the regex tolerates.
 *
 * The path itself is left untouched so the regex still recognises this
 * as a relative path (it requires a leading `/`, not `%2F`).
 */
function buildCallbackURL(): string {
  const path = window.location.pathname;
  const search = window.location.search;
  if (!search || search === '?') return path;
  return path + '?' + encodeURIComponent(search.slice(1));
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset phase/error/email when the modal transitions from closed → open.
  // Using a render-time comparison instead of a setState-inside-useEffect
  // avoids the cascading-renders lint and is the React-recommended pattern
  // for derived state from a prop transition.
  const [openSeen, setOpenSeen] = useState(open);
  if (openSeen !== open) {
    setOpenSeen(open);
    if (open) {
      setPhase('idle');
      setErrorMsg(null);
      setEmail('');
    }
  }

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // BFCache restoration after canceling Google OAuth would leave the
  // modal stuck in 'sending' (button disabled, no path forward) because
  // signIn.social() does a synchronous window.location.href without a
  // chance to revert. Reset to idle when the page is restored from
  // history, and also when it becomes visible again — so the back-button
  // path always lands on a usable modal.
  useEffect(() => {
    if (!open) return;
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setPhase('idle');
    }
    function onVisible() {
      if (document.visibilityState === 'visible') {
        setPhase((p) => (p === 'sending' ? 'idle' : p));
      }
    }
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPhase('sending');
    setErrorMsg(null);
    try {
      const { error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: buildCallbackURL(),
      });
      if (error) {
        setPhase('error');
        setErrorMsg(error.message ?? t('auth.error'));
        return;
      }
      setPhase('sent');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : t('auth.error'));
    }
  }

  async function handleGoogleSignIn() {
    setPhase('sending');
    setErrorMsg(null);
    try {
      // Better Auth handles the OAuth dance — redirects to Google, comes
      // back to /api/auth/callback/google, which sets the cookie and
      // sends the visitor to callbackURL.
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: buildCallbackURL(),
      });
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : t('auth.error'));
    }
  }

  function handleResend() {
    setPhase('idle');
  }

  // Render via portal to document.body. The modal is invoked from buttons
  // deep inside the cafe card, which lives inside the BottomSheet — and
  // BottomSheet animates `transform`. A `transform`'d ancestor breaks
  // `position: fixed`, anchoring the backdrop to the BottomSheet's box
  // instead of the viewport. Visually this looks like a duplicate /
  // mis-positioned modal that flickers as the transform updates. Portal
  // pulls the modal out of that subtree so the backdrop is always
  // viewport-anchored.
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className={styles.dialog}>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('auth.close')}
        >
          ×
        </button>

        {phase === 'sent' ? (
          <div className={styles.sentBox}>
            <div className={styles.sentEmoji}>📬</div>
            <h2 className={styles.sentTitle}>{t('auth.sentTitle')}</h2>
            <p className={styles.sentBody}>
              {t('auth.sentBody', { email })}
            </p>
            <button type="button" className={styles.resend} onClick={handleResend}>
              {t('auth.sentResend')}
            </button>
          </div>
        ) : (
          <>
            <h2 id="auth-modal-title" className={styles.title}>
              {t('auth.modalTitle')}
            </h2>
            <p className={styles.subtitle}>{t('auth.modalSubtitle')}</p>

            <button
              type="button"
              className={styles.googleButton}
              onClick={() => void handleGoogleSignIn()}
              disabled={phase === 'sending'}
            >
              <GoogleGlyph />
              <span>{t('auth.continueWithGoogle')}</span>
            </button>

            <div className={styles.divider} role="separator" aria-orientation="horizontal">
              <span className={styles.dividerLabel}>{t('auth.orEmail')}</span>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.label} htmlFor="auth-email">
                {t('auth.emailLabel')}
              </label>
              <input
                id="auth-email"
                ref={inputRef}
                className={styles.input}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={phase === 'sending'}
              />

              <button
                type="submit"
                className={styles.submit}
                disabled={phase === 'sending' || !email.trim()}
              >
                {phase === 'sending' ? t('auth.sending') : t('auth.sendButton')}
              </button>

              {phase === 'error' && errorMsg && (
                <p className={styles.error} role="alert">
                  {errorMsg}
                </p>
              )}
            </form>

            <p className={styles.privacy}>{t('auth.privacyNote')}</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
