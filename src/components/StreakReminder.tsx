import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { usePassportStats } from '../hooks/usePassportStats';
import { streakFireEmoji } from '../utils/streak';
import { track } from '../utils/analytics';
import styles from './StreakReminder.module.css';

const MIN_STREAK = 2;
const HOUR_THRESHOLD = 18; // local time after which we start nudging

const STORAGE_KEY = 'ACoffee-meetup-streak-reminder-dismissed';

function localDateKey(now: number = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
    /* ignore */
  }
}

/**
 * Late-day nudge to keep a streak alive: appears after 6 PM local when the
 * user has a 2+ day streak and hasn't stamped today. Dismiss persists for
 * the rest of the day. Quieter than a notification — banner only, no modal.
 */
export function StreakReminder() {
  const { t } = useI18n();
  const { visitedShops } = useApp();
  const { streak, today } = usePassportStats(visitedShops);
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedToday());

  const localHour = new Date().getHours();
  const visible =
    streak >= MIN_STREAK && today === 0 && localHour >= HOUR_THRESHOLD && !dismissed;

  useEffect(() => {
    if (visible) track('streak_reminder_shown', { streak });
  }, [visible, streak]);

  if (!visible) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <p className={styles.message}>
        <span className={styles.fires} aria-hidden>{streakFireEmoji(streak)}</span>
        {t('streak.reminder', { count: streak })}
      </p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => {
          markDismissed();
          setDismissed(true);
          track('streak_reminder_dismissed', { streak });
        }}
        aria-label={t('streak.dismissAria')}
      >
        {t('streak.dismiss')}
      </button>
    </div>
  );
}
