import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { authClient } from '../utils/authClient';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'sending' | 'sent' | 'error';

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('idle');
    setErrorMsg(null);
    setEmail('');
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

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPhase('sending');
    setErrorMsg(null);
    try {
      const { error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: window.location.pathname + window.location.search,
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

  function handleResend() {
    setPhase('idle');
  }

  return (
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
    </div>
  );
}
