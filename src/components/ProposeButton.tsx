import { useEffect, useState } from 'react';
import type { CoffeeShop } from '../types';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { track } from '../utils/analytics';
import styles from './ProposeButton.module.css';

interface Props {
  shop: CoffeeShop;
}

type Flash = 'idle' | 'creating' | 'copied' | 'error';

const DEFAULT_LEAD_MINUTES = 90;
const ALT_COUNT = 4;

/**
 * Casual sibling of ShareButton: spins up a `/p/<id>` proposal and
 * copies the link to the clipboard. Default time is "in 90 minutes" —
 * the receiver can shift ±30 min on the proposal page if that doesn't
 * work, or cycle through up to four alternative cafes.
 *
 * Different from ShareButton, which copies a deep-link to the search
 * results with a specific cafe pre-selected. ShareButton sends "look
 * what I found"; this sends "let's go here at this time."
 */
export function ProposeButton({ shop }: Props) {
  const { t } = useI18n();
  const { coffeeShops, addressA, addressB, addressC, agentMode } = useApp();
  const [flash, setFlash] = useState<Flash>('idle');

  useEffect(() => {
    if (flash !== 'copied' && flash !== 'error') return;
    const id = window.setTimeout(() => setFlash('idle'), 2200);
    return () => window.clearTimeout(id);
  }, [flash]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (flash === 'creating') return;
    setFlash('creating');

    // Pull the next N candidates after the chosen shop as alts so the
    // receiver can tap "Next cafe" and get something different without
    // the server re-running a Places search.
    const idx = coffeeShops.findIndex((s) => s.id === shop.id);
    const alts = (idx >= 0 ? coffeeShops.slice(idx + 1) : coffeeShops)
      .slice(0, ALT_COUNT)
      .map((s) => ({
        placeId: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
      }));

    const addresses = [addressA, addressB, addressC].filter((a) => a.trim().length > 0);
    const scheduledAt = Date.now() + DEFAULT_LEAD_MINUTES * 60_000;

    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafe: {
            placeId: shop.id,
            name: shop.name,
            address: shop.address,
            lat: shop.lat,
            lng: shop.lng,
          },
          altCafes: alts,
          scheduledAt,
          addresses,
          mode: agentMode,
        }),
      });
      if (!res.ok) {
        setFlash('error');
        return;
      }
      const json = (await res.json()) as { url: string };
      try {
        await navigator.clipboard.writeText(json.url);
      } catch {
        // Clipboard blocked — show error briefly so user knows to copy
        // manually from the address bar after we open it.
        window.open(json.url, '_blank');
      }
      track('proposal_created', { mode: agentMode, parties: addresses.length });
      setFlash('copied');
    } catch {
      setFlash('error');
    }
  };

  const label =
    flash === 'creating'
      ? t('propose.creating')
      : flash === 'copied'
        ? t('propose.copied')
        : flash === 'error'
          ? t('propose.failed')
          : t('propose.label');

  return (
    <button
      type="button"
      className={`${styles.button} ${flash === 'copied' ? styles.copied : ''}`}
      onClick={(e) => void handleClick(e)}
      disabled={flash === 'creating'}
      aria-label={label}
      title={t('propose.tooltip')}
    >
      <span aria-hidden>📨</span>
      <span className={styles.text}>{label}</span>
    </button>
  );
}
