import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { track } from '../utils/analytics';
import { NEARBY_SRC_KEY } from './NearbyApproxBanner';
import styles from './AppHeroNearMe.module.css';

type LatLng = { lat: number; lng: number };
type GeoOutcome =
  | { ok: true; pos: LatLng }
  | { ok: false; reason: 'denied' | 'unavailable' };

/**
 * Secondary entry point in the hero: "just find me coffee nearby" — no A/B
 * locations needed.
 *
 * Three explicit outcomes, no silent fallback:
 *   - Browser geolocation succeeds → search runs with the precise fix
 *     (maximumAge:0 so the OS must reacquire, not return a stale position)
 *   - Permission denied → inline error pointing to the address-bar lock
 *     icon. Search does NOT run; the IP fallback's km-scale inaccuracy
 *     is too misleading to substitute for a deliberately blocked GPS.
 *   - Position unavailable (no API / hardware off / timeout) → fall
 *     back to ipapi.co and run the search, but mark NEARBY_SRC_KEY='ip'
 *     so NearbyApproxBanner can warn the user the result may be off
 *     by kilometres.
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
    // Clear the prior click's source flag — we'll set it again based on
    // this click's outcome, so the banner doesn't leak across attempts.
    try { sessionStorage.removeItem(NEARBY_SRC_KEY); } catch { /* private mode */ }

    const geo = await new Promise<GeoOutcome>((resolve) => {
      if (!navigator.geolocation) {
        return resolve({ ok: false, reason: 'unavailable' });
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ ok: true, pos: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
        // PositionError.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE,
        // 3 = TIMEOUT. Only the explicit permission denial gets its own
        // branch — timeout / hardware-off behave like "unavailable".
        (err) => resolve({ ok: false, reason: err.code === 1 ? 'denied' : 'unavailable' }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
    });

    if (geo.ok) {
      try { sessionStorage.setItem(NEARBY_SRC_KEY, 'gps'); } catch { /* private mode */ }
      setLoading(false);
      await searchAround(geo.pos);
      return;
    }

    if (geo.reason === 'denied') {
      setLoading(false);
      setError(t('list.nearMePermissionDenied'));
      return;
    }

    // 'unavailable' path: try IP geocoding. Off by kilometres for most
    // home/cellular ISPs, but better than refusing to do anything when
    // the user clearly clicked a button that says "find coffee near me."
    let loc: LatLng | null = null;
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

    setLoading(false);
    if (!loc) {
      setError(t('list.nearMeUnavailable'));
      return;
    }
    try { sessionStorage.setItem(NEARBY_SRC_KEY, 'ip'); } catch { /* private mode */ }
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
