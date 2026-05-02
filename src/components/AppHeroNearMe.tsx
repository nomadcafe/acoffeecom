import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { track } from '../utils/analytics';
import styles from './AppHeroNearMe.module.css';

/**
 * Secondary entry point in the hero: "just find me coffee nearby" — no A/B
 * locations needed. Asks for browser geolocation; if denied/unavailable, does
 * a fresh IP-location lookup (never reads cached sessionStorage value, since
 * the user may have moved since the page loaded).
 */
export function AppHeroNearMe() {
  const { t } = useI18n();
  const { searchAround } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    track('near_me_clicked');
    setError(null);
    setLoading(true);

    const precise = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        // Force a fresh fix — explicit user click means we must not return
        // a stale "last known position" from when the user was somewhere else.
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
    });

    let loc = precise;
    if (!loc) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const r = await fetch('https://ipapi.co/json/', {
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await r.json();
        if (
          data &&
          !data.error &&
          typeof data.latitude === 'number' &&
          typeof data.longitude === 'number'
        ) {
          loc = { lat: data.latitude, lng: data.longitude };
        }
      } catch {
        // ignore — surfaced as nearMeUnavailable below
      }
    }

    setLoading(false);
    if (!loc) {
      setError(t('list.nearMeUnavailable'));
      return;
    }
    await searchAround(loc);
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void handle()}
        disabled={loading}
      >
        {loading ? t('list.nearMeLoading') : t('list.nearMe')}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
