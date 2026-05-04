import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useI18n } from '../context/I18nContext';
import styles from './UpdateToast.module.css';

/**
 * Banner shown when the service worker has installed a newer version.
 *
 * Without this, users on long-open tabs keep seeing the JS chunks
 * cached at first paint — even though `registerType: 'autoUpdate'`
 * silently swaps the SW in the background. The user has no signal that
 * a new version exists; bug fixes ship invisibly until the user happens
 * to hit reload.
 *
 * Pattern: render a small, non-modal pill in the corner with two
 * actions — refresh (calls `updateServiceWorker(true)` which reloads
 * the page) and dismiss (clears the visible flag; the next deploy will
 * show it again). We delay first appearance by 30s post-mount so a
 * fresh load doesn't immediately flash a "new version available"
 * notice from a SW that registered milliseconds before the React tree.
 */
export function UpdateToast() {
  const { t } = useI18n();
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    /* Default options are fine — vite-plugin-pwa with registerType:
     * 'autoUpdate' already wires periodic updates. We just want the
     * `needRefresh` signal to surface in the UI. */
  });

  /* Suppress for the first 30s after mount. The SW registration races
   * the React render on a fresh load; without the delay we'd briefly
   * show "new version" to a user who's already on the new version. */
  const [allowShow, setAllowShow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setAllowShow(true), 30_000);
    return () => window.clearTimeout(id);
  }, []);

  if (!needRefresh || !allowShow) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.message}>{t('updateToast.message')}</span>
      <button
        type="button"
        className={styles.refresh}
        onClick={() => void updateServiceWorker(true)}
      >
        {t('updateToast.refresh')}
      </button>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => setNeedRefresh(false)}
        aria-label={t('updateToast.dismissAria')}
      >
        ×
      </button>
    </div>
  );
}
