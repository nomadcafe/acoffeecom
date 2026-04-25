import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import styles from './SyncIndicator.module.css';

/**
 * Tiny header badge that surfaces cloud-sync state to authenticated users.
 * Renders nothing for anonymous users (they have nothing being synced) and
 * nothing in the 'idle' state, so the header stays clean when there's no
 * news to share.
 */
export function SyncIndicator() {
  const { t } = useI18n();
  const { syncStatus } = useApp();
  const { data: session } = useSession();

  const signedIn = !!session?.user?.id;
  if (!signedIn || syncStatus === 'idle') return null;

  if (syncStatus === 'syncing') {
    return (
      <span
        className={`${styles.indicator} ${styles.syncing}`}
        role="status"
        aria-live="polite"
        title={t('sync.syncing')}
      >
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.label}>{t('sync.syncing')}</span>
      </span>
    );
  }

  if (syncStatus === 'synced') {
    return (
      <span
        className={`${styles.indicator} ${styles.synced}`}
        role="status"
        aria-live="polite"
        title={t('sync.synced')}
      >
        <span className={styles.glyph} aria-hidden="true">✓</span>
        <span className={styles.label}>{t('sync.synced')}</span>
      </span>
    );
  }

  // error
  return (
    <span
      className={`${styles.indicator} ${styles.error}`}
      role="status"
      aria-live="polite"
      title={t('sync.errorTooltip')}
    >
      <span className={styles.glyph} aria-hidden="true">⚠</span>
      <span className={styles.label}>{t('sync.error')}</span>
    </span>
  );
}
