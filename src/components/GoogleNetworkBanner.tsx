import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useGoogleNetworkStatus } from '../utils/networkStatus';
import styles from './GoogleNetworkBanner.module.css';

/**
 * Top-of-page banner shown when autocomplete / Place.searchNearby calls fail
 * with a network-class error (DNS, connection refused, browser offline). The
 * Maps SDK has to talk directly to googleapis.com — there's no proxying we
 * can do — so the user-facing fix is "open VPN / check connection".
 *
 * Auto-clears the moment any Google call succeeds (fires the OK signal),
 * which means once the user opens their VPN the banner disappears on the
 * next keystroke / search without needing the dismiss button. The dismiss
 * button is per-page-load, just to let users hide it while typing.
 */
export function GoogleNetworkBanner() {
  const { t } = useI18n();
  const unreachable = useGoogleNetworkStatus();
  const [dismissed, setDismissed] = useState(false);

  if (!unreachable || dismissed) return null;

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.icon} aria-hidden>📡</span>
      <p className={styles.message}>
        <span className={styles.title}>{t('errors.networkTitle')}</span>
        {t('errors.networkBody')}
      </p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => setDismissed(true)}
        aria-label={t('errors.networkDismissAria')}
      >
        {t('errors.networkDismiss')}
      </button>
    </div>
  );
}
