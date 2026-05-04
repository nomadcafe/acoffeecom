import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useApp } from '../context/AppContext';
import { useSession } from '../utils/authClient';
import { track } from '../utils/analytics';
import {
  VISIT_THRESHOLD,
  isCtaDismissed,
  markCtaDismissed,
} from '../utils/savePassportCta';
import styles from './SavePassportToast.module.css';

interface SavePassportToastProps {
  onSignIn: () => void;
}

export function SavePassportToast({ onSignIn }: SavePassportToastProps) {
  const { t } = useI18n();
  const { visitedShops } = useApp();
  const { data: session, isPending } = useSession();
  const [dismissed, setDismissed] = useState<boolean>(() => isCtaDismissed());
  const count = visitedShops.length;
  const eligible =
    !isPending && !session?.user && count >= VISIT_THRESHOLD && !dismissed;

  // Fire analytics once when the CTA first becomes visible in this session.
  useEffect(() => {
    if (eligible) track('cta_save_passport_shown', { count });
    // We only want to fire on the eligible→true transition, not on every count tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  if (!eligible) return null;

  function handleDismiss() {
    track('cta_save_passport_dismissed', { count });
    markCtaDismissed();
    setDismissed(true);
  }

  function handleSignIn() {
    track('cta_save_passport_clicked', { count });
    // Persist dismissal even on click — once they engage, we don't keep nagging
    // if they bail before completing sign-in.
    markCtaDismissed();
    setDismissed(true);
    onSignIn();
  }

  // role=status (a polite live region by default) is the right semantic
  // for a toast — role=dialog without aria-modal/labelledby is misleading
  // to AT and would also fight focus management.
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <button
        type="button"
        className={styles.close}
        onClick={handleDismiss}
        aria-label={t('auth.close')}
      >
        ×
      </button>
      <h3 className={styles.title}>{t('auth.savePassportCtaTitle', { count })}</h3>
      <p className={styles.body}>{t('auth.savePassportCtaBody')}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.dismiss} onClick={handleDismiss}>
          {t('auth.savePassportCtaDismiss')}
        </button>
        <button type="button" className={styles.cta} onClick={handleSignIn}>
          {t('auth.signIn')}
        </button>
      </div>
    </div>
  );
}
