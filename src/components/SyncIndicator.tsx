import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import styles from './SyncIndicator.module.css';

/**
 * Tiny header badge that surfaces cloud-sync state to authenticated users.
 * Renders nothing for anonymous users (they have nothing being synced) and
 * nothing in the steady-state idle/no-pending case so the header stays
 * uncluttered when there's no news to share.
 */
export function SyncIndicator() {
  const { t } = useI18n();
  const { syncStatus, syncPending } = useApp();
  const { data: session } = useSession();

  const signedIn = !!session?.user?.id;
  if (!signedIn) return null;

  // No active op + nothing waiting → render nothing.
  if (syncStatus === 'idle' && syncPending === 0) return null;

  const countBadge = syncPending > 0 ? (
    <span className={styles.count} aria-hidden="true">{syncPending}</span>
  ) : null;

  if (syncStatus === 'syncing') {
    const label = t('sync.syncing');
    return (
      <span
        className={`${styles.indicator} ${styles.syncing}`}
        role="status"
        aria-live="polite"
        title={syncPending > 0 ? t('sync.pendingTooltip', { count: syncPending }) : label}
      >
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
        {countBadge}
      </span>
    );
  }

  if (syncStatus === 'error') {
    return (
      <span
        className={`${styles.indicator} ${styles.error}`}
        role="status"
        aria-live="polite"
        title={t('sync.errorTooltip')}
      >
        <span className={styles.glyph} aria-hidden="true">⚠</span>
        <span className={styles.label}>{t('sync.error')}</span>
        {countBadge}
      </span>
    );
  }

  if (syncStatus === 'synced' && syncPending === 0) {
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

  // Idle (or briefly post-synced) + queue still has items waiting (offline /
  // backoff). Show a soft pending indicator instead of disappearing — the
  // user has unsent changes and should know.
  return (
    <span
      className={`${styles.indicator} ${styles.pending}`}
      role="status"
      aria-live="polite"
      title={t('sync.pendingTooltip', { count: syncPending })}
    >
      <span className={styles.glyph} aria-hidden="true">↑</span>
      <span className={styles.label}>{t('sync.pending')}</span>
      {countBadge}
    </span>
  );
}
