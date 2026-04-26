import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { usePassportStats } from '../hooks/usePassportStats';
import { track } from '../utils/analytics';
import styles from './CoffeeNudge.module.css';

const THRESHOLD = 3;

/** Local date as YYYY-MM-DD so the dismiss flag resets at the user's midnight, not UTC's. */
function localDateKey(now: number = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STORAGE_KEY = 'ACoffee-meetup-nudge-dismissed';

function isDismissedToday(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === localDateKey();
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, localDateKey());
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Mild banner shown when the user has stamped ≥ 3 cups today. Dismiss persists
 * for the rest of the local day via sessionStorage. No modal, no countdown,
 * no nag — just one line of "you might want some water" the user can close.
 */
export function CoffeeNudge() {
  const { t } = useI18n();
  const { visitedShops } = useApp();
  const { today } = usePassportStats(visitedShops);
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedToday());

  const visible = today >= THRESHOLD && !dismissed;

  useEffect(() => {
    if (visible) track('nudge_shown', { todayCount: today });
  }, [visible, today]);

  if (!visible) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <p className={styles.message}>{t('nudge.threeCups')}</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => {
          markDismissed();
          setDismissed(true);
          track('nudge_dismissed', { todayCount: today });
        }}
        aria-label={t('nudge.dismissAria')}
      >
        {t('nudge.dismiss')}
      </button>
    </div>
  );
}
