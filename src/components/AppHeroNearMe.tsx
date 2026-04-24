import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { track } from '../utils/analytics';
import styles from './AppHeroNearMe.module.css';

/**
 * Secondary entry point in the hero: "just find me coffee nearby" — no A/B
 * locations needed. Asks for browser geolocation, falls back to the cached
 * IP location that Map.tsx wrote earlier, then kicks off a nearby search.
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
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
      );
    });

    let loc = precise;
    if (!loc) {
      try {
        const raw = sessionStorage.getItem('ipLocation');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            loc = { lat: parsed.lat, lng: parsed.lng };
          }
        }
      } catch {
        // ignore parse errors
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
      <span className={styles.divider} aria-hidden>
        <span className={styles.dividerLabel}>{t('hero.or')}</span>
      </span>
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
