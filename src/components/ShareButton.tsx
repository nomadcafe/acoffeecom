import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { CoffeeShop } from '../types';
import { useI18n } from '../context/I18nContext';
import { buildMeetupShareUrl, shareLink } from '../utils/shareLink';
import { track } from '../utils/analytics';
import styles from './ShareButton.module.css';

type Flash = 'ok' | 'error' | null;

export function ShareButton({ shop }: { shop: CoffeeShop }) {
  const { t } = useI18n();
  const [flash, setFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState(false);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => {
      setFlash(null);
      setFlashLabel(null);
    }, 2500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const url = buildMeetupShareUrl(shop.id);
    try {
      const result = await shareLink({
        title: t('share.meetupTitle', { name: shop.name }),
        text: t('share.meetupText', { name: shop.name }),
        url,
      });
      if (result === 'cancelled') {
        // User backed out of the share sheet — stay quiet, no flash, no track.
        return;
      }
      if (result === 'shared' || result === 'copied') {
        setFlash('ok');
        setFlashLabel(t(result === 'shared' ? 'share.shared' : 'share.copied'));
        track('meetup_shared', { placeId: shop.id, result });
      } else {
        setFlash('error');
        setFlashLabel(t('share.error'));
        track('meetup_shared', { placeId: shop.id, result: 'error' });
      }
    } catch {
      setFlash('error');
      setFlashLabel(t('share.error'));
      track('meetup_shared', { placeId: shop.id, result: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const label = flashLabel ?? t('share.meetup');

  return (
    <button
      type="button"
      className={`${styles.shareButton} ${flash === 'ok' ? styles.flash : ''}`}
      onClick={(e) => void onClick(e)}
      disabled={busy}
      aria-label={label}
      title={label}
    >
      {flash === 'ok' ? (
        <span className={styles.checkmark} aria-hidden>
          ✓
        </span>
      ) : (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden focusable="false">
          <path
            d="M12 3l-4 4h3v8h2V7h3l-4-4zM5 15v5h14v-5h-2v3H7v-3H5z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}
